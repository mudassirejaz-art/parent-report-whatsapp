# ParentReport

**New: local guardian onboarding.** Teacher-generated student invitations, separate parent registration or sibling linking, masked encrypted contacts and consent withdrawal are now available. This is explicitly local testing without an OTP provider. See [onboarding setup](backend/ONBOARDING.md) and [latest verification](backend/ONBOARDING-VERIFICATION.md).

School-to-parent progress reporting for Pakistani schools and academies. Frontend and backend share this repository while remaining separate applications.

```text
frontend/   React + TypeScript + Vite application, tests and verification evidence
backend/    Plain PostgreSQL database, SQL migrations, access tests and local scripts
```

## Run the frontend

Requires Node 20.19+ and npm (Node 22 or 24 recommended).

```sh
cd frontend
npm install
npm run dev
```

Vite prints the local preview URL. Build with `npm run build`, run unit tests with `npm test`. A pnpm lockfile is also included for the dependency versions used during local verification; pnpm users can run `pnpm install`, `pnpm dev`, `pnpm build` and `pnpm test` from `frontend/`.

The demo includes school-admin, class-teacher and separate parent portals; class permissions; guardian verification and consent simulation; exams and marks; private reports; attendance; school/class notices and private student notes; homework; leave requests; branding; English/Roman Urdu interface; and a 20-second Remotion product tour. Direct parent–teacher chat has been removed.

The connected `/workspace` now uses real FastAPI password sessions and PostgreSQL APIs. The original demo routes remain browser-local mock experiences. Local seed records are fictional; guardian phone verification and WhatsApp delivery are not real integrations yet.

See [frontend instructions](frontend/README.md) and [frontend verification results](frontend/verification/RESULTS.md) for role accounts, routes, run commands and limitations.

## PostgreSQL database

The backend uses plain PostgreSQL 17+, with 25 domain tables plus private session/login-counter tables. FastAPI exposes typed admin/teacher/parent routes, scoped reads and guarded transactional writes. Direct parent–teacher chat remains removed. Runtime has no blanket table write grants.

On Windows, from this repository root:

```powershell
node backend/scripts/Download-Postgres.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-LocalPostgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
```

Local database: `parentreport` at `127.0.0.1:55432`. Database credentials and fictional account passwords are generated locally and ignored by Git. The database/API are local; source publication does not deploy a hosted service.

## Run the connected backend

From the repository root, after PostgreSQL is started and migrations applied:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python.exe backend/scripts/seed_local.py
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-Backend.ps1
```

Start the frontend in another terminal and open **http://127.0.0.1:5173/workspace**. Generated local login accounts are in `backend/.local/accounts.json`. API docs: **http://127.0.0.1:8000/docs**.

For fictional parent links/local verification, set `APP_LOCAL_ONBOARDING=true` in the private backend/.env and restart the API. Production mode rejects that flag. The default in .env.example is disabled; no OTP or WhatsApp provider is configured. All eight migrations must be applied.

See [API setup and endpoint map](backend/API.md), [database access contract](backend/README.md), and [actual verification](backend/API-VERIFICATION.md): **25 API tests, 50 database assertions, 49 frontend unit tests and 21 connected browser checks passed**; production frontend build passed.
