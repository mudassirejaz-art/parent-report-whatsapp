# Meta WhatsApp Cloud API

ParentReport supports local simulation and a separately configured single-school live pilot. The test command reads one explicitly configured recipient.

## Local mock mode

Run `backend/.venv/Scripts/python.exe backend/scripts/send_whatsapp_test.py --mock` from the repository root. This exercises the same template sender and response parser with an in-memory Meta response and a fictional recipient. The mock works without reading `backend/.env` or opening a network connection.

For the school workflow, open a published exam in the connected workspace and select **Simulate WhatsApp queue**. Eligible fictional parent links enter the simulation history. The mock command tests the provider adapter separately from this database queue.

## Process the local simulation queue

Apply migration `014_simulation_worker.sql`, restart the API, and queue a simulation from a published exam. With local onboarding enabled, run `backend/.venv/Scripts/python.exe backend/scripts/run_whatsapp_simulation.py` to process up to 50 due jobs. Refresh **Recent simulations** in the exam to see the result. Each run is a bounded batch, so run the command again to process more work.

To test recovery, start with `--fail first`, wait at least five seconds, then run again. Use `--fail always` for the failure path. Temporary failures retry after five and ten seconds and stop after three attempts. The worker rechecks class access and guardian consent, locks each job through the mock call, and updates simulation records only. It uses a fictional destination and an in-memory response.

## Test with Meta

1. Create a WhatsApp Cloud API app and choose its test sender. Add and verify a test recipient in Meta's API Setup. Use a template approved for that sender, such as `hello_world` if available.
2. In ignored `backend/.env`, set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` to the version in Meta API Setup, `WHATSAPP_ACCESS_TOKEN`, and `WHATSAPP_TEST_RECIPIENT` in international format with a leading plus. Optional overrides are `WHATSAPP_TEST_TEMPLATE` and `WHATSAPP_TEST_LANGUAGE`. The sender currently accepts static templates with no parameters.
3. Run `backend/.venv/Scripts/python.exe backend/scripts/send_whatsapp_test.py --send` to send one real test message. A successful response means Meta accepted the request. Check the test phone for delivery. If acceptance is uncertain after a timeout, check the phone before retrying.

See the [official template request](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text).

## Delivery callbacks

Apply migration `013_whatsapp_callbacks.sql`. On an HTTPS deployment, configure `APP_WHATSAPP_WEBHOOK=true`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, and a random `WHATSAPP_VERIFY_TOKEN`. Restart the API and register `/api/v1/webhooks/whatsapp` in Meta with the same verify token and subscribe to the `messages` field. Keep webhook query strings out of access logs. Follow [Meta's webhook handshake and signature reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/).

The callback checks the raw-body signature, filters to the configured sender, and updates matching real deliveries by sender ID and Meta message ID. Duplicate and late callbacks cannot regress a delivered or read status. Unmatched callbacks, including those for CLI test messages, are acknowledged without creating records. The application retains only the normalized status and a generic failure code.

## Enable one school on a production host

Follow [the deployment runbook](deploy/PILOT.md). Set `APP_WHATSAPP_LIVE=true` only after configuring HTTPS, the webhook and the test sender. The live app requires a dedicated `ONBOARDING_KEY` for encrypted contacts and challenge hashing, a `WHATSAPP_SCHOOL_ID` from the pilot school, and separate approved `WHATSAPP_OTP_TEMPLATE` and `WHATSAPP_REPORT_TEMPLATE` names. `WHATSAPP_TEMPLATE_LANGUAGE` must match both approved templates.

Use a WhatsApp authentication template with a copy-code button. The app supplies the same six-digit OTP to the body and button. The report notification is a static template that directs the guardian to the authenticated portal. It should contain no grades, names or personalized link parameters. See [Meta's copy-code template reference](https://www.postman.com/meta/whatsapp-business-platform/request/6vkv46u/create-authentication-template-w-otp-copy-code-button).

In live mode a valid student invitation sends an OTP to the submitted phone, and the parent opens the separate verification link and enters the code. Codes expire after ten minutes, lock after five incorrect entries and can be used once. Each number can receive up to three challenge requests in an hour. If Meta does not confirm OTP acceptance, the school can issue a new invitation after checking the number. Guardians can complete verification without agreeing to report notifications.

After publishing, staff use **Queue real WhatsApp notifications**. The worker checks guardian verification, current report consent and staff class access again before it claims a job. Each report and guardian link can enter the real queue once. The attempt is recorded before the network call. The worker does not automatically resend uncertain outcomes. Signed callbacks can correlate early receipts using the delivery UUID included in Meta's opaque callback data. The portal shows queued, awaiting confirmation, accepted, delivered and failed counts. Review unconfirmed cases in Meta before initiating any manual follow-up.
