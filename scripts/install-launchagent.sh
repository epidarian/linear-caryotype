#!/usr/bin/env bash
set -euo pipefail

LABEL="dev.caryotype.linear"
SRC="$(cd "$(dirname "$0")/.." && pwd)/installer/${LABEL}.plist"
DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/Linear Caryotype"

mkdir -p "${LOG_DIR}"
mkdir -p "${HOME}/Library/LaunchAgents"
cp "${SRC}" "${DEST}"

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}" "${DEST}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "${DEST}"
launchctl enable "gui/${UID_NUM}/${LABEL}"
echo "Installed LaunchAgent: ${DEST}"
