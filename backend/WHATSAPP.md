# Meta WhatsApp Cloud API

This first stage includes the template sender, an explicit test command, and signed delivery callbacks. Report sending in the workspace uses the simulation. The live test command reads one explicitly configured recipient.

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

## Pending before sending school reports

Implement provider-backed guardian phone verification and collect explicit WhatsApp consent. Configure a sender scoped to each school, approve the report notification template, then connect a durable outbound worker. The worker must recheck verification and consent at send time, persist the provider sender and message IDs, and reconcile ambiguous sends and callbacks that arrive before persistence. Keep marks and report details inside the authenticated parent portal. Verify the full flow against a Meta test sender before enabling real report delivery.
