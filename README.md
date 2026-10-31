# ParentReport

School-to-parent progress reporting demo for Pakistani schools and academies. Frontend and future backend share this repository while remaining separate applications.

```text
frontend/   React + TypeScript + Vite application, tests and verification evidence
backend/    Reserved for the future API; implementation has not started
```

## Run the frontend

Requires Node 20.19+ and npm (Node 22 or 24 recommended).

```sh
cd frontend
npm install
npm run dev
```

Vite prints the local preview URL. Build with `npm run build`, run unit tests with `npm test`. A pnpm lockfile is also included for the dependency versions used during local verification; pnpm users can run `pnpm install`, `pnpm dev`, `pnpm build` and `pnpm test` from `frontend/`.

The demo includes school-admin, class-teacher and separate parent portals; class permissions; guardian verification and consent simulation; exams and marks; private reports; attendance; school/class notices and private student notes; homework; leave requests; branding; English/Roman Urdu interface; and a 20-second Remotion product tour. Direct parent–teacher chat has been removed.

All records are fictional and browser-local. Authentication, OTP and WhatsApp delivery are simulations. No backend service, database, billing integration, production credentials or real messaging is included.

See [frontend instructions](frontend/README.md) and [actual verification results](frontend/verification/RESULTS.md) for role accounts, routes, run commands, tested behaviour and limitations. Future backend planning is documented in [backend/README.md](backend/README.md).

