# Mind Bridge Native Messaging Host (macOS)

This component provides the local transport bridge between Chrome Native Messaging and the Mind process.

## Installation

```bash
chmod +x native-host/install.sh
./native-host/install.sh
```

The script will:

- Verify system Python availability at `/usr/bin/python3`
- Install `com.mind.bridge.json` manifest into `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Set executable permission `chmod 700` on `host.py` and read permission `chmod 600` on the target manifest file

## Standalone Host Testing

You can test framing and response logic directly from bash by piping framed JSON into `host.py`:

```bash
python3 -c "
import json, struct, sys, uuid, datetime
req = {
    'version': '0.1.0',
    'type': 'ask_mind',
    'requestId': str(uuid.uuid4()),
    'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    'tab': {'url': 'https://gemini.google.com/app', 'title': 'Gemini'},
    'slice': 'Hello Mind'
}
data = json.dumps(req).encode('utf-8')
sys.stdout.buffer.write(struct.pack('<I', len(data)))
sys.stdout.buffer.write(data)
" | python3 native-host/host.py
```

The host reads from stdin, processes the request, and writes a framed JSON reply to stdout. Press Ctrl+C (SIGINT) to terminate the host cleanly.

## Threat Model Recap (Transport)

1. **Pre-Allocation Payload Limit:** Payload size is checked against the 1 MB limit before any body buffer is allocated; oversized payloads are rejected immediately.
2. **Strict Protocol Rules:** Rejects malformed JSON, unparseable origins, duplicate `requestId` values, and timestamps outside the 5-minute freshness window.
3. **Breakout Protection:** Sanitizes `<gemini_untrusted_output>` tags in incoming slice text.
4. **Local Host Permissions:** Host binary (`chmod 700`) is accessible only by the current macOS user.

## v0 Scope Limits

- **Extension ID:** Manifest contains placeholder `__EXTENSION_ID__` until Step 2 extension build.
- **Mock Daemon:** Native host returns deterministic mock replies. No connection to real Mind endpoint or external daemon in v0.
