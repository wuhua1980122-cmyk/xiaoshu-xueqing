@echo off
setlocal

rem === Look for portable Node.js first, then system Node.js ===
if exist "%~dp0node\node.exe" (
  set "NODE_EXE=%~dp0node\node.exe"
  goto found
)
if exist "%~dp0node-win-x64\node.exe" (
  set "NODE_EXE=%~dp0node-win-x64\node.exe"
  goto found
)
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [Error] Node.js not found.
  echo Option 1: Install Node.js from https://nodejs.org/
  echo Option 2: Download portable Node.js and extract as "node" folder here
  pause
  exit /b 1
)
set "NODE_EXE=node"
:found

echo Starting xiaoshu classroom server...
start "xiaoshu-server" "%NODE_EXE%" "%~dp0xiaoshu-server.js"
echo Waiting for server to start...
timeout /t 2 /nobreak >nul
echo.
echo ============================================
echo   Teacher:  http://localhost:8080/teacher.html
echo   Students: see top of dashboard for URL
echo   Keep this window open. Ctrl+C stops server.
echo ============================================
echo.
start "" http://localhost:8080/teacher.html
pause >nul
