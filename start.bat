@echo off
setlocal enabledelayedexpansion

echo [GHikari] Checking environment...

:: Check if python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] Python not found. Please install Python 3.7+
        pause
        exit /b 1
    ) else (
        set PY_CMD=py
    )
) else (
    set PY_CMD=python
)

:: Run strap-up.py to ensure environment and start app
%PY_CMD% strap-up.py

if %errorlevel% neq 0 (
    echo [ERROR] Application failed with exit code %errorlevel%
    pause
    exit /b %errorlevel%
)

endlocal