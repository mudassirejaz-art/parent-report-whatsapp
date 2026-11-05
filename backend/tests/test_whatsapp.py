import hmac
import json
from uuid import uuid4

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.whatsapp import CALLBACK, CloudSender, WebhookSettings


def test_sender_uses_meta_template_endpoint():
    def transport(request):
        assert str(request.url) == "https://graph.facebook.com/v99.0/123/messages"
        assert request.headers["authorization"] == "Bearer fake-token"
        assert json.loads(request.content) == {
            "messaging_product": "whatsapp", "to": "12025550123", "type": "template",
            "template": {"name": "hello_world", "language": {"code": "en_US"}},
        }
        return httpx.Response(200, json={"messages": [{"id": "wamid.example"}]})

    sender = CloudSender("v99.0", "123", "fake-token")
    with httpx.Client(transport=httpx.MockTransport(transport)) as client:
        assert sender.send_template(client, "+12025550123", "hello_world", "en_US") == "wamid.example"
        with pytest.raises(ValueError, match="international"):
            sender.send_template(client, "not-a-number", "hello_world", "en_US")


def test_sender_redacts_provider_response_and_does_not_retry():
    calls = []

    def transport(request):
        calls.append(request)
        return httpx.Response(429, text="provider body contains private values")

    with httpx.Client(transport=httpx.MockTransport(transport)) as client:
        with pytest.raises(RuntimeError, match=r"^Meta rejected the template request \(HTTP 429\)\.$"):
            CloudSender("v99.0", "123", "fake-token").send_template(
                client, "+12025550123", "hello_world", "en_US"
            )
    assert len(calls) == 1


def test_webhook_is_off_by_default(env):
    assert env["root"].get(CALLBACK).status_code == 404
    assert env["root"].post(CALLBACK, json={}).status_code == 404


def test_callback_authentication_and_monotonic_status(env):
    ids = env["ids"]
    sender = "123"
    actor = env["accounts"]["teacher_a"]["id"]
    message_id = "wamid.fixture"
    with psycopg.connect(env["owner"]) as conn:
        campaign = conn.execute(
            """insert into app_private.report_campaigns
            (school_id,class_id,exam_id,idempotency_key,created_by,is_simulation)
            values(%s,%s,%s,%s,%s,false) returning id""",
            (ids["school"], ids["class_a"], ids["exam"], str(uuid4()), actor),
        ).fetchone()[0]
        delivery = conn.execute(
            """insert into app.report_deliveries
            (school_id,class_id,campaign_id,report_id,student_id,guardian_link_id,
             is_simulation,provider_message_id,provider_phone_number_id)
            values(%s,%s,%s,%s,%s,%s,false,%s,%s) returning id""",
            (ids["school"], ids["class_a"], campaign, ids["report_a"], ids["child_a"],
             ids["link_child_a"], message_id, sender),
        ).fetchone()[0]

    def stored():
        with psycopg.connect(env["owner"]) as conn:
            return conn.execute(
                "select status, updated_at, failure_reason from app.report_deliveries where id=%s", (delivery,)
            ).fetchone()

    settings = Settings(env["runtime"], whatsapp_webhook=WebhookSettings(sender, "verify-secret", "app-secret"))
    with TestClient(create_app(settings)) as client:
        query = {"hub.mode": "subscribe", "hub.verify_token": "verify-secret", "hub.challenge": "123456"}
        handshake = client.get(CALLBACK, params=query)
        assert handshake.status_code == 200 and handshake.text == "123456"
        assert client.get(CALLBACK, params={**query, "hub.verify_token": "wrong"}).status_code == 403

        def send(status, phone=sender, secret=b"app-secret", message=message_id):
            body = json.dumps({"object": "whatsapp_business_account", "entry": [{"changes": [{
                "field": "messages", "value": {"metadata": {"phone_number_id": phone},
                "statuses": [{"id": message, "status": status, "recipient_id": "not retained"}]},
            }]}]}).encode()
            signature = "sha256=" + hmac.digest(secret, body, "sha256").hex()
            return client.post(CALLBACK, content=body, headers={"X-Hub-Signature-256": signature})

        assert send("delivered", secret=b"wrong").status_code == 403
        assert send("delivered", phone="999").status_code == 200
        assert send("delivered", message="wamid.unknown").status_code == 200
        assert stored()[0] == "queued"
        assert send("sent").status_code == 200
        assert stored()[0] == "sent"
        assert send("failed").status_code == 200
        assert stored()[::2] == ("failed", "whatsapp_delivery_failed")
        assert send("read").status_code == 200
        final = stored()
        assert final[::2] == ("read", None)
        assert send("sent").status_code == send("read").status_code == 200
        assert stored() == final
