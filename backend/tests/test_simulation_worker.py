from uuid import uuid4

import psycopg

from app.simulation_worker import run_batch


def queue(env):
    teacher = env["login"]("teacher_a")
    exam = "/api/v1/exams/" + env["ids"]["exam"]
    response = teacher.post(exam + "/simulate-reports", json={"idempotency_key": str(uuid4())})
    assert response.status_code == 200 and response.json()["queued"] == 2
    return teacher, exam, response.json()["id"]


def make_due(env):
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app.report_deliveries set simulation_retry_at=now() where is_simulation")


def test_mock_retry_and_history(env):
    teacher, exam, campaign = queue(env)
    with psycopg.connect(env["runtime"], autocommit=True) as worker:
        assert run_batch(worker, 20, "first") == {"retry_scheduled": 2}
        assert run_batch(worker, 20, "first") == {}
        history = teacher.get(exam + "/delivery-review").json()["campaigns"][0]
        assert history["id"] == campaign and history["retrying"] == history["queued"] == 2
        make_due(env)
        assert run_batch(worker, 20, "first") == {"delivered": 2}
        assert run_batch(worker, 20) == {}
    history = teacher.get(exam + "/delivery-review").json()["campaigns"][0]
    assert history["delivered"] == 2 and history["queued"] == history["retrying"] == 0
    with psycopg.connect(env["owner"]) as conn:
        assert conn.execute("""select count(*) from app.report_deliveries
            where is_simulation and status='delivered' and simulation_attempts=2
              and provider_message_id is null""").fetchone()[0] == 2


def test_mock_rechecks_consent_and_limits_failures(env):
    teacher, exam, _ = queue(env)
    with psycopg.connect(env["owner"]) as conn:
        conn.execute("update app_private.guardian_consents set withdrawn_at=now() where link_id=%s",
                     (env["ids"]["link_child_a"],))
    with psycopg.connect(env["runtime"], autocommit=True) as worker:
        assert run_batch(worker, 20, "always") == {"failed": 1, "retry_scheduled": 1}
        make_due(env)
        assert run_batch(worker, 20, "always") == {"retry_scheduled": 1}
        make_due(env)
        assert run_batch(worker, 20, "always") == {"failed": 1}
        assert run_batch(worker, 20) == {}
    history = teacher.get(exam + "/delivery-review").json()["campaigns"][0]
    assert history["skipped"] == history["failed"] == 1
    assert history["queued"] == 0


def test_locked_delivery_is_not_claimed_by_another_worker(env):
    queue(env)
    with psycopg.connect(env["runtime"], autocommit=True) as first, \
         psycopg.connect(env["runtime"], autocommit=True) as second:
        with first.transaction():
            job = first.execute("select * from app_private.claim_simulation_delivery()").fetchone()
            assert job is not None and job[2] is True
            assert run_batch(second, 20) == {"delivered": 1}
            assert first.execute(
                "select app_private.finish_simulation_delivery(%s,'delivered')", (job[0],)
            ).fetchone()[0] == "delivered"
        assert run_batch(second, 20) == {}
