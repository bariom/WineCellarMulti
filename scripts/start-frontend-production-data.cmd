@echo off
setlocal

rem Avvia lo script PowerShell con un bypass limitato a questo processo.
rem Non modifica la Execution Policy dell'utente o del computer.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-frontend-production-data.ps1" %*

set "START_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %START_EXIT_CODE%
