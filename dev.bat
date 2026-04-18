@echo off
start "UHRB Server" cmd /k "cd /d %~dp0server && npm run dev"
start "UHRB Client" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
