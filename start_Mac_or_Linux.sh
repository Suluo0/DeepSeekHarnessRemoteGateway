#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[remote-gateway:start] Node.js 22+ was not found in PATH."
  echo "[remote-gateway:start] Install Node.js, then run this script again."
  exit 1
fi

node scripts/start.js
