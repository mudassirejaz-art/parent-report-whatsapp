"""Apply checked PostgreSQL migrations on Windows or Linux."""
import hashlib
import os
from pathlib import Path

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def main():
    values = dotenv_values(ROOT / ".env")
    url = os.environ.get("MIGRATION_DATABASE_URL") or values.get("MIGRATION_DATABASE_URL")
    if not url:
        raise SystemExit("Set MIGRATION_DATABASE_URL before running migrations.")
    with psycopg.connect(url) as conn:
        conn.execute("select pg_advisory_xact_lock(725109318)")
        conn.execute("""create table if not exists public.parentreport_migrations
            (version text primary key, sha256 text not null, applied_at timestamptz not null default now())""")
        conn.execute("revoke all on public.parentreport_migrations from public")
        applied = dict(conn.execute("select version,sha256 from public.parentreport_migrations").fetchall())
        for path in sorted((ROOT / "db" / "migrations").glob("*.sql")):
            raw = path.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            if path.name in applied:
                if applied[path.name] != digest:
                    raise SystemExit(f"Applied migration checksum mismatch: {path.name}")
                continue
            conn.execute(raw.decode("utf-8"))
            conn.execute("insert into public.parentreport_migrations(version,sha256) values(%s,%s)",
                         (path.name, digest))
    print("Database migrations are current.")


if __name__ == "__main__":
    main()
