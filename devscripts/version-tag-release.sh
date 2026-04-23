#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Bumps the patch number in package.json (e.g. 0.1.0 -> 0.1.1),
# creates a git commit (e.g. "0.1.1") and a matching git tag (e.g. v0.1.1).
# Use this for the standard release flow that keeps one commit + one tag
# per released version. For the amend-based flow, use version-patch.sh instead.
npm version patch
