"""Meta Cloud API transport and authenticated delivery callbacks."""

import hashlib
import hmac
import json
import re
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool

CALLBACK = "/api/v1/webhooks/whatsapp"
MAX_BODY = 1024 * 1024
STATUSES = {"sent", "delivered", "read", "failed"}


def phone_id_valid(value: str) -> bool:
    return re.fullmatch(r"[0-9]{1,32}", value) is not None


@dataclass(frozen=True)
class WebhookSettings:
    phone_number_id: str
    verify_token: str = field(repr=False)
    app_secret: str = field(repr=False)

    def __post_init__(self):
        if not phone_id_valid(self.phone_number_id) or not self.verify_token or not self.app_secret:
            raise ValueError("WhatsApp webhook requires a phone number ID, verify token and app secret.")


@dataclass(frozen=True)
class CloudSender:
    version: str
    phone_number_id: str
    access_token: str = field(repr=False)

    def __post_init__(self):
        if not re.fullmatch(r"v[0-9]+\.[0-9]+", self.version) or not phone_id_valid(self.phone_number_id) or not self.access_token:
            raise ValueError("Configure the Meta API version, phone number ID and access token.")

    def send_template(self, client: httpx.Client, recipient: str, template: str, language: str) -> str:
        """Send a pre-approved template with no dynamic fields."""
        if not re.fullmatch(r"\+[1-9][0-9]{6,14}", recipient):
            raise ValueError("Recipient must be in international +countrycode format.")
        if not re.fullmatch(r"[a-z0-9_]{1,512}", template) or not re.fullmatch(r"[a-z]{2,3}(?:_[A-Z]{2})?", language):
            raise ValueError("Invalid template name or language.")
        try:
            result = client.post(
                f"https://graph.facebook.com/{self.version}/{self.phone_number_id}/messages",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": recipient[1:],
                    "type": "template",
                    "template": {"name": template, "language": {"code": language}},
                },
                timeout=10,
                follow_redirects=False,
            )
        except httpx.RequestError:
            raise RuntimeError("Meta response unavailable. Check delivery before retrying.") from None
        if not result.is_success:
            raise RuntimeError(f"Meta rejected the template request (HTTP {result.status_code}).")
        try:
            message_id = result.json()["messages"][0]["id"]
        except (ValueError, KeyError, IndexError, TypeError):
            message_id = None
        if not valid_message_id(message_id):
            raise RuntimeError("Meta acceptance could not be confirmed. Check delivery before retrying.")
        return message_id


def valid_message_id(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"wamid\.[!-~]{1,506}", value) is not None


def objects(value):
    if isinstance(value, list):
        yield from (item for item in value if isinstance(item, dict))


def delivery_events(payload, phone_number_id):
    if not isinstance(payload, dict) or payload.get("object") != "whatsapp_business_account":
        return
    for entry in objects(payload.get("entry")):
        for change in objects(entry.get("changes")):
            value = change.get("value")
            if change.get("field") != "messages" or not isinstance(value, dict):
                continue
            metadata = value.get("metadata")
            if not isinstance(metadata, dict) or metadata.get("phone_number_id") != phone_number_id:
                continue
            for event in objects(value.get("statuses")):
                message_id, status = event.get("id"), event.get("status")
                if valid_message_id(message_id) and isinstance(status, str) and status in STATUSES:
                    yield message_id, status


def register_webhook(app, config: WebhookSettings | None, pool):
    def enabled():
        if config is None:
            raise HTTPException(404, "Webhook unavailable.")
        return config

    @app.get(CALLBACK, include_in_schema=False)
    def verify(request: Request):
        settings = enabled()
        query = request.query_params
        challenge = query.get("hub.challenge", "")
        token = query.get("hub.verify_token", "")
        if (
            query.get("hub.mode") != "subscribe"
            or not re.fullmatch(r"[0-9]{1,128}", challenge)
            or not hmac.compare_digest(token.encode(), settings.verify_token.encode())
        ):
            raise HTTPException(403, "Webhook verification failed.")
        return PlainTextResponse(challenge)

    def record(phone_number_id, events):
        with pool.connection() as conn:
            for message_id, status in events:
                conn.execute("select app_private.record_whatsapp_status(%s,%s,%s)",
                             (phone_number_id, message_id, status))

    @app.post(CALLBACK, include_in_schema=False)
    async def receive(request: Request):
        settings = enabled()
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_BODY:
                raise HTTPException(413, "Webhook body too large.")
            body.extend(chunk)
        expected = "sha256=" + hmac.new(settings.app_secret.encode(), body, hashlib.sha256).hexdigest()
        supplied = request.headers.get("x-hub-signature-256", "")
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(403, "Invalid webhook signature.")
        try:
            payload = json.loads(body)
        except (ValueError, RecursionError):
            raise HTTPException(400, "Invalid webhook payload.") from None
        events = sorted(set(delivery_events(payload, settings.phone_number_id)))
        if events:
            await run_in_threadpool(record, settings.phone_number_id, events)
        return {"received": True}
