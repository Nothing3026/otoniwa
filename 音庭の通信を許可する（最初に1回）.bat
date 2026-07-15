@echo off
setlocal

fltmc >nul 2>&1
if errorlevel 1 (
    powershell.exe -NoLogo -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo Preparing private Wi-Fi access for OTONIWA...
echo.

powershell.exe -NoLogo -NoProfile -Command "$profiles = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }; if ($profiles) { $profiles | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction Stop }"
if errorlevel 1 goto :failed

netsh advfirewall firewall delete rule name="OTONIWA Port 8000" >nul 2>&1
netsh advfirewall firewall add rule name="OTONIWA Port 8000" dir=in action=allow protocol=TCP localport=8000 profile=private >nul
if errorlevel 1 goto :failed

echo OTONIWA network access is ready.
echo Close this window, then double-click the smartphone start file.
echo.
pause
exit /b 0

:failed
echo.
echo Windows did not allow the network setting to be changed.
echo This may be restricted by an administrator or security software.
echo.
pause
exit /b 1
