@echo off
cd /d "%~dp0\.."
rem Publishes the current package.json version to npm under the @imagetalk scope.
rem If your npm account has 2FA enabled with an authenticator app, pass the
rem 6-digit one-time password as the first argument:
rem     devscripts\publish.bat 123456
rem With a passkey (e.g. Windows Hello), omit the argument and npm will open a
rem browser prompt for authentication.
if "%~1"=="" (
    call npm publish --access public
) else (
    call npm publish --access public --otp=%~1
)
