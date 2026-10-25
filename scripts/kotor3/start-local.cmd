@echo off
rem KOTOR III (fan), local play: double-click this file.
rem It builds and serves KotOR.js on this PC at http://localhost:8080 and opens the launcher in Chrome.
rem Close this window to stop the local server. Nothing is uploaded anywhere.
title KOTOR III (fan) local server - close this window to stop
cd /d "%~dp0\..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing packages. This takes a few minutes.
  call npm install
)
echo Starting the local server. Chrome opens in about 30 seconds.
start "" cmd /c "timeout /t 30 >nul & start "" chrome "http://localhost:8080/launcher/""
call npm run dev
