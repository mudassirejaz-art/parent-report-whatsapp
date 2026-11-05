"""Exercise the WhatsApp template sender in mock mode or with a Meta test recipient."""

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.whatsapp import CloudSender


def mock_send():
    def respond(request):
        if request.method != "POST" or str(request.url) != "https://graph.facebook.com/v99.0/123/messages":
            return httpx.Response(404)
        return httpx.Response(200, json={"messages": [{"id": "wamid.local_mock"}]})

    sender = CloudSender("v99.0", "123", "local-mock-token")
    with httpx.Client(transport=httpx.MockTransport(respond), trust_env=False) as client:
        sender.send_template(client, "+12025550123", "hello_world", "en_US")
    print("Mock WhatsApp template accepted locally. No message was sent.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--mock", action="store_true", help="Test locally without credentials or network access.")
    mode.add_argument("--send", action="store_true", help="Send one real test message.")
    if parser.parse_args().mock:
        mock_send()
        return
    values = dotenv_values(ROOT / ".env")

    def setting(name, default=""):
        return os.environ.get(name, values.get(name) or default)

    try:
        sender = CloudSender(setting("WHATSAPP_GRAPH_VERSION"), setting("WHATSAPP_PHONE_NUMBER_ID"),
                             setting("WHATSAPP_ACCESS_TOKEN"))
        with httpx.Client(trust_env=False) as client:
            sender.send_template(client, setting("WHATSAPP_TEST_RECIPIENT"),
                                 setting("WHATSAPP_TEST_TEMPLATE", "hello_world"),
                                 setting("WHATSAPP_TEST_LANGUAGE", "en_US"))
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
    print("Meta accepted the test template. Acceptance does not confirm delivery.")


if __name__ == "__main__":
    main()
