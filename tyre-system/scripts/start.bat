@echo off
REM Resolve project root from this script's location (scripts\..\)
set "PROJECT_DIR=%~dp0.."

echo ========================================
echo  Tyre Sales Management System - Dev Mode
echo ========================================
echo.
echo Project: %PROJECT_DIR%
echo.

REM Start backend in a new window
echo Starting backend server...
start "Tyre Backend" cmd /k "cd /d "%PROJECT_DIR%\backend" && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend in a new window
echo Starting frontend dev server...
start "Tyre Frontend" cmd /k "cd /d "%PROJECT_DIR%\frontend" && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:8000/docs
echo.
echo Close the terminal windows to stop the servers.
pause
