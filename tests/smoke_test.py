#!/usr/bin/env python3
"""
Mind Bridge - Smoke test driver (v0.1.0)

Spawns the native host, sends one valid framed ask_mind request, and
pretty-prints the host's framed JSON reply. Lets you verify the transport
without a Chrome extension.

Usage from the repo root:
    python3 tests/smoke_test.py

Exit code 0 on status=ok, 1 on any error or non-ok status, 2 if host.py is
missing at the expected path.
"""
import json
import struct
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

HOST = Path(__file__).resolve().parent.parent / "native-host" / "host.py"


def build_request() -> bytes:
    """Returns a framed ask_mind request (4-byte LE length prefix + UTF-8 JSON body)."""
    req = {
        "version": "0.1.0",
        "type": "ask_mind",
        "requestId": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "tab": {"url": "https://gemini.google.com/app", "title": "Gemini"},
        "slice": "Hello Mind",
    }
    body = json.dumps(req).encode("utf-8")
    return struct.pack("<I", len(body)) + body


def read_framed(stream) -> dict:
    """Reads a 4-byte LE length prefix and decodes the JSON body. Raises on truncation."""
    header = stream.read(4)
    if len(header) < 4:
        raise IOError("short header: got {0} bytes".format(len(header)))
    length = struct.unpack("<I", header)[0]
    body = stream.read(length)
    if len(body) < length:
        raise IOError("short body: got {0} of {1} bytes".format(len(body), length))
    return json.loads(body.decode("utf-8"))


def main() -> int:
    if not HOST.exists():
        print("host not found at {0}".format(HOST), file=sys.stderr)
        return 2

    framed_req = build_request()

    proc = subprocess.Popen(
        ["python3", str(HOST)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        proc.stdin.write(framed_req)
        proc.stdin.close()
        reply = read_framed(proc.stdout)
    finally:
        stderr_text = proc.stderr.read().decode("utf-8", errors="replace").strip()
        rc = proc.wait()

    if stderr_text:
        print("host stderr:", stderr_text, file=sys.stderr)

    print(json.dumps(reply, indent=2))
    if rc != 0:
        print("host exited with {0}".format(rc), file=sys.stderr)
        return 1
    return 0 if reply.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
