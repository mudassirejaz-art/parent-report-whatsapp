import hmac
import json
from uuid import uuid4

import httpx
import psycopg
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import Settings
from app.live_worker import run_live_batch
from app.main import create_app
from app.whatsapp import CALLBACK, CloudSender, LiveWhatsApp, WebhookSettings


def test_copy_code_template_contains_body_and_button():
    def meta(request):
        template = json.loads(request.content)["template"]
        body, button = template["components"]
        assert body == {"type": "body", "parameters": [{"type": "text", "text": "012345"}]}
        assert button == {"type": "button", "sub_type": "url", "index": "0",
                          "parameters": [{"type": "text", "text": "012345"}]}
        return httpx.Response(200, json={"messages": [{"id": "wamid.otp"}]})

    with httpx.Client(transport=httpx.MockTransport(meta)) as client:
        sender = CloudSender("v99.0", "123", "fake-token")
        assert sender.send_template(client, "+923000000001", "pilot_otp", "en_US", code="012345") == "wamid.otp"


@pytest.mark.parametrize("choice", ["send", "withdraw", "no_consent", "timeout"])
def test_pilot_otp_consent_and_worker(env, monkeypatch, choice):
    code = None
    real_send = CloudSender.send_template

    def capture(self, client, recipient, template, language, **options):
        nonlocal code
        if template == "pilot_otp":
            assert recipient == "+923000000001"
            code = options["code"]
            return "wamid.otp"
        return real_send(self, client, recipient, template, language, **options)

    monkeypatch.setattr(CloudSender, "send_template", capture)
    ids = env["ids"]
    sender = CloudSender("v99.0", "123", "fake-token")
    settings = Settings(env["runtime"], origins=["https://testserver"], secure_cookies=True,
                        onboarding_key=Fernet.generate_key().decode(),
                        whatsapp_webhook=WebhookSettings("123", "verify", "secret"),
                        whatsapp_live=LiveWhatsApp(sender, ids["school"], "pilot_otp", "pilot_report", "en_US"))
    with TestClient(create_app(settings), base_url="https://testserver") as client:
        teacher = env["accounts"]["teacher_a"]
        login = client.post("/api/v1/auth/login", json={key: teacher[key] for key in ("email", "password")})
        headers = {"X-CSRF-Token": login.json()["csrf_token"]}
        cls = "/api/v1/classes/" + ids["class_a"]
        created = client.post(cls + "/students", headers=headers, json={
            "name": "Pilot Fixture Child", "admission_number": "PILOT", "roll_number": "PILOT"})
        assert created.status_code == 201, created.text
        student = next(row for row in client.get(cls).json()["students"] if row["admission_number"] == "PILOT")
        invite = client.post(cls + "/guardian-invites", headers=headers,
                             json={"enrollment_id": student["enrollment_id"]})
        assert invite.status_code == 201, invite.text
        submission = client.post("/api/v1/onboarding/submit", json={
            "token": invite.json()["token"], "admission_number": "PILOT",
            "guardian_name": "Pilot Fixture Guardian", "phone": "+923000000001"})
        assert submission.status_code == 201 and code, submission.text
        token = submission.json()["token"]
        info = client.post("/api/v1/onboarding/verification-info", json={"token": token})
        assert not info.json()["is_simulation"] and "local_test_code" not in info.json()
        payload = {"token": token, "code": code, "consent": choice != "no_consent",
                   "email": "pilot@example.test", "password": "Fictional-password-123"}
        wrong = "000000" if code != "000000" else "111111"
        assert client.post("/api/v1/onboarding/register", json={**payload, "code": wrong}).status_code == 400
        verified = client.post("/api/v1/onboarding/register", json=payload)
        assert verified.status_code == 200 and not verified.json()["is_simulation"], verified.text
        assert client.post("/api/v1/onboarding/register", json=payload).status_code == 400

        with psycopg.connect(env["owner"]) as conn:
            conn.execute("""insert into app.marks(school_id,class_id,exam_id,subject_id,enrollment_id,maximum_marks,obtained)
                values(%s,%s,%s,%s,%s,100,70)""",
                         (ids["school"], ids["class_a"], ids["exam"], ids["subject"], student["enrollment_id"]))
            conn.execute("""insert into app.report_versions(school_id,class_id,exam_id,enrollment_id,student_id,version,snapshot,published_by)
                select school_id,class_id,exam_id,%s,%s,1,snapshot,published_by from app.report_versions where id=%s""",
                         (student["enrollment_id"], student["student_id"], ids["report_a"]))

        exam = "/api/v1/exams/" + ids["exam"]
        request = {"idempotency_key": str(uuid4())}
        queued = client.post(exam + "/send-reports", json=request, headers=headers)
        assert queued.status_code == 200, queued.text
        assert queued.json()["queued"] == (0 if choice == "no_consent" else 1)
        assert client.post(exam + "/send-reports", json=request, headers=headers).json() == queued.json()
        duplicate = client.post(exam + "/send-reports", json={"idempotency_key": str(uuid4())}, headers=headers)
        assert duplicate.json()["queued"] == 0
        if choice == "withdraw":
            with psycopg.connect(env["owner"]) as conn:
                conn.execute("update app_private.guardian_consents set withdrawn_at=now() where student_id=%s",
                             (student["student_id"],))

        def meta(request):
            assert choice in ("send", "timeout")
            outbound = json.loads(request.content)
            assert outbound["to"] == "923000000001" and outbound["template"]["name"] == "pilot_report"
            tracking = outbound["biz_opaque_callback_data"]
            if choice == "timeout":
                raise httpx.ReadTimeout("Mock response lost", request=request)
            body = json.dumps({"object": "whatsapp_business_account", "entry": [{"changes": [{
                "field": "messages", "value": {"metadata": {"phone_number_id": "123"},
                "statuses": [{"id": "wamid.pilot", "status": "delivered", "biz_opaque_callback_data": tracking}]},
            }]}]}).encode()
            signature = "sha256=" + hmac.digest(b"secret", body, "sha256").hex()
            assert client.post(CALLBACK, content=body, headers={"X-Hub-Signature-256": signature}).status_code == 200
            return httpx.Response(200, json={"messages": [{"id": "wamid.pilot"}]})

        with psycopg.connect(env["runtime"], autocommit=True) as conn, \
             httpx.Client(transport=httpx.MockTransport(meta)) as transport:
            result = run_live_batch(conn, settings, 10, transport)
            assert result["accepted"] == (choice == "send")
            assert result["skipped"] == (choice == "withdraw")
            assert result["unconfirmed"] == (choice == "timeout")
            assert not any(run_live_batch(conn, settings, 10, transport).values())
        history = client.get(exam + "/delivery-review").json()
        assert history["live_status"]["delivered"] == (choice == "send")
        assert history["live_status"]["failed"] == (choice == "withdraw")
        assert history["live_status"]["unconfirmed"] == (choice == "timeout")
