@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Baidu Pan Extension - One-Click Packaging Tool
echo ===================================================
echo.

set "OUTPUT_ZIP=BaiduPanExtension_v1.0.zip"

if exist "%OUTPUT_ZIP%" del /f /q "%OUTPUT_ZIP%"

echo Packaging Chrome Extension files...
echo.

tar.exe -a -c -f "%OUTPUT_ZIP%" manifest.json content.js content.css inject.js deleter.js popup README.md

if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo  [SUCCESS] Extension zip created successfully!
    echo  [ZIP PATH] %CD%\%OUTPUT_ZIP%
    echo ===================================================
) else (
    echo ===================================================
    echo  [ERROR] Packaging failed!
    echo ===================================================
)

echo.
pause
