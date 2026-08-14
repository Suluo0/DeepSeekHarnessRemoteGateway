#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

./start.sh
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo
  echo "[remote-gateway:start] Startup failed. Review the messages above."
  read -r -p "Press Enter to exit"
fi

exit "$EXIT_CODE"
