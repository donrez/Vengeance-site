@echo off
rem ============================================================
rem Sunless backend build (run locally, then upload dist/ to VDS)
rem ============================================================
setlocal
chcp 65001 >nul

echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed. Install it from https://nodejs.org
    pause
    exit /b 1
)
node --version

echo [2/4] Installing dependencies (npm ci)...
call npm ci
if errorlevel 1 (
    echo ERROR: npm ci failed
    pause
    exit /b 1
)

echo [3/4] Syntax check...
node --check app.js || goto :err
node --check db.js || goto :err
node --check server.js || goto :err

echo [4/4] Building dist/ package...
if exist dist rmdir /s /q dist
mkdir dist
copy app.js dist\ >nul
copy db.js dist\ >nul
copy server.js dist\ >nul
copy package.json dist\ >nul
copy package-lock.json dist\ >nul
copy wissend.sql dist\ >nul
copy nginx-default.conf dist\ >nul
copy .env.example dist\ >nul

echo.
echo ============================================================
echo BUILD OK. Upload dist/ to the VDS, e.g.:
echo   scp -r dist user@SERVER:/home/backend
echo
echo On the server:
echo   1. cd /home/backend
echo   2. npm ci
echo   3. psql -h localhost -U postgres -d YOUR_DB -f wissend.sql
echo   4. set env vars (see .env.example) and run: npm start
echo ============================================================
pause
exit /b 0

:err
echo ERROR: syntax check failed
pause
exit /b 1