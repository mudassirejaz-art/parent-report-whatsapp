# Meta WhatsApp Cloud API

This first stage includes the template sender, an explicit test command, and signed delivery callbacks. Report sending in the workspace still uses the simulation. The test command reads one explicitly configured recipient and has no access to the school roster.

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
