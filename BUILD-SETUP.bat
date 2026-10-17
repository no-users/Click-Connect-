@echo off
title Click and Continue - Setup banao
echo.
echo === Click ^& Continue: Setup.exe ban raha hai (10-15 min, internet chahiye) ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js install nahi hai. Pehle https://nodejs.org se LTS download karke install karo, phir ye file dobara chalao.
  pause & exit /b 1
)
call npm install
if errorlevel 1 goto fail
call npm run dist
if errorlevel 1 goto fail
echo.
echo Ho gaya! "dist" folder me Click-and-Continue-Setup-1.0.0.exe mil jayegi.
start "" dist
pause & exit /b 0
:fail
echo Kuch galat hua. Upar ka error copy karke mujhe bhej do.
pause & exit /b 1
