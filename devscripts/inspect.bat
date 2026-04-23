@echo off
cd /d "%~dp0\.."
call npm run build || exit /b 1
call npx @modelcontextprotocol/inspector node build/index.js
