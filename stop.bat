@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0" || exit /b 1
echo 正在停止 AirFold，等待进行中的传输结束...
node scripts\launcher.js stop
if errorlevel 1 goto :failed
popd
exit /b 0

:failed
popd
pause
exit /b 1
