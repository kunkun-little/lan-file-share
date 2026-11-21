@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本。
  goto :failed
)
if exist "node_modules\qrcode-generator\package.json" goto :launch
echo 正在安装项目依赖...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :failed

:launch
node scripts\launcher.js start
if errorlevel 1 goto :failed
if /i not "%~1"=="--no-browser" start "" "http://127.0.0.1:8787/"
popd
exit /b 0

:failed
popd
pause
exit /b 1
