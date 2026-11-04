# ParentReport database

Plain PostgreSQL 17+ foundation for the existing ParentReport frontend. No Supabase dependency.

The current task starts backend development and supersedes the attached documents' earlier frontend-only boundary. The existing React demo stays unchanged and still uses its mock API. This folder currently provides a real PostgreSQL database, migrations, local lifecycle scripts and database integration tests. HTTP endpoints, production login, OTP verification, storage uploads and WhatsApp workers are not implemented yet.

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

25 domain tables, split into two schemas:

| Area | Tables |
| --- | --- |
| Identity and access | app_private.users, school_memberships, class_assignments |
| School structure | app.schools, classes, students, enrollments |
| Guardian onboarding | app_private.guardian_contacts, guardian_links, guardian_consents, onboarding_invites, guardian_submissions |
| Results | app.exams, exam_subjects, marks, report_versions |
| School life | app.attendance, notices, notice_acknowledgements, homework, homework_completions, leave_requests |
| Reporting operations | app_private.report_campaigns, app.report_deliveries, app_private.audit_events |

Public-facing profiles and identity endpoints will be implemented in the API; private identity and guardian tables are not granted to the runtime role. Direct parent–teacher messaging is outside the current scope.

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

A future trusted backend must authenticate a real session and set identity inside **each transaction**:

```sql
begin;
select set_config('app.user_id', 'VERIFIED-USER-UUID', true);
-- Perform parameterized queries as parentreport_api.
commit;
```

Never take that UUID from an unverified request body/header, give parents a PostgreSQL login, or accept arbitrary SQL. Custom session settings are a trusted-backend contract, not authentication. Missing identity denies reads. SET LOCAL prevents identity leaking across pooled requests.

Admin reads stay within an active school; teachers require current, unsuspended assignments and active classes; parents can read only verified linked children and immutable published reports, plus the appropriate attendance/homework/notices. Parents cannot read draft marks. Class deactivation blocks teachers while linked parents retain historical reports.

**Writes intentionally remain closed on the runtime connection.** The next API task must add narrowly scoped write functions/policies and transaction validation for class management, marks saving, report publication, onboarding, acknowledgements, homework completion and leave decisions. Do not grant blanket INSERT/UPDATE/DELETE or connect the frontend with owner credentials.

The schema stores encrypted phone fields, keyed HMAC lookup values and hashed invite/challenge tokens. Encryption keys, HMAC secrets, real password hashing, OTP generation/rate limits and session storage belong to the upcoming trusted backend. No real contacts or reusable OTPs are seeded.

## Migrations and verification

`db/migrations/001_initial.sql` creates the domain model and scoped reads. `002_eligibility_audit.sql` adds send eligibility and automatic audit events.

The runner applies pending SQL files in one transaction under an advisory lock, records SHA-256 checksums in `public.parentreport_migrations`, skips applied files and rejects edits to applied migrations. Add new numbered files for later changes; never edit already-deployed migrations. No reset/drop command is provided.

`db/tests/permissions.sql` creates fictitious fixtures in a transaction, switches to the actual restricted runtime role, verifies access and constraints, then rolls everything back. A failure exits psql and rolls back too. Run only against a development database.

Coverage includes tenant/class isolation, active assignment checks, suspended and revoked teachers, two children per guardian, parent report and notice isolation, unverified/revoked contacts, consent withdrawal, invalid marks/leave ranges, duplicate guardians/attendance, immutable report/audit rows and lack of runtime write/PII access.

Next backend milestone: FastAPI authentication/session handling and guarded write endpoints, followed by replacing the frontend mock adapter incrementally.

