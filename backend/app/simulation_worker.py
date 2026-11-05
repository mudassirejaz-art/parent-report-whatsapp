"""Process fictional delivery jobs without network access or contact data."""

from collections import Counter

import httpx

from .whatsapp import CloudSender


def run_batch(conn, limit: int, failure_mode: str = "none") -> dict[str, int]:
    if not 1 <= limit <= 500 or failure_mode not in {"none", "first", "always"}:
        raise ValueError("Invalid simulation worker options.")
    counts: Counter[str] = Counter()
    sender = CloudSender("v99.0", "123", "local-mock-token")
    for _ in range(limit):
        with conn.transaction():
            job = conn.execute("select * from app_private.claim_simulation_delivery()").fetchone()
            if job is None:
                break
            delivery_id, attempts, eligible = job
            if not eligible:
                outcome = "ineligible"
            else:
                fails = failure_mode == "always" or (failure_mode == "first" and attempts == 0)

                def mock_response(request):
                    if fails:
                        return httpx.Response(503)
                    return httpx.Response(200, json={"messages": [{"id": "wamid.local_mock"}]})

                with httpx.Client(transport=httpx.MockTransport(mock_response), trust_env=False) as client:
                    try:
                        sender.send_template(client, "+12025550123", "hello_world", "en_US")
                        outcome = "delivered"
                    except RuntimeError:
                        outcome = "temporary_failure"
            status = conn.execute(
                "select app_private.finish_simulation_delivery(%s,%s)", (delivery_id, outcome)
            ).fetchone()[0]
            if status is None:
                raise RuntimeError("Simulation job could not be completed.")
        counts["retry_scheduled" if status == "queued" else status] += 1
    return dict(counts)
