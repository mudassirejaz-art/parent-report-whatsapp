from dataclasses import dataclass, field
from pathlib import Path
import os
from urllib.parse import urlparse
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class Settings:
    database_url: str
    origins: list[str] = field(default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000"])
    secure_cookies: bool = False
    cookie_name: str = "pr_session"
    pool_size: int = 8

    @classmethod
    def load(cls):
        local = dotenv_values(ROOT / ".env")
        def value(key, default=""):
            return os.environ.get(key, local.get(key) or default)
        url = value("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is required. See backend/README.md.")
        production = value("APP_ENV", "development") == "production"
        origins = [x.strip() for x in value("APP_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000").split(",") if x.strip()]
        if not origins or "*" in origins or (production and any(urlparse(x).scheme != "https" for x in origins)):
            raise RuntimeError("Configure explicit APP_ORIGINS (HTTPS in production).")
        return cls(url, origins, production)

