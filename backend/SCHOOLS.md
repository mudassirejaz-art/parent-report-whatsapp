# School registration and branding

The connected app now supports school self-registration and persistent admin-managed branding, using FastAPI and plain PostgreSQL.

## Use it locally

Apply all migrations and install the pinned backend requirements, then run the API and frontend as documented in API.md.

- Create a school: **http://127.0.0.1:5173/school/register**
- Sign in: **http://127.0.0.1:5173/workspace**
- Manage identity: **School settings** in the admin navigation.

Registration creates a new password account, a new school and that school's first admin membership in one transaction. It cannot promote an existing account or attach a new admin to an existing school. Duplicate email/handle conflicts roll everything back. No session is silently replaced during registration; the success button explicitly opens the new sign-in flow.

A new school starts with no classes or other schools' data. Create a class, activate it, create a teacher and assign the teacher to begin working.

## Configuration

```dotenv
APP_ENV=development
APP_SCHOOL_REGISTRATION=true
```

If APP_SCHOOL_REGISTRATION is absent, registration defaults on in development/test and off in production. An explicit true opts in. Set it to false to close public registration while preserving existing logins. APP_ENV accepts development, test or production (case-insensitive) and rejects unknown values.

Registration is protected by the existing origin boundary and database-backed IP/email limits, checked before password hashing. Passwords use Argon2. Email is a sign-in identifier; no email-ownership or school-institution verification is claimed, and no email/payment provider is called.

Local guardian testing still requires APP_LOCAL_ONBOARDING=true. Real guardian OTP and WhatsApp delivery are separate, unconfigured integrations.

## School settings

Only an active school's administrator can edit:
- School name
- City and address
- School contact email
- Tagline
- Portal accent colour
- School logo

Optional profile fields can be cleared. Accent colours must keep white primary-button text readable (contrast at least 4.5). The handle is fixed at registration; admin settings cannot write role, activation or arbitrary logo URL fields.

Current branding appears in authorized admin, assigned-teacher and linked-parent workspaces. It refreshes after the administrator's save, on navigation/window focus, and through an update signal between same-session tabs. Different browser sessions do not use a real-time push channel. When multiple schools are visible, the common header remains ParentReport instead of choosing the wrong school's identity.

Published report snapshots preserve the school name recorded when published. Renaming a school does not rewrite historical reports.

## Logo storage

Logos are stored in a private PostgreSQL bytea table; no public filesystem upload directory or external asset service is required.

- Input: PNG, JPEG or WebP, up to 1 MB and 2048 × 2048 pixels.
- Animated and malformed images are rejected. SVG/HTML are not accepted as logos, including renamed files.
- The backend checks decoded content, applies orientation, strips metadata and saves a fresh PNG.
- Stored output is limited to 512 KB and a longest edge of at most 512 pixels; complex files may be reduced further.
- The client uses an authenticated API URL and an opaque content digest for cache refresh.
- Logo reads are restricted to authorized members/linked parents; anonymous and unrelated-school users cannot fetch them.
- Logo replacement/removal and school metadata are updated atomically. Teacher and parent writes are denied.
- Images are served as image/png with nosniff and no-store. The original filename or supplied URL is never used as a server path.

Database backups now include logo bytes. This is a local working implementation, not a deployed object-storage/CDN integration.

## API and schema

| Route | Access |
| --- | --- |
| GET /api/v1/auth/registration-config | Public registration availability |
| POST /api/v1/auth/register-school | Rate-limited new-school signup |
| PATCH /api/v1/schools/{id} | That school's admin |
| PUT /api/v1/schools/{id}/logo | That school's admin, CSRF-protected raw image body |
| DELETE /api/v1/schools/{id}/logo | That school's admin |
| GET /api/v1/schools/{id}/logo | Authorized school members/linked parents |

GET /api/v1/schools remains the scoped profile/branding read endpoint.

Migration **009_school_registration_branding.sql** adds the private school_logos table and narrow guarded functions. There are now **28 domain/authentication/asset tables**, all with RLS enabled. Runtime still has no blanket table write grants or direct access to private asset rows.

## Verification and local review

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q --tb=short
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/Invoke-Database.ps1 test
```

With API/frontend running, fictional fixture accounts seeded and local guardian testing enabled:

```sh
node scripts/browser-schools.mjs
```

Run browser scripts from the original workspace root, or frontend/ in the GitHub monorepo. The checked-in scripts/fixtures/school-logo.png is a fictional test logo. The browser journey creates a new fictional school, teacher, child and local-test parent, publishes a report and verifies branding and isolation. It leaves review records available; generated passwords are saved only in ignored **backend/.local/school-browser-accounts.json**.

See [SCHOOLS-VERIFICATION.md](SCHOOLS-VERIFICATION.md) for actual results. Existing demo routes, Remotion tour and earlier connected workflows remain available. Direct parent–teacher chat remains removed.

