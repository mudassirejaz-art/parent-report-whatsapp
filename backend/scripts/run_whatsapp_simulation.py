"""Run a bounded batch of local WhatsApp simulations."""

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings
from app.simulation_worker import run_batch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50, choices=range(1, 501), metavar="1-500")
    parser.add_argument("--fail", choices=("none", "first", "always"), default="none")
    args = parser.parse_args()
    if os.environ.get("APP_ENV", "").lower() == "production":
        parser.error("The simulation worker is local only.")
    settings = Settings.load()
    if settings.secure_cookies or not settings.local_onboarding:
        parser.error("The simulation worker requires local onboarding mode.")
    with psycopg.connect(settings.database_url, autocommit=True, connect_timeout=5) as conn:
        if conn.execute("select rolsuper or rolbypassrls from pg_roles where rolname=current_user").fetchone()[0]:
            parser.error("Use the restricted API database role.")
        print(json.dumps({"is_simulation": True, **run_batch(conn, args.limit, args.fail)}))


if __name__ == "__main__":
    main()
