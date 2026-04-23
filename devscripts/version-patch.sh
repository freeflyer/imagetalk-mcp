#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Bumps the patch number in package.json (e.g. 0.1.0 -> 0.1.1) only.
# Does NOT create a git commit or tag — that's up to the caller (so the
# version bump can be folded into an existing commit via `git commit --amend`).
npm version patch --no-git-tag-version
