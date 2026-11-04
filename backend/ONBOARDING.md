# Guardian onboarding — local testing

This milestone implements the teacher → student → separate parent account/consent journey using FastAPI and PostgreSQL.

**User-selected scope: local testing without an OTP provider.** No SMS/WhatsApp provider is configured or called. The local test code is deliberately visible and does not establish control of a real phone number. Each relevant screen and API response identifies the simulation.

## Enable locally

The existing local workspace has this enabled in its ignored backend/.env. On a fresh checkout, add:

```dotenv
APP_ENV=development
APP_LOCAL_ONBOARDING=true
```

Keep APP_LOCAL_ONBOARDING disabled outside development. APP_ENV=production together with local verification is rejected at startup. Disabling local mode returns 503 from onboarding endpoints and removes access through simulated guardian links; regular staff operations continue.

Start PostgreSQL, apply pending migrations, install the pinned Python requirements and restart the API:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-LocalPostgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-Backend.ps1
```

Run Vite on port 5173, then open **http://127.0.0.1:5173/workspace**. Local fixture credentials are in ignored backend/.local/accounts.json.

A server-side encryption key is generated in ignored **backend/.local/onboarding.key** when local mode first starts. Retain it while using this local database; deleting/replacing it invalidates pending code lookups and existing phone lookup/decryption continuity. Never commit or publish this key. An explicitly configured ONBOARDING_KEY can be supplied instead.

## Review the journey

1. Sign in as the assigned teacher, open an active class and add an unlinked fictional student if needed.
2. Open **Parent links**. Create that student's private invitation. The link is shown only in the successful creation response and component memory.
3. Open the student form separately. Enter the matching admission number, a fictional guardian name and Pakistani mobile number. The phone is normalized, encrypted and stored as **pending**. This creates no parent account, guardian ownership or consent.
4. Open the separate parent verification link. Review the child/school and masked contact, enter the displayed **local test code**, choose consent explicitly and create a password account. The checkbox is not preselected.
5. Alternatively sign in with an existing parent account to link a sibling. A phone already tied to another account cannot be claimed.
6. If consent is refused, the refusal is recorded without creating a new guardian link/account. A fresh invitation is needed to restart.
7. Sign in to the connected parent workspace. Only the linked child and their published records are visible. Teacher status displays masked phone, consent and simulation provenance.
8. Under **Homework & leave → WhatsApp report consent**, withdraw messaging consent. Owned report access remains; simulated send eligibility requires current consent.

Invitation tokens are student-bound, single-use and expire after 24 hours. Verification capabilities expire after 10 minutes and are single-use. Five wrong admission numbers lock the invite; five wrong codes lock verification. Error counters commit even when the HTTP response is an error.

Creating a new invitation invalidates old invitations and pending verification. Teacher assignment revocation/suspension, inactive schools/classes, ended enrollment and guardian-link conflicts are rechecked before completion. Staff can revoke invitations from Parent links. Existing verified guardians cannot be silently replaced through this flow.

## Data and API boundary

New private SQL functions execute through the existing restricted API role. No broad table writes are granted.

| Endpoint | Purpose |
| --- | --- |
| GET /api/v1/onboarding/config | Local-mode/provider status |
| GET /api/v1/classes/{id}/guardian-links | Authorized class linking statuses |
| POST /api/v1/classes/{id}/guardian-invites | Student-bound invitation |
| DELETE /api/v1/classes/{id}/guardian-invites/{invite} | Revoke invitation and pending verification |
| POST /api/v1/onboarding/invite-info | Minimal school/class invitation details |
| POST /api/v1/onboarding/submit | Student contact submission |
| POST /api/v1/onboarding/verification-info | Parent details and explicitly local test code |
| POST /api/v1/onboarding/register | New local parent account, link and affirmative consent |
| POST /api/v1/onboarding/link-existing | Authenticated, CSRF-protected sibling linking |
| POST /api/v1/onboarding/decline | Record consent refusal |
| GET /api/v1/me/guardian-links | Parent-owned masked contacts/consent |
| DELETE /api/v1/me/guardian-links/{id}/consent | Withdraw only one's own messaging consent |

Public pages are **/enroll#CAPABILITY** and **/verify-guardian#CAPABILITY**. Fragments are not sent in HTTP URLs/referrers; API capabilities are submitted in POST bodies. Raw invite/verification tokens are stored only as hashes. Codes are keyed by a server-held secret; plaintext codes are not stored in PostgreSQL. Phones use authenticated Fernet encryption plus a server-keyed HMAC lookup. Teachers receive masked numbers only.

Public onboarding has a database-backed IP limit, enforced before expensive registration password hashing. Existing-parent linking uses the existing cookie session and CSRF check. Creating a new account does not overwrite a staff login session.

Contact provenance and the link's simulation flag are independent. Production ownership/send checks require a provider-verified contact **and** a non-simulated link, or an explicitly permitted local transaction. Reusing a provider contact cannot promote a simulated link.

Migrations 005–008 extend existing tables and implement the local flow, consent lookup and simulation boundary. The domain/auth table count stays 27. Audit triggers record invite/submission changes without raw phones, test codes or capability tokens.

## Verification

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q --tb=short
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
```

With API/Vite running and local accounts seeded:

```sh
node scripts/browser-onboarding.mjs
```

Run browser scripts from the original workspace root, or frontend/ in the GitHub monorepo. They read local credentials privately, create fictional review records and do not print passwords, phone numbers or test codes. The newly created fictional parent's login is stored in ignored **backend/.local/onboarding-browser-account.json** for local review.

See ONBOARDING-VERIFICATION.md for actual results. Real OTP-provider verification and real WhatsApp delivery remain unimplemented; there is no endpoint claiming real phone verification.

