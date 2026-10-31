# ParentReport backend — planned, not implemented

This folder reserves a clear place for the future API in the same repository as `frontend/`. There is no running backend, dependency installation, database migration or real authentication/WhatsApp service here yet.

The proposed integration is FastAPI with MySQL, subject to a separate backend implementation task. The current frontend uses typed mock data and a replaceable repository adapter in `frontend/src/services.ts`.

Before implementation, design and review:

- Tenant-scoped authentication and school/class/teacher authorization on every API request.
- School branding, class activation and teacher assignment/suspension.
- Students, guardian-child relationships, expiring invitations, real OTP verification and affirmative messaging consent.
- Exams, per-subject maximums, transactional marks entry, publishing and immutable report versions.
- Parent-owned report and attendance reads; daily attendance registers.
- School/class/private-student notices, drafts, acknowledgements and author permissions.
- Homework tasks and per-child parent checking; leave requests and teacher decisions.
- Idempotent WhatsApp campaign preview/enqueue, backend-only credentials, template approval and webhook-based delivery logs.
- Validation, audit trails, secret management, rate limits, storage and operational security.

Do not port the browser's demo role switcher, fake OTP or localStorage access checks into production authentication. Direct parent–teacher messaging is outside the current product scope.

Detailed integration TODOs are in `frontend/README.md`. Keep any future backend environment files and credentials out of Git; provide only a documented `.env.example` with placeholders.
