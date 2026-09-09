@echo off
rem =============================================================
rem  GRIMOIRE - double-click this to serve the app on your wi-fi,
rem  then open the printed 192.168.x.x address in Safari on your
rem  iPhone and use Share > Add to Home Screen.
rem
rem  Close this window (or press Ctrl+C) to stop the server.
rem =============================================================
title GRIMOIRE server
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
echo.
echo Server stopped. Press any key to close.
pause >nul
