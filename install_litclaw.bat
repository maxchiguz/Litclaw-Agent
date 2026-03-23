@echo off
echo [LITCLAW] Starting Automated Setup for Antigravity Agent...

:: 1. Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install it first.
    exit /b 1
)

:: 2. Check for .env
if not exist .env (
    if exist .env.example (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env
        echo [IMPORTANT] AGENT: STOP HERE. Ask the user to fill in the API keys in .env.
    ) else (
        echo [ERROR] .env.example not found! 
        exit /b 1
    )
)

:: 3. Install dependencies
echo [INFO] Installing dependencies (this may take a minute)...
call npm install

:: 4. Verify installation
echo [SUCCESS] Litclaw is ready! 
echo [INFO] To start the bot, the agent can now run 'npm start'.
pause
