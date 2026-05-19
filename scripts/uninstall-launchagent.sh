#!/usr/bin/env bash
set -euo pipefail

LABEL="dev.caryotype.linear"
DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

if [[ -f "${DEST}" ]]; then
  launchctl bootout "gui/${UID_NUM}" "${DEST}" 2>/dev/null || true
  rm -f "${DEST}"
  echo "Removed LaunchAgent: ${DEST}"
else
  echo "No LaunchAgent at ${DEST}"
fi
