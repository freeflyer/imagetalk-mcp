@echo off
cd /d "%~dp0\.."
rem Bumps the patch number in package.json (e.g. 0.1.0 -> 0.1.1) only.
rem Does NOT create a git commit or tag - that's up to the caller (so the
rem version bump can be folded into an existing commit via `git commit --amend`).
call npm version patch --no-git-tag-version
