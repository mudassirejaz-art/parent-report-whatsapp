# Database verification — 4 November 2026 (initial milestone)

**Current milestone results:** [API-VERIFICATION.md](API-VERIFICATION.md) includes the FastAPI, browser and updated database checks. This file retains the original database milestone evidence.

Environment: real PostgreSQL 17.11, Windows x86-64, local loopback port 55432.

- Local database `parentreport` initialized with SCRAM password authentication and generated credentials.
- Both SQL migrations applied successfully in a transaction.
- Migration rerun succeeded: applied migrations skipped, recorded checksums matched.
- 25 domain tables: 15 in `app`, 10 in `app_private`; RLS enabled on all 25.
- **50 PostgreSQL assertions passed** in `db/tests/permissions.sql`. Fixtures rolled back.
- Tests exercised the actual `parentreport_runtime` role: tenant/class boundaries, assignment revocation and suspension, inactive classes/schools, guardian ownership, multiple children, draft/published report isolation, private notices, PII denial, absence of runtime writes, consent withdrawal and send eligibility.
- Constraint tests rejected cross-school/class references, invalid mark ranges/maximums, invalid leave dates, duplicate primary guardians and attendance, and mutation of published reports/audit records.
- Actual password login as `parentreport_api` succeeded. Role is not superuser; zero students visible without a verified session context.
- Existing frontend production build passed (Vite: 1682 modules).
- Existing frontend unit tests passed: 49 unique tests. The root Vitest run also discovered the publication snapshot, so its output reported 98 passing executions across the two copies.

The first migration attempt found a function quoting error and rolled back cleanly. It was corrected before migrations were applied. Two test-label apostrophes were corrected before the final full 50-assertion pass.

Limits: database foundation only. No HTTP API or real authentication, OTP or WhatsApp integration. Runtime writes intentionally remain denied until guarded backend endpoints/write policies are implemented. The frontend still uses mock data. This is a local development database, not a deployed production service.

