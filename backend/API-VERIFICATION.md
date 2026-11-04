# Verification — FastAPI / PostgreSQL milestone

**School setup results:** [SCHOOLS-VERIFICATION.md](SCHOOLS-VERIFICATION.md) records the latest 60-test API suite and 19-check school registration/branding journey.

**Latest milestone:** [ONBOARDING-VERIFICATION.md](ONBOARDING-VERIFICATION.md) adds the 40-test API suite and 16-check local guardian journey. Results below retain the original connected-workspace milestone.

Verified locally on 4 November 2026 with PostgreSQL 17.11, Python 3.12.14 and Chrome.

| Check | Actual result |
| --- | --- |
| API integration suite | **25 passed** through HTTP with a fresh PostgreSQL database per test |
| Updated leave-response test | **1 passed** after adding child/class names |
| PostgreSQL permission/integrity suite | **50 assertions passed**, fixtures rolled back |
| Existing frontend unit suite | **49 passed**, using `vitest run --dir src` |
| Final frontend production build | **Passed**, 1688 modules transformed |
| Complete connected browser journey | **21 passed**, zero page errors |
| Parent responsive layouts | Passed at **390, 768 and 1440px** |
| Dependency consistency | `pip check`: no broken requirements |
| Screenshot review | Loaded admin desktop and parent mobile inspected; all report columns fit on mobile |

The API suite covered real password login, hashed server-side sessions, forged/expired cookies, logout, disabled users, login rate limits, CSRF/origin rejection, tenant/class isolation, existing-session revocation, admin-only writes, atomic marks batches, immutable publication, parent report isolation, private notices/acknowledgements, attendance, homework, leave ownership/review and idempotent simulation.

The browser suite verified admin create/activate/assign → assigned teacher student entry → multi-subject marks and publication → parent report/attendance/private notices/homework/leave → teacher leave approval → parent decision visibility → class deactivation → teacher denial → logout. Changes use fictional local fixture data only.

Browser verification found and fixed attendance save feedback disappearing on refresh and missing explicit select labels in notice creation. Screenshots are in `frontend/verification/backend-parent-report-mobile.png` and `backend-admin-desktop.png` in the GitHub monorepo; locally they are in `verification/`.

Test databases are uniquely named `parentreport_test_*` and removed after each test. The real ParentReport database is preserved. Browser checks intentionally leave fictional review records available in the local fixture school.

One upstream Starlette/httpx deprecation warning appeared in the test client; tests passed. Runtime startup and HTTP requests completed normally.

Scope: the connected `/workspace` is real local API/database functionality. The original demo routes remain mock experiences. Guardian OTP/onboarding, recovery/password reset, school self-registration, logo storage and real WhatsApp delivery are not yet integrated. WhatsApp queue operations are explicitly simulated; no provider was contacted.

See [API.md](API.md) for run instructions, generated local accounts and the endpoint map.

