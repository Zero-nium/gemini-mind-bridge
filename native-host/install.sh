#!/usr/bin/env bash
set -euo pipefail

echo "==> Mind Bridge Native Host Installer (macOS)"

PYTHON_BIN="/usr/bin/python3"

if [ ! -x "$PYTHON_BIN" ]; then
    echo "ERROR: Required system Python binary not found at $PYTHON_BIN" >&2
    exit 1
fi

PY_VER=$("$PYTHON_BIN" --version)
echo "Found system Python: $PY_VER"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT_PATH="$SCRIPT_DIR/host.py"
MANIFEST_SRC_PATH="$SCRIPT_DIR/manifest.json"

TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_MANIFEST_PATH="$TARGET_DIR/com.mind.bridge.json"

if [ ! -f "$HOST_SCRIPT_PATH" ]; then
    echo "ERROR: Host script missing at $HOST_SCRIPT_PATH" >&2
    exit 1
fi

if [ ! -f "$MANIFEST_SRC_PATH" ]; then
    echo "ERROR: Manifest source missing at $MANIFEST_SRC_PATH" >&2
    exit 1
fi

mkdir -p "$TARGET_DIR"

sed "s|__NATIVE_HOST_PATH__|$HOST_SCRIPT_PATH|g" "$MANIFEST_SRC_PATH" > "$TARGET_MANIFEST_PATH"

chmod 700 "$HOST_SCRIPT_PATH"
chmod 600 "$TARGET_MANIFEST_PATH"

echo "==> Installation complete!"
echo "Native host binary: $HOST_SCRIPT_PATH (chmod 700)"
echo "Chrome host manifest installed to: $TARGET_MANIFEST_PATH (chmod 600)"
