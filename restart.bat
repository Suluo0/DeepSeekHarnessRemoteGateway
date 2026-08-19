@echo off
rem DSH remote gateway restart + copy new public URL to clipboard
setlocal
cd /d %~dp0
set "GWLOG=%~dp0runtime\gateway.out.log"
set "URL="

echo [1/4] Stopping old gateway...
set "PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:8787" ^| findstr "LISTENING"') do set "PID=%%a"
if "%PID%"=="" (
  echo   not running
) else (
  taskkill /f /pid %PID% >nul 2>&1
  echo   stopped pid %PID%
)
for /f %%p in ('powershell -NoProfile -Command "Get-Process cloudflared -ErrorAction SilentlyContinue Select-Object -ExpandProperty Id"') do taskkill /f /pid %%p >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/4] Starting gateway...
if not exist runtime mkdir runtime
start "" /min cmd /c node src\index.js >>"%GWLOG%" 2>&1

echo [3/4] Waiting for public URL...
set /a i=0
:wait
set /a i+=1
set "URL="
for /f "delims=" %%u in ('powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:8787/_gateway/health -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -ExpandProperty publicUrl } catch { '' }"') do set "URL=%%u"
if defined URL goto :got
if %i% lss 20 (timeout /t 2 /nobreak >nul) & goto :wait
echo   timeout: no public URL after 40s
echo   local address still works: http://127.0.0.1:8787
pause
exit /b 1

:got
echo   %URL%

echo [4/4] Copying to clipboard...
powershell -NoProfile -Command "Set-Clipboard -Value '%URL%'; $v=(Get-Clipboard -Raw).Trim(); if ($v -eq '%URL%') { Write-Output 'Clipboard OK' } else { Write-Output 'Clipboard FAILED' }"

echo.
echo Done. New URL: %URL%
echo The URL above is now in your clipboard.
pause
