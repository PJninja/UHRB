@echo off
taskkill /f /im vite.exe >nul 2>&1
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*vite*' } | Stop-Process -Force" >nul 2>&1
start "UHRB Server" cmd /k "cd /d %~dp0server && npm run dev"
start "UHRB Client" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
