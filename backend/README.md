# ParentReport backend

Plain PostgreSQL 17+ foundation for the existing ParentReport frontend. No Supabase dependency.

FastAPI provides real password login, revocable sessions, school self-registration and guarded admin/teacher/parent APIs. School profile/logo uploads persist in PostgreSQL. The connected frontend is at `/workspace`; original demo portals remain separately available. This work supersedes the attached documents' earlier frontend-only boundary. Real OTP and WhatsApp delivery are still separate integrations.

**Start here:** [API setup, login accounts and supported workflows](API.md). The database setup and access contract are documented below.

**Account security:** [Password changes, session controls and explicitly local recovery](ACCOUNTS.md), with [verified results](ACCOUNTS-VERIFICATION.md): 75 API tests, 49 frontend tests, 50 database assertions and 16 browser checks passed.

**School milestone:** [School registration and branding](SCHOOLS.md), with [actual verification](SCHOOLS-VERIFICATION.md): 60 API tests, 50 database assertions, 49 frontend tests and 19 school browser checks passed.

**Guardian onboarding milestone:** Student-bound invitations, separate parent registration/sibling linking and consent withdrawal are now implemented for explicitly enabled local testing. See [ONBOARDING.md](ONBOARDING.md). No real phone verification or messaging provider is configured.

## Local Windows setup

From the repository root, with Node.js, PowerShell and curl available:

```powershell
node backend/scripts/Download-Postgres.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-LocalPostgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 status
```

The download script fetches server components from the official EDB PostgreSQL Windows archive linked by [postgresql.org](https://www.postgresql.org/download/windows/). It checks each extracted file's ZIP CRC and size, excludes bundled GUI tools, and keeps binaries in ignored `.postgres-local/`. It does not install a Windows service or change PATH.

Database: **parentreport**, host **127.0.0.1**, port **55432**. The cluster listens only on loopback. SCRAM authentication uses generated random passwords. Local credentials are saved in ignored `backend/.env`; cluster files and password files are in ignored `backend/.local/` and restricted to the current Windows user. Do not share or commit those files.

Start again with `Start-LocalPostgres.ps1`. Stop without deleting data:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Stop-LocalPostgres.ps1
```

To use an existing PostgreSQL server instead, create a dedicated database and a `parentreport_runtime` NOLOGIN role with NOSUPERUSER, NOCREATEDB, NOCREATEROLE and NOBYPASSRLS using your administrator. Set `MIGRATION_DATABASE_URL` privately, then run `Invoke-Database.ps1` with `-PsqlPath` pointing to your psql executable. For remote servers the runner requires `sslmode=verify-full` through libpq's environment; configure a trusted server certificate. The Windows binary download is unnecessary in that case.

## Data model

25 domain tables plus 2 private authentication tables and private `school_logos` storage and local `password_resets`, split into two schemas. All 29 have RLS enabled.

| Area | Tables |
| --- | --- |
| Identity and access | app_private.users, school_memberships, class_assignments |
| School structure | app.schools, classes, students, enrollments |
| Guardian onboarding | app_private.guardian_contacts, guardian_links, guardian_consents, onboarding_invites, guardian_submissions |
| Results | app.exams, exam_subjects, marks, report_versions |
| School life | app.attendance, notices, notice_acknowledgements, homework, homework_completions, leave_requests |
| Reporting operations | app_private.report_campaigns, app.report_deliveries, app_private.audit_events |

Identity is returned only through authenticated session endpoints and the authorized school-admin teacher directory. Raw private identity and guardian tables are not granted to the runtime role. Direct parent–teacher messaging is outside the current scope.

- Composite foreign keys reject references across schools and classes.
- One current enrollment per student; historical enrollments retain previous class results.
- One active primary guardian per student; a guardian may link multiple children.
- Student-submitted contact details do not grant parent access. Links require a separately verified contact. A revoked contact/link immediately removes ownership.
- WhatsApp consent is separate from portal ownership. The consent text, policy version, grant and withdrawal times are retained.
- Marks enforce zero-to-maximum bounds in SQL; the maximum must match the exam subject through a composite foreign key.
- Attendance has one record per enrollment and day.
- Behaviour/uniform notices must target one student. School, class, private-student and draft visibility have separate rules.
- Published report snapshots and audit events reject UPDATE and DELETE, including writes by the migration owner.
- Campaign idempotency keys and recipient uniqueness prevent duplicate enqueue records. Simulations cannot claim a real provider message ID.
- Internal `app_private.send_eligible(report_id, link_id)` checks sender scope, school/class activation, sending permission, complete marks, verified active guardian and active WhatsApp consent. A future queue worker must recheck immediately before enqueue/send and handle consent/assignment changes transactionally.
- Triggers automatically write identity-only audit events for operational changes, including assignment grants/revokes. They do not copy phone numbers, OTPs, tokens or report contents.

## Access boundary

`parentreport_owner` is the local migration administrator. Its connection URL must never be used by the browser or routine API reads.

`parentreport_api` inherits the non-owner `parentreport_runtime` role. Runtime has SELECT permissions only. Every domain table has RLS enabled; private tables have no runtime grants. Protected read helpers have an empty search path and execute only narrow identity-scoped lookups.

The FastAPI backend authenticates a real database session and sets identity inside **each transaction**:

```sql
begin;
select set_config('app.user_id', 'VERIFIED-USER-UUID', true);
-- Perform parameterized queries as parentreport_api.
commit;
```

Never take that UUID from an unverified request body/header, give parents a PostgreSQL login, or accept arbitrary SQL. Custom session settings are a trusted-backend contract, not authentication. Missing identity denies reads. SET LOCAL prevents identity leaking across pooled requests.

Admin reads stay within an active school; teachers require current, unsuspended assignments and active classes; parents can read only verified linked children and immutable published reports, plus the appropriate attendance/homework/notices. Parents cannot read draft marks. Class deactivation blocks teachers while linked parents retain historical reports.

**Direct table writes remain closed on the runtime connection.** Migration `004` grants execution of a fixed-operation private write function. It checks current identity and school/class/parent authority for each supported operation, locks class mutations, validates transactional marks and publishing, and handles parent acknowledgements/homework/leave decisions. The HTTP API exposes typed endpoints, not an arbitrary operation or SQL interface. Do not grant blanket INSERT/UPDATE/DELETE or connect the frontend with owner credentials.

Encrypted phone fields, keyed HMAC lookups and hashed invite/challenge tokens are implemented for explicitly local guardian onboarding. Password hashing and session storage are implemented. A real OTP-provider integration remains future work; simulations cannot establish production guardian ownership.

## Migrations and verification

`db/migrations/001_initial.sql` creates the domain model and scoped reads. `002_eligibility_audit.sql` adds send eligibility and audits. `003_api_auth.sql` adds private session/login-counter tables and authentication helpers. `004_guarded_writes.sql` adds the authorized write operations.

The runner applies pending SQL files in one transaction under an advisory lock, records SHA-256 checksums in `public.parentreport_migrations`, skips applied files and rejects edits to applied migrations. Add new numbered files for later changes; never edit already-deployed migrations. No reset/drop command is provided.

`db/tests/permissions.sql` creates fictitious fixtures in a transaction, switches to the actual restricted runtime role, verifies access and constraints, then rolls everything back. A failure exits psql and rolls back too. Run only against a development database.

Coverage includes tenant/class isolation, active assignment checks, suspended and revoked teachers, two children per guardian, parent report and notice isolation, unverified/revoked contacts, consent withdrawal, invalid marks/leave ranges, duplicate guardians/attendance, immutable report/audit rows and lack of runtime write/PII access.

Remaining integrations: real guardian phone verification/OTP, parent recovery/password reset, deployment and real WhatsApp workers/webhooks. School registration and private logo storage are now implemented. No public endpoint can mark a real guardian verified. Local fixture links and consents are explicitly fictional. Additional guardians per child remain outside the current scope.

