"""Run the production WhatsApp report worker."""
import argparse
import json
import sys
import time
from pathlib import Path

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings
from app.live_worker import run_live_batch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true")
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    settings = Settings.load()
    if not args.send or not settings.whatsapp_live:
        parser.error("Explicit --send and production WhatsApp configuration are required.")
    with psycopg.connect(settings.database_url, autocommit=True, connect_timeout=5) as conn, \
         httpx.Client(trust_env=False) as client:
        if conn.execute("select rolsuper or rolbypassrls from pg_roles where rolname=current_user").fetchone()[0]:
            parser.error("Use the restricted API database role.")
        while True:
            result = run_live_batch(conn, settings, 50, client)
            if any(result.values()) or not args.watch:
                print(json.dumps(result), flush=True)
            if not args.watch:
                break
            time.sleep(5)


if __name__ == "__main__":
    main()
