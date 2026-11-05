"""Explicitly send one approved template to a Meta test recipient."""

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.whatsapp import CloudSender


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true", help="Send one real test message.")
    if not parser.parse_args().send:
        parser.error("An explicit --send is required.")
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
