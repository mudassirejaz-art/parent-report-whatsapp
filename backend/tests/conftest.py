import os
from pathlib import Path
import sys
from uuid import uuid4
import pytest
import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
values = dotenv_values(ROOT / ".env")
OWNER = os.environ.get("TEST_MIGRATION_DATABASE_URL") or values.get("MIGRATION_DATABASE_URL")
RUNTIME = os.environ.get("TEST_DATABASE_URL") or values.get("DATABASE_URL")
if not OWNER or not RUNTIME:
    raise RuntimeError("Local PostgreSQL and backend/.env are required for API integration tests.")
# main's unused default app may be imported safely; it never starts a connection.
os.environ.setdefault("DATABASE_URL",RUNTIME)
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings
from app.seed_local import seed
from cryptography.fernet import Fernet

@pytest.fixture
def env():
    # Every test gets its own database. The real parentreport database is untouched.
    name = "parentreport_test_" + uuid4().hex
    admin = make_conninfo(OWNER,dbname="postgres")
    with psycopg.connect(admin,autocommit=True) as conn:
        conn.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    owner_url = make_conninfo(OWNER,dbname=name)
    runtime_url = make_conninfo(RUNTIME,dbname=name)
    try:
        with psycopg.connect(owner_url) as conn:
            for file in sorted((ROOT/"db"/"migrations").glob("*.sql")):
                conn.execute(file.read_text(encoding="utf-8"))
            manifest=seed(conn)
        app=create_app(Settings(runtime_url,pool_size=3,local_onboarding=True,onboarding_key=Fernet.generate_key().decode(),registration_enabled=True))
        clients=[]
        with TestClient(app) as root:
            def login(role):
                client=TestClient(app)
                account=manifest["accounts"][role]
                response=client.post("/api/v1/auth/login",json={"email":account["email"],"password":account["password"]})
                assert response.status_code==200,response.text
                client.headers["X-CSRF-Token"]=response.json()["csrf_token"]
                clients.append(client)
                return client
            yield {"root":root,"login":login,"ids":manifest["ids"],"accounts":manifest["accounts"],"owner":owner_url,"runtime":runtime_url,"app":app}
        for client in clients:
            client.close()
    finally:
        # Only a freshly-generated test database can ever reach this teardown.
        assert name.startswith("parentreport_test_") and len(name)==50
        with psycopg.connect(admin,autocommit=True) as conn:
            conn.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))

