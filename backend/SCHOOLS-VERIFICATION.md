# School setup verification — 5 November 2026

| Check | Actual result |
| --- | --- |
| Complete PostgreSQL-backed API suite | **60 passed** |
| New school/branding API tests | **20 passed**, included in the full suite |
| Original database integrity/permission checks | **50 passed**, fixtures rolled back |
| Existing frontend unit tests | **49 passed** |
| Production frontend build | **Passed**, 1690 modules transformed |
| School browser journey | **19 passed**, zero page errors |
| Branded parent responsive layout | Passed at 390, 768 and 1440 pixels |
| Python dependency consistency | pip check: no broken requirements |

API tests verified atomic school/admin provisioning; no existing-account promotion; no orphan user/school on conflicts; disabled and rate-limited signup; role/tenant injection rejection; admin-only profile writes; CSRF; optional fields; readable accent validation; private logo reads; invalid SVG/disguised/empty/oversized uploads; pixel bounds; JPEG-to-PNG normalization; metadata stripping; logo removal and immutable report snapshots.

The browser journey covered signup/password confirmation → real new-admin login → empty first-school state → profile/accent/logo persistence → teacher/class creation and assignment → new teacher/parent branding → navigation refresh → original report name retention → logo removal/reupload → unrelated-parent denial → teacher settings denial → responsive parent report.

A fictional parent was provisioned through the already-tested local guardian API only to exercise the new tenant across roles. No real OTP/provider messages were sent.

Browser verification found a branding cache that refreshed only within the same session. The provider now refreshes on navigation/focus, and tests verify cross-role persistence without claiming server-push updates. Mobile registration/parent and desktop settings screenshots were visually inspected. A full-page sticky-sidebar capture was retaken from the top of the page.

Artifacts in frontend/verification (verification/ locally):
- school-browser-results.json
- school-registration-mobile.png
- school-settings-desktop.png
- school-parent-mobile.png

Generated credentials remain only in ignored backend/.local/school-browser-accounts.json. The browser's non-secret logo fixture is checked in and matches the verified file byte-for-byte.

One upstream Starlette/httpx test-client deprecation warning remains; tests and runtime requests passed. No live deployment, email verification, billing or real WhatsApp integration was performed.

See [SCHOOLS.md](SCHOOLS.md) for setup and scope.

