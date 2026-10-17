@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 LTS and run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Building the latest optimized version, then opening http://127.0.0.1:5173/
echo Keep this window open while using the app. Press Ctrl+C to stop.
call npm start -- --open
if errorlevel 1 (
  echo Startup failed. See the error above.
  echo If port 5173 is in use, close the previous server window and try again.
  pause
  exit /b 1
)
