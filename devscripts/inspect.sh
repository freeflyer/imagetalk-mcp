#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npx @modelcontextprotocol/inspector node build/index.js
