@echo off
cd /d "%~dp0\.."
rem Bumps the patch number in package.json (e.g. 0.1.0 -> 0.1.1),
rem creates a git commit (e.g. "0.1.1") and a matching git tag (e.g. v0.1.1).
rem Use this for the standard release flow that keeps one commit + one tag
rem per released version. For the amend-based flow, use version-patch.bat instead.
call npm version patch
