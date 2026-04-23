#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Publishes the current package.json version to npm under the @imagetalk scope.
# If your npm account has 2FA enabled with an authenticator app, pass the
# 6-digit one-time password as the first argument:
#     devscripts/publish.sh 123456
# With a passkey (e.g. Windows Hello), omit the argument and npm will open a
# browser prompt for authentication.
OTP_ARG=""
if [ -n "${1:-}" ]; then
    OTP_ARG="--otp=$1"
fi
npm publish --access public $OTP_ARG
