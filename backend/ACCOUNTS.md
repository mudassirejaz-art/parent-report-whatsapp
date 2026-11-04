# Account security

See [actual verification results](ACCOUNTS-VERIFICATION.md): 75 backend tests, 49 frontend tests, 50 database assertions and 16 browser checks passed.

The connected workspace supports account-owned password changes and session management for administrators, teachers and parents. Open `/workspace/account` through the header's **Account & security** link. Demo role switching cannot access these APIs.

- Change password requires the current password, a different new password of 12–128 characters, authenticated HttpOnly cookie and CSRF token. A successful change rotates the current cookie/CSRF and revokes every older session and pending reset link.
- Active sessions show creation and expiry times in Pakistan time, with the current browser marked. Revoke one owned session or all other sessions. Session identifiers never authorize access; cookie hashes and CSRF values are excluded from the list.
- Logout and password changes synchronize across tabs using BroadcastChannel. Focus/visibility checks refresh server identity and remove expired/revoked private workspaces. Account changes mount a new workspace and return to its home route.

## Local recovery only

`APP_LOCAL_RECOVERY=false` by default. For fictional local testing only, set `APP_LOCAL_RECOVERY=true` in ignored `backend/.env`, then restart the API. Production configuration rejects this flag, including manually constructed secure-cookie settings. No email, SMS, OTP or WhatsApp delivery is implemented.

Visit `/forgot-password`. The page clearly identifies a local simulation and displays a test reset link for either known or unknown email addresses. Only an existing enabled account can actually use its link. Links expire after 15 minutes, are single-use, and each new request supersedes older links. Only SHA-256 capability hashes are stored. The token stays in the browser URL fragment and is submitted in a POST body; it is removed from the address bar after success. A completed reset revokes all target-account sessions and pending links; the user must sign in again. It never signs the requester in or clears an unrelated user's cookie.

This simulation deliberately reveals the reset capability to its requester and is therefore **not a production recovery channel**. Configure a verified delivery provider before replacing it with a real recovery flow.

## API

| Method | `/api/v1` endpoint | Access |
| --- | --- | --- |
| GET | `/auth/sessions` | Authenticated account |
| DELETE | `/auth/sessions/{id}` | Own active session + CSRF |
| POST | `/auth/sessions/revoke-others` | Own account + CSRF |
| POST | `/auth/change-password` | Own current password + CSRF |
| GET | `/auth/recovery-config` | Public configuration only |
| POST | `/auth/local-recovery` | Explicit local mode |
| POST | `/auth/local-recovery/complete` | Explicit local mode + valid capability |

Apply migration `010_account_security.sql` before restarting the new API. Session creation now checks the password hash atomically under the account lock, preventing an old-password login from creating a session after a concurrent password change/reset. Legacy unchecked session creation is revoked from the runtime role. Reset completion and password changes lock user before session/reset rows. Rate counters commit independently of failed actions. Recovery tables have RLS and no runtime table grants.

## Run and verify

From this local workspace root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 migrate
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Start-Backend.ps1
```

In another terminal run `npm run dev` (repository checkout: run this in `frontend/`), then open `http://127.0.0.1:5173/workspace`. On this workstation use `node .npm-tool/bin/npm-cli.js run dev` if npm is absent from PATH.

Integration tests: `backend/.venv/Scripts/python.exe -m pytest backend/tests -q`. Each test provisions and removes its own generated test database; persistent school data is untouched. Browser journey: `node scripts/browser-accounts.mjs`, against an already running API and frontend. Browser fixtures use a new fictional school; final review credentials stay in ignored `backend/.local/account-browser-accounts.json`.
