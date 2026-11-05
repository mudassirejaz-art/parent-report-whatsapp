from uuid import uuid4

import psycopg
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def endpoint(env, action="delivery-review"):
    return f"/api/v1/exams/{env['ids']['exam']}/{action}"


def test_review_matches_queue_and_lists_one_run_after_replay(env):
    teacher = env["login"]("teacher_a")
    url = endpoint(env)
    response = teacher.get(url)
    assert response.status_code == 200, response.text
    review = response.json()
    assert review["is_simulation"] and review["blocker"] is None
    assert review["campaigns"] == []
    assert {row["reason"] for row in review["reports"]} == {"eligible"}
    assert all(set(row) == {"report_id", "student_name", "eligible_recipients", "reason"}
               for row in review["reports"])
    payload = {"idempotency_key": str(uuid4())}
    queue_url = endpoint(env, "simulate-reports")
    result = teacher.post(queue_url, json=payload).json()
    assert result["queued"] == sum(row["eligible_recipients"] for row in review["reports"]) == 2
    assert teacher.post(queue_url, json=payload).json() == result
    history = env["login"]("admin").get(url).json()["campaigns"]
    assert len(history) == 1
    assert history[0]["id"] == result["id"]
    assert history[0]["queued"] == history[0]["reports"] == 2
    assert set(history[0]) == {"id", "created_at", "queued", "reports"}


def test_review_explains_missing_consent_and_revoked_link(env):
    teacher = env["login"]("teacher_a")
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app_private.guardian_consents set withdrawn_at=now() where link_id=%s",
                     (env["ids"]["link_child_a"],))
        conn.execute("update app_private.guardian_links set revoked_at=now() where id=%s",
                     (env["ids"]["link_child_other"],))
    rows = teacher.get(endpoint(env)).json()["reports"]
    assert {row["reason"] for row in rows} == {"consent_missing", "no_guardian_link"}
    assert all(row["eligible_recipients"] == 0 for row in rows)
    result = teacher.post(endpoint(env, "simulate-reports"), json={"idempotency_key": str(uuid4())})
    assert result.status_code == 200
    assert result.json()["queued"] == 0


def test_review_enforces_access_and_class_sending_policy(env):
    url = endpoint(env)
    assert env["root"].get(url).status_code == 401
    for role in ("parent_a", "teacher_b", "foreign_admin"):
        assert env["login"](role).get(url).status_code == 404
    teacher = env["login"]("teacher_a")
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app.classes set sending_enabled=false where id=%s", (env["ids"]["class_a"],))
    review = teacher.get(url).json()
    assert review["blocker"] == "class_sending_disabled"
    assert {row["eligible_recipients"] for row in review["reports"]} == {0}
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app.classes set status='inactive' where id=%s", (env["ids"]["class_a"],))
    assert teacher.get(url).status_code == 404
    assert env["login"]("admin").get(url).json()["blocker"] == "class_sending_disabled"


def test_review_excludes_fixture_verification_when_local_mode_is_off(env):
    with TestClient(create_app(Settings(env["runtime"], pool_size=2))) as client:
        login = client.post("/api/v1/auth/login", json={
            key: env["accounts"]["teacher_a"][key] for key in ("email", "password")
        })
        assert login.status_code == 200
        rows = client.get(endpoint(env)).json()["reports"]
        assert {row["reason"] for row in rows} == {"guardian_unverified"}
        assert all(row["eligible_recipients"] == 0 for row in rows)
