# Actual verification results

## Messaging removal

The direct messaging component, all parent/admin/teacher inbox routes, class inbox tab, contact-teacher links and unread-conversation priority actions have been removed. Existing saved records are preserved without any accessible chat UI. The production build and **49 unit tests passed**. All **12 removal browser checks passed**, including each role’s navigation and old URLs, parent profile, private notices, class inbox removal and retained WhatsApp simulation logs. The remaining school-life workflows also passed; the obsolete mobile `/parent/messages` layout check was subsequently removed from that suite. Previous messaging results below are historical.

## Latest simplification pass

The production build passed (1,683 modules), and all **49 unit tests passed**. The new simplicity browser suite passed **11 checks**, verifying child-report-first ordering, removal of repeated panels, essential parent links, grouped profile navigation, exactly five primary class tabs, secondary class tool access, class access denial, collapsed demo details, Roman Urdu navigation, mobile overflow and runtime exceptions. The mobile home screenshot `simple-parent-mobile.png` was visually inspected. The 36 school-life checks and 7 updated inbox/draft/sync checks also passed: 54 browser checks passed in total for this simplification. The priority suite now verifies staff priorities and inbox read state rather than the removed parent priority panel.

## Latest bilingual-interface verification

The English / Roman Urdu interface update passed the production build (1,682 modules) and **49 / 49 unit tests**, including five catalog tests. `scripts/browser-language.mjs` checks live profile/form translation, translated form save, preference persistence on reload, Roman Urdu attendance navigation, `ur-Latn` language metadata, switching back to English, mobile overflow and runtime errors. Full school-life workflow regression results are recorded in `school-life-results.json`. Custom school messages are intentionally preserved rather than automatically machine-translated; unknown interface phrases fall back to English.

## Latest usability improvements

After adding dashboard priorities, participant-specific unread tracking, per-account reply draft recovery, mobile parent navigation and cross-tab storage synchronization:

- Production build **passed**, 1,676 modules transformed.
- **44 / 44 unit tests passed**, including six new priority/privacy tests.
- **7 / 7 usability browser checks passed** (`priorities-results.json`).
- The **36 / 36 school-life browser checks passed again**, including no runtime, console or failed-resource errors.
- Thus **43 browser checks were rerun successfully for this update**. Earlier reporting/edge-suite results below are retained as the previous baseline, not counted as fresh runs.
- `priorities-mobile.png` records the updated mobile dashboard and bottom navigation. Draft restoration is verified with a retrying assertion after React initializes the saved value.

## Previous school-life expansion baseline

Verified locally on **31 October 2026**, using Node 24.22.1, Vite 6.4.5, TypeScript 5.8.3, Vitest 3.2.7 and installed Google Chrome through Playwright.

| Check                                                            | Actual result                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production build (`node .npm-tool/bin/npm-cli.js run build`)     | **Passed** — TypeScript project check and Vite production bundle, 1,674 modules transformed |
| Unit tests (`node .npm-tool/bin/npm-cli.js test`)                | **38 / 38 passed** across reporting and school-life suites                                  |
| Full UI journey (`node scripts/browser-check.mjs`)               | **29 / 29 passed**                                                                          |
| UI edge cases (`node scripts/browser-edges.mjs`)                 | **17 / 17 passed**                                                                          |
| New school-life journey (`node scripts/browser-school-life.mjs`) | **36 / 36 passed**                                                                          |
| Combined browser checks                                          | **82 / 82 passed**                                                                          |
| Browser runtime exceptions                                       | **0** across all three suites; school-life suite also reports **0 console/resource errors** |
| Vite local preview                                               | Started successfully at **http://127.0.0.1:5173/**                                          |

The build emits a separate tour chunk, so the Remotion Player is loaded only when the tour is opened. No production bundle size warnings occurred.

## What was exercised

The expanded school-life demo was verified after the user's follow-up request. Its 36 browser checks covered publishing school-wide and class notices; preventing broadcast behaviour/uniform notes; creating and acknowledging private family notes; parent visibility isolation; daily teacher attendance with parent read-only monthly calculations; direct attendance and conversation URL denial; parent meeting-request conversations and assigned-teacher replies; preventing another teacher from reading the conversation; homework publishing and own-child completion; invalid leave dates, submission, approval and response visibility; ensuring leave approval does not auto-mark attendance; school identity edits, oversized logo rejection, valid logo upload and accent persistence; branding on sample reports; all six parent school-life screens at 390px; and mobile teacher attendance. This suite also checked browser console and failed resource responses. A missing favicon was corrected before the final successful run.

The original 29-check reporting journey and 17-check edge suite were rerun against the expanded app and passed. The 20 new unit tests cover private-note scope, guardian/teacher conversation membership, suspended teacher restrictions, forced privacy for uniform/behaviour feedback, attendance semantics, and migration preserving existing demo edits.

The 29-check journey opened every admin navigation route and all class tabs; created and activated a new assigned class portal; tested unassigned and inactive direct URLs; checked class roster isolation; rejected over-maximum marks; saved and published an assessment; submitted a fictional guardian number; rejected a wrong OTP and a verification attempt without consent; separately verified and consented; opened the new guardian’s private child dashboard; previewed the exact sample report/message; reviewed **2 eligible / 3 skipped**; completed a simulated campaign; blocked duplicate sends; checked linked and unrelated parent routes and unpublished report denial; checked cross-role route denial; deactivated a class and confirmed immediate teacher restriction; checked 390px, 768px and 1440px admin layouts and the mobile parent layout; and confirmed the Remotion Player advances into its teacher scene.

The 17 edge checks covered expired/unknown onboarding tokens, mismatched student identity, invalid Pakistan phone format, explicit consent refusal, duplicate guardian numbers, five wrong OTP attempts expiring the token, suspension and assignment revocation, newly granted teacher access, admin-paused sending, creating an exam with **50 / 75 / 100** subject maxima, missing marks, preservation of unsaved drafts across navigation, mobile marks-table scrolling, and the sample print view hiding navigation.

Unit tests independently checked school/class scope, tenant mismatches, immediate assignment/deactivation/suspension effects, reciprocal parent ownership, verification and consent, assessment totals, invalid persisted marks, publication, complete marks, class resource matching and sending permissions.

Machine-readable individual checks: `browser-results.json` and `edge-results.json`. Screenshots: `admin-desktop.png`, `admin-390.png`, `admin-768.png`, `admin-1440.png`, `parent-desktop.png`, `parent-mobile.png`, `teacher-mobile.png`, `report-print.png`. The desktop admin, mobile parent, mobile teacher and sample print screenshots were also visually inspected.

Expanded feature results: `school-life-results.json`. New screenshots: `school-life-parent-desktop.png`, `school-life-parent-mobile.png`, `school-life-notices-mobile.png`, `school-life-messages-mobile.png` and `school-life-attendance-mobile.png`. The updated mobile parent dashboard and family conversation layout were visually inspected.

## Environment notes

`npm` was initially missing from PATH. A local npm 10.9.4 CLI was downloaded, then `npm install` was attempted. The network resolver stalled, so it was stopped and the bundled pnpm completed dependency extraction after retries. pnpm reported its blocked esbuild postinstall policy; the platform binary was present, and the subsequent actual build and tests succeeded. An offline npm lock-only attempt against pnpm’s linked dependency tree failed with `EUNSUPPORTEDPROTOCOL` (`workspace:*`). **Do not interpret this as a successful npm install verification.** A pnpm lockfile is included for the tested dependency versions; a normal clean npm installation is documented but was not completed here.

The cached dependency installation was subsequently finalized with `pnpm install --offline`: **exit code 0**, lockfile up to date, and esbuild's native-binary postinstall check completed successfully. `pnpm-workspace.yaml` permits only the required esbuild build step.

The restricted Windows sandbox prevented esbuild from reading a parent directory on the initial test attempt. Build, test, preview and Chrome checks then ran successfully with the approved execution scope. This is a workstation execution constraint, not an application error.

These tests verify a frontend simulation. They do not establish production authorization, actual guardian identity, real OTP delivery, consent-law compliance or real WhatsApp delivery. No live auth, OTP or WhatsApp calls are implemented.
