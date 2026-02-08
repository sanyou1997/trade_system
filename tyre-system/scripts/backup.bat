@echo off
REM Backup script for Tyre System
REM Creates timestamped backups of the database and Excel files

set PROJECT_DIR=%~dp0..
set TIMESTAMP=%date:~-4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_DIR=%PROJECT_DIR%\backups\%TIMESTAMP%

echo ============================================
echo   Tyre System Backup - %TIMESTAMP%
echo ============================================
echo.

REM Create backup directory
mkdir "%BACKUP_DIR%" 2>nul

REM Backup database
echo Backing up database...
if exist "%PROJECT_DIR%\data\tyre_system.db" (
    copy "%PROJECT_DIR%\data\tyre_system.db" "%BACKUP_DIR%\tyre_system.db" >nul
    echo   Database backed up.
) else (
    echo   No database found, skipping.
)

REM Backup Excel files (Tyres_Record is sibling to tyre-system)
set "EXCEL_SRC=%PROJECT_DIR%\..\Tyres_Record"
echo Backing up Excel files from %EXCEL_SRC%...
if exist "%EXCEL_SRC%" (
    xcopy "%EXCEL_SRC%\*.xlsx" "%BACKUP_DIR%\excel\" /Q /Y >nul 2>nul
    echo   Excel files backed up.
) else (
    echo   No Excel directory found at %EXCEL_SRC%, skipping.
)

echo.
echo Backup complete: %BACKUP_DIR%
pause
