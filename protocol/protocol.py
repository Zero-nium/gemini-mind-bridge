"""
Mind Bridge Protocol Implementation (v0.1.0)
Pure functions for message framing, validation, sanitization, and response generation.
Standard library dependencies only.
"""

import json
import re
import struct
import sys
import uuid
from datetime import datetime, timezone, timedelta

PROTOCOL_VERSION = "0.1.0"
MAX_PAYLOAD_SIZE = 1 * 1024 * 1024  # 1 MB strictly enforced
FRESHNESS_WINDOW_SECONDS = 300      # 5 minute timestamp window
ALLOWED_ORIGIN_PREFIX = "https://gemini.google.com/"
ALLOWED_ORIGIN_EXACT = "https://gemini.google.com"

# Regex pattern for wrapper-tag breakout sanitization
UNTRUSTED_TAG_PATTERN = re.compile(r'</?gemini_untrusted_output>')


class ProtocolError(Exception):
    """Typed exception for protocol validation and framing errors."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def get_iso_timestamp() -> str:
    """Returns current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso_timestamp(ts_str: str) -> datetime:
    """Parses an ISO-8601 string into a UTC datetime object."""
    try:
        if ts_str.endswith("Z"):
            ts_str = ts_str[:-1] + "+00:00"
        dt = datetime.fromisoformat(ts_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        raise ProtocolError("INVALID_FIELD", f"Invalid ISO-8601 timestamp format: {ts_str}")


def sanitize_slice(text: str) -> tuple:
    """
    Strips occurrences of <gemini_untrusted_output> and </gemini_untrusted_output>.
    Returns sanitized text and the count of stripped occurrences.
    """
    if not text:
        return text, 0
    matches = len(UNTRUSTED_TAG_PATTERN.findall(text))
    sanitized = UNTRUSTED_TAG_PATTERN.sub('', text)
    return sanitized, matches


def validate_request(req_dict: dict, seen_request_ids: set = None) -> tuple:
    """
    Validates request payload against protocol constraints.
    Raises ProtocolError on validation failure.
    Returns tuple of (validated_cleaned_request_dict, stripped_tag_count).
    """
    if not isinstance(req_dict, dict):
        raise ProtocolError("INVALID_JSON", "Request body must be a JSON object")

    version = req_dict.get("version")
    if version != PROTOCOL_VERSION:
        raise ProtocolError("INVALID_FIELD", f"Unsupported protocol version: {version}")

    msg_type = req_dict.get("type")
    if msg_type != "ask_mind":
        raise ProtocolError("UNKNOWN_TYPE", f"Unknown message type: {msg_type}")

    req_id = req_dict.get("requestId")
    if not req_id or not isinstance(req_id, str):
        raise ProtocolError("MISSING_FIELD", "requestId is required and must be a string")

    if seen_request_ids is not None and req_id in seen_request_ids:
        raise ProtocolError("DUPLICATE_REQUEST_ID", f"Duplicate requestId: {req_id}")

    ts_str = req_dict.get("timestamp")
    if not ts_str or not isinstance(ts_str, str):
        raise ProtocolError("MISSING_FIELD", "timestamp is required and must be a string")

    dt = parse_iso_timestamp(ts_str)
    now = datetime.now(timezone.utc)
    diff = abs((now - dt).total_seconds())
    if diff > FRESHNESS_WINDOW_SECONDS:
        raise ProtocolError("STALE_TIMESTAMP", f"Timestamp outside freshness window ({diff:.1f}s > {FRESHNESS_WINDOW_SECONDS}s)")

    tab = req_dict.get("tab")
    if not isinstance(tab, dict):
        raise ProtocolError("MISSING_FIELD", "tab field must be an object")

    url = tab.get("url")
    if not url or not isinstance(url, str):
        raise ProtocolError("MISSING_FIELD", "tab.url is required and must be a string")

    if not (url.startswith(ALLOWED_ORIGIN_PREFIX) or url == ALLOWED_ORIGIN_EXACT):
        raise ProtocolError("WRONG_ORIGIN", f"Invalid tab origin URL: {url}")

    slice_text = req_dict.get("slice")
    if slice_text is None or not isinstance(slice_text, str):
        raise ProtocolError("MISSING_FIELD", "slice field is required and must be a string")

    sanitized_text, stripped_count = sanitize_slice(slice_text)

    cleaned_req = dict(req_dict)
    cleaned_req["slice"] = sanitized_text

    return cleaned_req, stripped_count


def create_success_reply(request_id: str, draft: str) -> dict:
    """Constructs a successful ask_mind_reply payload."""
    return {
        "version": PROTOCOL_VERSION,
        "type": "ask_mind_reply",
        "requestId": request_id,
        "status": "ok",
        "draft": draft,
        "timestamp": get_iso_timestamp()
    }


def create_error_reply(code: str, message: str, request_id: str = None) -> dict:
    """Constructs an error ask_mind_reply payload."""
    return {
        "version": PROTOCOL_VERSION,
        "type": "ask_mind_reply",
        "requestId": request_id,
        "status": "error",
        "error": {
            "code": code,
            "message": message
        },
        "timestamp": get_iso_timestamp()
    }


def read_message(stream) -> dict:
    """
    Reads a 4-byte length header from stream and then the JSON body.
    Enforces maximum payload size check BEFORE allocating buffer for full message.
    Returns parsed dictionary or raises ProtocolError. Returns None on EOF.
    """
    header = stream.read(4)
    if not header:
        return None
    if len(header) < 4:
        raise ProtocolError("INVALID_MESSAGE_HEADER", "Incomplete header byte stream")

    length = struct.unpack('<I', header)[0]
    if length > MAX_PAYLOAD_SIZE:
        raise ProtocolError("OVERSIZED_PAYLOAD", f"Payload size {length} bytes exceeds maximum limit of {MAX_PAYLOAD_SIZE} bytes")

    body_bytes = stream.read(length)
    if len(body_bytes) < length:
        raise ProtocolError("INVALID_MESSAGE_BODY", "Unexpected EOF encountered while reading message body")

    try:
        return json.loads(body_bytes.decode('utf-8'))
    except Exception as e:
        raise ProtocolError("INVALID_JSON", f"Malformed JSON payload: {str(e)}")


def pack_message(data_dict: dict) -> bytes:
    """Encodes dictionary as UTF-8 JSON prepended with 4-byte little-endian length prefix."""
    json_bytes = json.dumps(data_dict, ensure_ascii=False).encode('utf-8')
    header = struct.pack('<I', len(json_bytes))
    return header + json_bytes
