@echo off

echo ========================================
echo  SERVER TESTS
echo ========================================
cd server
call npm test
set SERVER_EXIT=%ERRORLEVEL%
cd ..

echo.
echo ========================================
echo  FRONTEND TESTS
echo ========================================
cd client
call npm test
set FRONTEND_EXIT=%ERRORLEVEL%
cd ..

echo.
echo ========================================
if %SERVER_EXIT% EQU 0 (
    echo  Server:   PASSED
) else (
    echo  Server:   FAILED
)
if %FRONTEND_EXIT% EQU 0 (
    echo  Frontend: PASSED
) else (
    echo  Frontend: FAILED
)
echo ========================================

if "%~1"=="" pause

if %SERVER_EXIT% NEQ 0 exit /b %SERVER_EXIT%
if %FRONTEND_EXIT% NEQ 0 exit /b %FRONTEND_EXIT%
exit /b 0
