@echo off
taskkill /f /im vite.exe >nul 2>&1
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*vite*' } | Stop-Process -Force" >nul 2>&1

:: Kill any process already bound to the server port (default 3000), whatever
:: started it — a previous dev.bat run, a manually launched node process, etc.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%P >nul 2>&1

start "UHRB Server" cmd /k "cd /d %~dp0server && npm run dev"
start "UHRB Client" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
