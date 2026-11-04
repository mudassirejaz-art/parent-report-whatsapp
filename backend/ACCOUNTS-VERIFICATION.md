# Account security verification

Verified locally on 2026-11-05 against PostgreSQL 17.11, the restricted runtime API role, FastAPI and the production Vite preview at 127.0.0.1:5173.

| Check | Actual result |
| --- | --- |
| Full backend integration suite | **75 passed**, 1 dependency deprecation warning; 636.96 seconds |
| Focused account security API suite | **15 passed** |
| PostgreSQL permission assertions | **50 passed**, fixtures rolled back; RLS on all 29 tables |
| Frontend regression tests | **49 passed** in 4 files |
| TypeScript + Vite production build | **Passed**, 1,691 modules |
| Chrome mobile/desktop account journey | **16 passed**, no browser runtime errors |
| Python dependencies | `pip check`: no broken requirements |

The backend suite verifies existing teacher/class restrictions, parent report isolation, guardian onboarding, school registration/branding, and new account security. Every integration test uses a separately generated database which is removed afterward. The persistent school database is not reset by the suite.

Account tests cover all three roles, current-password validation, CSRF, durable failed-attempt limits, session ownership, individual/other/current session revocation, cookie rotation, account switching, local-only recovery defaults and production rejection, hashed reset capabilities, expiration, replacement, disabled users, replay rejection, pending reset invalidation and stale-password session creation rejection.

The browser suite creates a new fictional school. It checks 390-pixel mobile and desktop screens, password mismatch feedback, session revocation, password field clearing, another tab receiving logout/password rotation, old/new password login, visibly labelled local recovery, no automatic login on reset, removal of the token from the address bar, reset replay rejection and final login. Its sanitized machine-readable results are in `frontend/verification/account-browser-results.json` in the repository. Generated review credentials stay only in ignored `backend/.local/`.

During verification, screenshot capture timed out under local browser load and was removed from the functional suite. An implicit browser navigation wait was replaced with explicit application-state checks. The browser run then found stale recovery-link state after navigation; the component now remounts for each location and hides obsolete links. The complete final browser run and frontend suite passed after that fix. No successful screenshot verification is claimed in these results.

The single backend warning comes from Starlette's deprecated httpx TestClient integration, not a failing test. Tests use the existing pinned dependency set.

Limitations: password recovery is an intentionally unsafe-for-production local simulation. There is no verified email/SMS/OTP delivery provider, production deployment, account recovery support process, or real WhatsApp delivery. Password/session actions themselves persist in local PostgreSQL.
