# Local guardian onboarding verification — 5 November 2026

User-selected scope: **complete local testing, without a real OTP provider**.

| Check | Actual result |
| --- | --- |
| Complete API integration suite | **40 passed**, using separate PostgreSQL databases |
| Final onboarding API regression | **15 passed** after moving password hashing behind the IP limit |
| PostgreSQL integrity/permission suite | **50 assertions passed**, rolled back |
| Existing frontend unit tests | **49 passed** |
| Production frontend build | **Passed**, 1689 modules transformed |
| Stable production-preview browser journey | **16 passed**, zero page errors, zero provider calls |
| Python dependencies | pip check: no broken requirements |
| Secret exclusion | Private key, generated account/password files and backend/.env confirmed ignored by Git |

API coverage includes pending submission without access, encrypted contact/HMAC lookup, new parent registration, code lockout with durable counters, declined consent without a link/account, expiration, invite consumption/reissue, admission-number lockout, revocation, inactive class, revoked/suspended teacher, existing parent/sibling linking, duplicate phone ownership, missing consent, invalid email/number, production-disabled flow and parent-only consent withdrawal.

The API safety test also changes a contact to provider provenance and verifies that its simulated link still grants no access when local mode is disabled. This prevents a reused contact from upgrading a local simulation into production verification.

The browser journey exercised teacher invitation → wrong admission rejection → student pending submission → separate parent verification → explicit consent → wrong-code rejection → new account → one linked child → teacher masked status → published marks/report → consent withdrawal → continued report access → unrelated-parent denial → consumed/used link rejection → incomplete-link recovery.

Development reloads initially interrupted browser navigation. Verification was completed against the final built preview with no HMR, and dev watching now excludes backend/database/doc/script/verification files. A replay test was corrected to reload the same fragment URL so it actually rechecks the server rather than retaining the prior success UI.

The fictional new parent's local credentials are in ignored backend/.local/onboarding-browser-account.json. Browser checks intentionally leave fictional review records. API tests do not reset the real ParentReport database.

One upstream Starlette/httpx test-client deprecation warning remains; test execution and runtime requests passed.

Artifacts in frontend/verification (verification/ in the original workspace):
- onboarding-browser-results.json
- onboarding-complete-mobile.png

No real phone-control verification, OTP sending or WhatsApp delivery was performed. Local test codes are intentionally shown only in explicitly enabled local mode. Actual provider verification remains a future integration.

See [ONBOARDING.md](ONBOARDING.md) for the setup, flow and security boundary.

