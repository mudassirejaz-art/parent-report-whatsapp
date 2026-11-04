# ParentReport

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

Frontend records remain fictional and browser-local. Authentication, OTP and WhatsApp delivery in the UI are simulations. The database foundation is implemented separately; HTTP endpoints and frontend integration are the next backend milestone.

See [frontend instructions](frontend/README.md) and [frontend verification results](frontend/verification/RESULTS.md) for role accounts, routes, run commands and limitations.

## PostgreSQL database

The backend uses plain PostgreSQL 17+, with 25 domain tables, tenant/class/parent read policies, guardian verification and consent records, immutable report versions, audit events, attendance, notices, homework and leave requests. Direct parent–teacher chat remains outside scope. Runtime writes stay closed until guarded API endpoints are implemented.

On Windows, from this repository root:

```powershell
node backend/scripts/Download-Postgres.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-LocalPostgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
```

Local database: `parentreport` at `127.0.0.1:55432`. Credentials are generated locally and ignored by Git. See [backend setup and access contract](backend/README.md) and [database verification](backend/VERIFICATION.md): 50 PostgreSQL assertions passed. The database itself is local; source publication does not deploy a hosted service.
