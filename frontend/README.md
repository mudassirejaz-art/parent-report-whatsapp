# ParentReport frontend demo

**Connected backend:** `/workspace` now uses real FastAPI password sessions and PostgreSQL APIs for class/teacher access, students, exams, marks, published reports, attendance, notices, homework and leave requests. See `backend/API.md` for setup and generated local login accounts. The original demo routes below remain available with mock data. Real guardian OTP and WhatsApp delivery remain future integrations.

**Current scope:** direct parent–teacher messaging has been removed. There are no inbox/contact buttons, messaging routes or unread-conversation actions. Parent mobile navigation now offers Home, Attendance, Homework diary and Notices. School/class notices, private student notes, leave requests and WhatsApp report simulation remain. Previous conversation data in existing demo storage is not exposed or destructively purged. The earlier messaging descriptions below describe the historical prototype and are not available features. `scripts/browser-no-messaging.mjs` verifies the removal; the school-life suite now excludes chat workflows.

A **new standalone demo** built in an empty repository after reading both ParentReport v2 requirement documents. No existing frontend source was present to preserve.

The latest requested scope also includes **attendance, school/class announcements, private student notes, parent–teacher conversations, homework diaries, leave requests, and school branding**. These additions extend the original reporting-only scope at the user's request; all remain frontend simulations.

## Run

Requires Node 20.19+ (Node 22 or 24 recommended) and npm.

```sh
npm install
npm run dev
npm run build
npm test
```

Open the exact Vite URL printed by `npm run dev` (normally http://127.0.0.1:5173).

The checked-in `pnpm-lock.yaml` records the dependency versions used for verification. If using pnpm, run `pnpm install`, `pnpm dev`, `pnpm build`, and `pnpm test`. The actual dependency installation here completed successfully with pnpm; the local npm CLI successfully ran the build and unit-test scripts.

On this workstation npm was absent from PATH. A workspace-local npm CLI was downloaded for verification. Equivalent commands here are `node .npm-tool/bin/npm-cli.js install`, `node .npm-tool/bin/npm-cli.js run dev`, `node .npm-tool/bin/npm-cli.js run build`, and `node .npm-tool/bin/npm-cli.js test`. This tool is ignored by Git and is not needed on a normal npm installation.

## Explore

### Simplified navigation

The parent home now puts the child’s latest report first, followed by three essential links and a short school-update list. Repeated welcome panels, four-counter grids, and duplicate priority panels were removed from this page. Teacher dashboards retain their operational priorities. Parents have three main sidebar destinations, with other pages under **More options**; admins group secondary pages under **Records & settings**. Class workspaces expose five everyday tabs and retain other functions under **More class tools**. Groups open automatically when viewing a page inside them. All original routes and authorization guards remain intact. Extra demo explanations use a collapsed disclosure, while the global demo label and send-simulation warnings remain visible.

Run `node scripts/browser-simple.mjs` to check the simplified hierarchy, grouped navigation, permissions, Roman Urdu and mobile layout. The priorities browser suite was updated to check staff priorities and inbox unread tracking alongside draft recovery and cross-tab synchronization.

### English and Roman Urdu

The reading-language bar at the top of every page switches common interface labels, headings, buttons, form labels, statuses and supported dynamic descriptions between **English** and **Roman Urdu** without reloading the page. The preference is persisted independently of the fictional school dataset. Roman Urdu uses `lang="ur-Latn"` and left-to-right layout. The bar is hidden in print views.

This is a curated interface translation catalog, not machine translation: school-authored notice bodies, homework instructions and private message bodies remain original; names, saved form values, identifiers, scores and internal statuses are not rewritten. Unmapped interface phrases fall back to English. Add reviewed translations in `src/i18n/catalog.ts`. The JSX runtime integration localizes rendered text rather than mutating React's DOM or translating stored records. If Vite retains an older optimized runtime during catalog development, restart with `npm run dev -- --force`.

Run `node scripts/browser-language.mjs` to verify live switching on parent settings, form save, preference persistence, Roman Urdu attendance navigation, return to English and mobile layout.

### Daily-use improvements

Parent, teacher and admin dashboards now surface scoped priorities: important unacknowledged notices, due/overdue homework, unread conversations, pending leave reviews and incomplete daily registers. Attendance prompts ask staff to confirm it is a school day rather than treating an unmarked day as absence. Inbox participants can explicitly mark a conversation read; this never changes another participant's read state. Unsent reply drafts are preserved per account and thread in this tab's sessionStorage and cleared by Reset Demo. Mobile parents have persistent Home/Attendance/Notices/Teacher navigation. Saved school data updates synchronize across open browser tabs; this remains local demo storage with last-write-wins behaviour, not a real-time backend.

Run `node scripts/browser-priorities.mjs` to verify priorities, read tracking, draft recovery, mobile navigation and cross-tab synchronization.

Start at `/`. Choose School Admin, Class Teacher, or Parent. All sign-ins are explicitly simulated; no password is checked. Parent login uses the fake universal code **123456** for existing verified, consented fictional accounts. New guardians must complete their own onboarding verification and opt-in first.

The **Demo Role Switcher** is a development-only feature, visible in each portal. Admin manages all school classes; Teacher A (Amina) gets active Class 6-A; Teacher B (Bilal) gets active Class 7-A; Teacher C (Sara) has inactive Class 8-B. Parent A gets Ahmed Hassan only; Parent B gets Maryam Asif only. No real contact information is seeded. Admin → School settings → Reset demo restores sample data and clears unsaved marks drafts.

## Route map

| Experience   | Routes                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public       | `/`, `/login`, `/admin/login`, `/teacher/login`, `/parent/login`, `/tour`                                                                                            |
| School admin | `/admin/dashboard`, `/admin/classes`, `/admin/classes/new`, `/admin/teachers`, `/admin/students`, `/admin/exams`, `/admin/reports`, `/admin/logs`, `/admin/settings` |
| Admin class  | `/admin/classes/:classId`, `/admin/classes/:classId/:tab`, `/admin/classes/:classId/exams/:examId/marks`                                                             |
| Teacher      | `/teacher/dashboard`, `/teacher/classes/:classId/:tab`, `/teacher/classes/:classId/exams/:examId/marks`                                                              |
| Class tabs   | `overview`, `students`, `exams`, `marks`, `parents`, `reports`, `logs`; admin additionally has `settings`                                                            |
| Onboarding   | `/join/:inviteToken`, `/parent/verify/:token`, backward-compatible `/register-parent/:token`                                                                         |
| Parent       | `/parent/dashboard`, `/parent/children/:studentId`, `/parent/children/:studentId/reports/:examId`, `/parent/settings`                                                |

## End-to-end walkthrough

### New school and family features

- **Attendance:** Teacher → Class 6-A → Attendance. Mark the daily register as present, absent, late, or leave; save for linked parents to view. Parent → Attendance shows monthly records and a clearly defined percentage. Unrecorded dates are not invented as absences. Teachers can record only active assigned classes; parents cannot edit attendance.
- **Noticeboard:** Admin → Notices & notes can publish school announcements. Teacher → Class → Notices & notes can publish class updates or private notes for one student. Behaviour and uniform categories require a private student audience, including for admins. Parents see only notices relevant to their linked children and can acknowledge them. Staff can save drafts and unpublish notices.
- **Teacher contact:** Parent → Teacher contact → Contact class teacher. Choose a learning question or meeting request and write a message. Switch to the assigned teacher → Parent inbox to reply, then switch back to read it. Only the participating guardian, assigned teacher, and school admin can read the thread. School review is disclosed. Resolve or reopen conversations. Replies pause if the teacher or class becomes unavailable. This is a browser-local inbox, not a live chat or actual meeting booking.
- **Homework diary:** Authorized staff publish subject tasks and due dates. Parents check completion for their own child. Parent-checked work is clearly distinguished from teacher grading.
- **Leave requests:** Parents request leave for linked children; teachers review and approve/decline with a response. Reversed dates and overlapping pending/approved requests are rejected. Approval does not automatically alter the attendance register.
- **School branding:** Admin → School settings can update school name, city, tagline, address, contact email, uploaded logo, and portal accent. Valid PNG/JPEG/WebP uploads up to 200 KB are stored locally. The identity is reflected across staff/parent portals and sample report cards. School profile information also appears in Parent → Profile & privacy.

Existing browser data is migrated automatically by filling in the new collections. Existing school names, classes, students and reporting edits are preserved. Reset demo restores both reporting and school-life samples.

### Added routes

| Experience | New routes                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin      | `/admin/attendance`, `/admin/notices`, `/admin/messages`, `/admin/diary`, `/admin/leave-requests`                                                                              |
| Teacher    | `/teacher/messages`, `/teacher/notices`; class tabs `attendance`, `notices`, `messages`, `diary`, `leave-requests`                                                             |
| Parent     | `/parent/attendance`, `/parent/notices`, `/parent/messages`, `/parent/messages/:threadId`, `/parent/diary`, `/parent/leave-requests`, `/parent/children/:studentId/attendance` |

### Original reporting journey

1. Admin → Class portals → Create class. Assign Amina, activate, enable sending. Open class → Portal settings to reassign or revoke teachers.
2. Switch to Teacher A. Only assigned active classes appear. Direct `/teacher/classes/c7/overview` is denied. Teacher C’s `/teacher/classes/c8/overview` is inactive.
3. Teacher A → Class 6-A → Parent links → Generate link → Open student form. Use **005 / Ibrahim Shah**, any fictional guardian name, and a fictional `+923XXXXXXXXX` number. The submission remains pending. Full numbers are not persisted; only masked suffixes and a SHA-256 duplicate-detection fingerprint are stored.
4. Open the separate guardian verification link. Wrong OTP fails. Code `123456` without consent fails. Tick the explicit consent checkbox and verify. The new guardian can open a private parent session for Ibrahim only. Declining leaves the link ineligible. Five incorrect attempts expire the invitation. `/join/expired-demo` demonstrates an expired token.
5. Teacher A → Exams → Create exam with comma-separated subjects and per-subject maxima. Marks entry validates missing/negative/over-maximum entries. Save complete marks, then publish. Editing saved marks returns the exam to draft. Unsaved fictitious marks persist in sessionStorage per exam.
6. Send reports → Preview exact sample report/message → Simulate send. Review eligible and skipped counts. Confirm to see queued → sent → simulated delivered/failed logs. A second campaign for the same exam is blocked.
7. Parent → Own child → Published report → Print / save sample PDF through the browser print dialog. Direct unrelated child or draft exam URLs are denied.
8. Admin → Message logs; then Class 6-A → Portal settings → Deactivate. Teacher A loses access immediately.

## Implementation

React + TypeScript + Vite; Tailwind v4; React Router role guards; Lucide icons; reusable cards, forms, dialogs with keyboard focus management, status pills, notifications, tables and empty/denied states. Parent layout is simplified and responsive. Meaningful chart bars derive from each child’s actual published sample marks.

`src/types.ts` defines the domain. `src/mocks.ts` seeds fictional records. `src/services.ts` exposes the replaceable typed demo repository, mock adapter and shared class/parent/send authorization functions. The Axios client is configured but **never performs network requests in the demo**. `src/store.tsx` persists fictitious data in localStorage and simulated role sessions/drafts in sessionStorage. Feature modules are `admin`, `classroom`, `onboarding`, `reports` and `parent`; `components.tsx` and `layouts.tsx` hold shared UI.

`src/tour.tsx` embeds a 600-frame, 30fps **20-second Remotion Player** with three animated scenes. Playback is opt-in with visible controls; it never drives application routing. Animation uses Remotion frame timing, not CSS keyframes. No video render or paid rendering service is required.

## Validation

`npm test` runs focused authorization, consent and report-readiness tests in `src/services.test.ts`, plus school-life privacy, attendance and migration tests in `src/school-life.test.ts`.

With the Vite dev server running, `node scripts/browser-check.mjs` runs the complete browser journey using Playwright and installed Chrome. Screenshots and results are saved to `verification/`. If Chrome is unavailable, install it or change the Playwright channel to an installed browser. See `verification/RESULTS.md` for actual run outcomes; a test script alone does not mean checks passed.

`node scripts/browser-edges.mjs` exercises reporting edge cases. `node scripts/browser-school-life.mjs` exercises new notices and acknowledgements, private-note isolation, attendance, meeting-request conversations, teacher replies, homework completion, leave approval, logo upload/validation, brand persistence and mobile layouts. The school-life suite checks both runtime exceptions and console/resource errors.

## Mock limitations and backend handoff

This is client-side demonstration logic, **not production security**. DevTools can alter browser state. There is one fictional school, a primary guardian per child, fake OTP, no actual identity checks, no database, no Meta API, no real WhatsApp, no billing, and no production delivery claims. Persistent demo data is shared by roles in this browser deliberately to demonstrate the flow. Closing the browser during a simulation may leave a queued sample log. Printed PDFs use the browser dialog. No QR generation is included; scoped invitation URLs are provided.

Future FastAPI/MySQL API contracts must include:

- Session endpoints `/auth/session`, OTP challenge/verify, logout, server-side tenant/role authorization and rate limits. Remove the demo role switcher in production.
- `/schools/:schoolId` branding and activation; `/classes` CRUD, activation, per-class sending policy; `/teachers` access suspension and class assignments. Audit every grant/revoke.
- `/classes/:classId/students` roster CRUD and uniqueness checks; `/exams` subjects and per-subject maximums; transactional `/exams/:examId/marks` validation; publish/unpublish with report versioning.
- Scoped, expiring, revocable `/invites`; `/guardian-submissions`; separate phone-control challenges and consent records, refusal, re-verification, guardian-child relationships. Store PII server-side with appropriate access controls; do not use this demo fingerprint scheme as production PII protection.
- `/me/children` and `/me/children/:id/reports/:examId`: enforce verified reciprocal ownership and published report scope on every request.
- `/report-campaigns/preview` readiness counts and skip reasons; idempotent campaign enqueue; delivery status webhooks and role-scoped `/report-logs`. Real send eligibility must be recalculated server-side immediately before enqueueing.
- Official WhatsApp Business template approval and backend-only credentials; retry-safe queue workers; consent audit trails; true delivery status only from provider webhooks.
- Tenant-scoped `/classes/:classId/attendance` daily register with date/status validation and audit history; parent-owned `/me/children/:id/attendance` monthly reads.
- `/notices` school/class/student audiences, publication state, authorized authors, private behaviour/uniform categories and explicit `/notices/:id/acknowledgements`. Validate the student/class relationship on every write and enforce parent ownership on reads.
- `/conversations` and `/messages` with guardian/student/class/teacher membership, assignment revocation, moderation visibility, availability, school-hours policy and server-side rate limits. Meeting requests in this demo are messages, not calendar bookings.
- `/classes/:id/diary` tasks and parent completion records scoped by child; `/leave-requests` with date overlap checks, teacher decisions and separate attendance recording.
- School logo upload validation, asset storage, tenant branding and accessible theme tokens. The local data-URL implementation is only for the demo.

The original minimal database draft needs a separate redesign for tenant/class activation, assignments, invitations, guardians, consent, campaigns and immutable audit history before backend implementation.
