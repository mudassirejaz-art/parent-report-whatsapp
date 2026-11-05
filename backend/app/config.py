from dataclasses import dataclass, field
from pathlib import Path
import os
from urllib.parse import urlparse
from dotenv import dotenv_values
from uuid import UUID
from .whatsapp import CloudSender, LiveWhatsApp, WebhookSettings

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class Settings:
    database_url: str
    origins: list[str] = field(default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000"])
    secure_cookies: bool = False
    cookie_name: str = "pr_session"
    pool_size: int = 8
    local_onboarding: bool = False
    onboarding_key: str = ""
    registration_enabled: bool = False
    local_recovery: bool = False
    whatsapp_webhook: WebhookSettings | None = None
    whatsapp_live: LiveWhatsApp | None = None

    @classmethod
    def load(cls):
        local = dotenv_values(ROOT / ".env")
        def value(key, default=""):
            return os.environ.get(key, local.get(key) or default)
        url = value("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is required. See backend/README.md.")
        environment = value("APP_ENV", "development").lower()
        if environment not in {"development", "test", "production"}:
            raise RuntimeError("APP_ENV must be development, test or production.")
        production = environment == "production"
        origins = [x.strip() for x in value("APP_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000").split(",") if x.strip()]
        if not origins or "*" in origins or (production and any(urlparse(x).scheme != "https" for x in origins)):
            raise RuntimeError("Configure explicit APP_ORIGINS (HTTPS in production).")
        local_onboarding = value("APP_LOCAL_ONBOARDING", "false").lower() == "true"
        if production and local_onboarding:
            raise RuntimeError("Local verification is forbidden in production.")
        local_recovery = value("APP_LOCAL_RECOVERY", "false").lower() == "true"
        if production and local_recovery:
            raise RuntimeError("Local password recovery is forbidden in production.")
        key = value("ONBOARDING_KEY")
        if local_onboarding and not key:
            from cryptography.fernet import Fernet
            folder = ROOT / ".local"
            folder.mkdir(exist_ok=True)
            keyfile = folder / "onboarding.key"
            try:
                with keyfile.open("xb") as output:
                    output.write(Fernet.generate_key())
            except FileExistsError:
                pass
            key = keyfile.read_text(encoding="ascii").strip()
        if local_onboarding:
            from cryptography.fernet import Fernet
            Fernet(key.encode())  # Fail early on an invalid key, never silently replace it.
        registration = value("APP_SCHOOL_REGISTRATION", "false" if production else "true").lower() == "true"
        webhook = None
        if value("APP_WHATSAPP_WEBHOOK", "false").lower() == "true":
            webhook = WebhookSettings(value("WHATSAPP_PHONE_NUMBER_ID"),
                                      value("WHATSAPP_VERIFY_TOKEN"), value("WHATSAPP_APP_SECRET"))
        live = None
        if value("APP_WHATSAPP_LIVE", "false").lower() == "true":
            if not production or not webhook or not key:
                raise RuntimeError("Live WhatsApp requires production HTTPS, webhook settings and ONBOARDING_KEY.")
            from cryptography.fernet import Fernet
            Fernet(key.encode())
            otp, report = value("WHATSAPP_OTP_TEMPLATE"), value("WHATSAPP_REPORT_TEMPLATE")
            if not otp or not report or otp == report:
                raise RuntimeError("Configure separate approved OTP and report templates.")
            live = LiveWhatsApp(
                CloudSender(value("WHATSAPP_GRAPH_VERSION"), webhook.phone_number_id, value("WHATSAPP_ACCESS_TOKEN")),
                str(UUID(value("WHATSAPP_SCHOOL_ID"))), otp, report, value("WHATSAPP_TEMPLATE_LANGUAGE", "en_US"),
            )
        return cls(url, origins, production, local_onboarding=local_onboarding, onboarding_key=key,registration_enabled=registration,local_recovery=local_recovery,whatsapp_webhook=webhook,whatsapp_live=live)

