@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [remote-gateway:start] Node.js 22+ was not found in PATH.
  echo [remote-gateway:start] Install Node.js, then run this script again.
  pause
  exit /b 1
)

node scripts\start.js
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [remote-gateway:start] Startup failed. Review the messages above.
  pause
)

exit /b %EXIT_CODE%
