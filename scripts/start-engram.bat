@echo off
REM Start Engram memory server for OpenCode
REM This script starts Engram in the background when Windows starts

REM Check if Engram is already running
netstat -ano | findstr ":7437" > nul
if %errorlevel% equ 0 (
    echo Engram server already running on port 7437
    exit /b
)

REM Start Engram in background
echo Starting Engram memory server...
start /b cmd /c "engram serve"
timeout /t 2 /nobreak > nul

REM Verify it's running
netstat -ano | findstr ":7437" > nul
if %errorlevel% equ 0 (
    echo Engram server started successfully on port 7437
) else (
    echo Failed to start Engram server
)
