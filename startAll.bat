@echo off
taskkill /F /IM node.exe >nul 2>nul
echo Starting ICG Development Environment...
echo.

rem Game Server
echo Starting Game Server on port 3001...
start cmd /k "cd /d "%~dp0server" && node index.js"

rem Client Dev Server
echo Starting Client Dev Server on port 3000...
timeout /t 2 /nobreak >nul
start cmd /k "cd /d "%~dp0client" && npm run dev"

rem Admin Panel
echo Starting Admin Panel on port 3005...
timeout /t 2 /nobreak >nul
start cmd /k "cd /d "%~dp0admin" && node server.js"

echo.
echo All services started!
echo.
echo Game Server: http://localhost:3001
echo Client: http://localhost:3000
echo Admin Panel: http://localhost:3005
echo.
echo Press any key to continue...
pause >nul
