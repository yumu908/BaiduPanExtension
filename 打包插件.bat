@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Baidu Pan Extension - Packaging Tool
echo ===================================================
echo.

set "ZIP_NAME=BaiduPanExtension_v1.0.zip"

echo Creating zip archive...
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; if (Test-Path '%ZIP_NAME%') { Remove-Item '%ZIP_NAME%' -Force -ErrorAction SilentlyContinue }; Compress-Archive -Path manifest.json, content.js, content.css, inject.js, deleter.js, popup, README.md -DestinationPath '%ZIP_NAME%' -Force"

if exist "%ZIP_NAME%" (
    echo.
    echo ===================================================
    echo  [SUCCESS] Extension zipped successfully!
    echo  [LOCATION] %CD%\%ZIP_NAME%
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo  [ERROR] Packaging failed!
    echo ===================================================
)

echo.
pause
