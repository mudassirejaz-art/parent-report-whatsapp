"""Dispatch one durable attempt per real report recipient."""
import httpx
from cryptography.fernet import Fernet, InvalidToken


def run_live_batch(conn, settings, limit: int, client: httpx.Client):
    live = settings.whatsapp_live
    if not live or not settings.secure_cookies or not 1 <= limit <= 100:
        raise ValueError("Live worker requires production configuration and a bounded batch.")
    cipher = Fernet(settings.onboarding_key.encode())
    counts = {"accepted": 0, "unconfirmed": 0, "skipped": 0}
    for _ in range(limit):
        # Commit the attempt before calling Meta. A crash cannot trigger an automatic duplicate.
        with conn.transaction():
            job = conn.execute("select * from app_private.claim_live_delivery(%s,%s)",
                               (live.school_id, live.sender.phone_number_id)).fetchone()
        if job is None:
            break
        delivery, encrypted = job
        if encrypted is None:
            counts["skipped"] += 1
            continue
        message_id = None
        try:
            phone = cipher.decrypt(encrypted.encode()).decode()
            message_id = live.sender.send_template(client, phone, live.report_template, live.language,
                                                   tracking_id=str(delivery))
        except (InvalidToken, ValueError, RuntimeError):
            pass
        with conn.transaction():
            conn.execute("select app_private.finish_live_delivery(%s,%s,%s)",
                         (delivery, live.sender.phone_number_id, message_id))
        counts["accepted" if message_id else "unconfirmed"] += 1
    return counts
