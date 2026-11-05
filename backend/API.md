# Connected API workspace

**School setup:** Self-registration, admin school profiles and private PostgreSQL logo uploads are now implemented. See [SCHOOLS.md](SCHOOLS.md) and [latest verification](SCHOOLS-VERIFICATION.md).

**Local guardian onboarding is now available:** See [ONBOARDING.md](ONBOARDING.md) for the teacher → student → separate parent simulation, secure contact storage and consent controls. APP_LOCAL_ONBOARDING must be explicitly enabled for fictional parent fixtures and simulated links.

The app now has a real FastAPI/PostgreSQL workspace at **/workspace**. Existing demo routes remain browser-local and use the demo role switcher. The connected workspace requires a real local password session; changing demo state cannot grant access.

## Setup

Python 3.12+ and the PostgreSQL setup in [README.md](README.md) are required. From the repository root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-LocalPostgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
backend/.venv/Scripts/python.exe backend/scripts/seed_local.py
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-Backend.ps1
```

In another terminal start Vite on port 5173. In the GitHub monorepo run frontend commands from `frontend/`; in the original local workspace run them from its root.

```sh
npm install
npm run dev -- --port 5173 --strictPort
```

- Workspace: **http://127.0.0.1:5173/workspace**
- OpenAPI/docs: **http://127.0.0.1:8000/docs**
- Health: **http://127.0.0.1:8000/health**
- Generated login emails/passwords: **backend/.local/accounts.json**, ignored by Git. The seed preserves existing fixture accounts on rerun.

The seed creates explicitly fictional admin, Teacher A/B, Parent A/B and separate-school accounts. Parent A links to two children; Parent B has another child in the same class. Passwords are real Argon2 hashes, but guardian contacts, verification and consent are **synthetic development fixtures**. No OTP, real phone-control check or outbound message is implied.

## Supported workflows

Admin creates classes, sets activation and sending policy, creates teachers and controls assignment/suspension. Teachers open only active assigned class workspaces, add students, create multi-subject exams, save marks transactionally and publish immutable report cards. Attendance, class/private-student notices, homework and leave decisions are connected.

Parents see only verified linked children, published report snapshots/print views, attendance and appropriate notices. They acknowledge notices, mark homework checked and submit leave requests. Removing a teacher assignment or deactivating a class blocks teacher access even with an existing login.

WhatsApp queue simulation is idempotent and checks report/guardian/consent eligibility; it never calls a provider or records a real provider ID. Direct parent–teacher chat remains removed.

## Endpoint map

All paths use `/api/v1`. Interactive docs provide the full typed request schemas.

| Routes | Purpose |
| --- | --- |
| POST /auth/login, GET /auth/me, POST /auth/logout | Password login, current session/CSRF and logout |
| GET /schools, GET/POST /classes, GET/PATCH /classes/{id} | School/class reads, creation and activation |
| GET /schools/{id}/teachers, POST /teachers | Admin teacher management |
| PATCH /teachers/{id}/access, PUT /classes/{id}/assignment | Suspend/restore and assign/revoke |
| POST /classes/{id}/students | Student + enrollment transaction |
| POST /classes/{id}/exams, GET /exams/{id} | Multi-subject exams and staff marks workspace |
| PUT /exams/{id}/marks, POST /exams/{id}/publish | Validated marks and immutable report publication |
| GET /exams/{id}/delivery-review | Staff-only eligibility by published report and latest 20 simulation runs |
| POST /exams/{id}/simulate-reports | Simulated queue with idempotency key |
| GET/PUT /classes/{id}/attendance | Daily scoped attendance |
| GET/POST /notices, POST /notices/{id}/acknowledge | Scoped notices and acknowledgement |
| GET /homework, POST /classes/{id}/homework, POST /homework/{id}/complete | Tasks and per-child checking |
| GET/POST /leave-requests, PATCH /leave-requests/{id} | Parent requests and teacher/admin decisions |
| GET /reports, GET /reports/{id} | Scoped published snapshots |
| GET /me/children, GET /me/children/{id}/attendance | Verified parent ownership |

Missing/expired sessions return 401; inaccessible resources 404; invalid values 422; conflicting records 409. Errors do not include database internals or credentials. Request models reject extra identity/role fields.

## Session and database boundaries

Session tokens are random and kept in HttpOnly, SameSite=Strict cookies; PostgreSQL stores only their SHA-256 hashes. They expire after eight hours. Logout revokes the database row; disabled users and expired/revoked sessions are rejected on the next request. No auth token is persisted in browser localStorage/sessionStorage.

Mutating authenticated requests require the session's `X-CSRF-Token`. Login/me return it through same-origin JSON; the frontend holds it only in memory. Mutation origins use an explicit allowlist; account/IP login counters enforce a 15-minute attempt window.

The API uses only the non-owner **DATABASE_URL**. Startup rejects superuser/BYPASSRLS credentials. Authenticated requests set transaction-local identity from the verified database session, never from request fields. Runtime reads use RLS; writes go through fixed, private, parameterized SQL functions with explicit actor checks. No arbitrary SQL/operation endpoint exists.

Class locks serialize activation and assignment writes with roster/marks/publication. Saving a batch with an invalid cell rolls back the entire batch. Publishing requires complete marks and creates immutable per-child snapshots once; repeated publication returns the existing count. Published marks are locked. Leave overlap checks serialize per enrollment.

For deployment, set `APP_ENV=production` and explicit HTTPS `APP_ORIGINS`. Production cookies are Secure; serve API/frontend under the same HTTPS origin. The current verification is local, not a hosted production deployment. Configure trusted reverse proxy/IP handling and operational backups/retention/session cleanup before using real school records.

## Verification

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
```

API tests create a new `parentreport_test_*` database for each test, apply all migrations and use the actual restricted API role through HTTP. They drop only their generated test databases; the real ParentReport database is not reset.

With local accounts, Vite and FastAPI running:

```sh
node scripts/browser-backend.mjs
```

Run the browser script from the frontend folder in the GitHub monorepo, or the root in the original local workspace. It reads sibling backend credentials locally without printing them and adds fictional review records to the local fixture school.

See [VERIFICATION.md](VERIFICATION.md) for actual results.

## Remaining integrations

Real guardian OTP, parent recovery/password reset and real WhatsApp workers/webhooks remain future integrations. Local guardian onboarding, school registration and private logo storage are implemented. The live UI cannot mark a real guardian verified. The original tour and remaining demo screens still work in demo mode. No messaging inbox was added.


### Delivery review

Open a published exam in the connected workspace to see eligible recipient counts, skip reasons, and recent simulation runs. The API checks current school and class access before returning the review. The queue rechecks eligibility when a run starts. Simulation history is limited to the latest 20 runs for the exam and excludes contact details. Apply migration `012_report_delivery_review.sql` and restart the API to enable the view.
