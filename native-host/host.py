#!/usr/bin/python3
"""
Mind Bridge Native Messaging Host for macOS.
Communicates via Chrome Native Messaging protocol (stdin/stdout framed JSON).
Stdlib dependencies only.
"""

import sys
import signal
from datetime import datetime, timezone
from pathlib import Path

# Insert protocol module location into Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "protocol"))
import protocol

SEEN_REQUEST_IDS = set()


def log(level: str, message: str) -> None:
    iso_ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sys.stderr.write(f"[{iso_ts}] [{level}] {message}\n")
    sys.stderr.flush()


def signal_handler(signum, frame):
    log("INFO", f"Received termination signal ({signum}). Exiting native host.")
    sys.stdout.buffer.flush()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    log("INFO", "Mind Bridge native host started.")

    while True:
        try:
            raw_req = protocol.read_message(sys.stdin.buffer)
            if raw_req is None:
                log("INFO", "Standard input closed by browser. Exiting.")
                break

            request_id = raw_req.get("requestId") if isinstance(raw_req, dict) else None

            try:
                validated_req, stripped_count = protocol.validate_request(raw_req, SEEN_REQUEST_IDS)
                if stripped_count > 0:
                    log("WARN", f"Stripped {stripped_count} wrapper tag breakout occurrence(s) from slice for requestId={request_id}")

                request_id = validated_req["requestId"]
                SEEN_REQUEST_IDS.add(request_id)
                slice_len = len(validated_req["slice"])

                draft_text = f"Mock reply for requestId={request_id}, slice_length={slice_len}"
                reply_dict = protocol.create_success_reply(request_id, draft_text)
                log("INFO", f"Successfully processed ask_mind request: requestId={request_id}")

            except protocol.ProtocolError as pe:
                log("ERROR", f"Protocol validation error [{pe.code}]: {pe.message}")
                reply_dict = protocol.create_error_reply(pe.code, pe.message, request_id)

            except Exception as e:
                log("ERROR", f"Unexpected request processing failure: {str(e)}")
                reply_dict = protocol.create_error_reply("INTERNAL_ERROR", str(e), request_id)

            packed_reply = protocol.pack_message(reply_dict)
            sys.stdout.buffer.write(packed_reply)
            sys.stdout.buffer.flush()

        except protocol.ProtocolError as pe:
            log("ERROR", f"Message framing error [{pe.code}]: {pe.message}")
            reply_dict = protocol.create_error_reply(pe.code, pe.message)
            packed_reply = protocol.pack_message(reply_dict)
            sys.stdout.buffer.write(packed_reply)
            sys.stdout.buffer.flush()

        except Exception as e:
            log("ERROR", f"Fatal event loop exception: {str(e)}")
            break


if __name__ == "__main__":
    main()
