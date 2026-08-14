@echo off
setlocal
cd /d "%~dp0"
call "%~dp0start_Windows.bat"
exit /b %ERRORLEVEL%
