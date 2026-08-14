# Baidu Pan Extension Packaging Script for PowerShell
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$ZipName = "BaiduPanExtension_v1.0.zip"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Baidu Pan Extension - Packaging Tool" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Creating zip archive..." -ForegroundColor Yellow

if (Test-Path $ZipName) {
    Remove-Item $ZipName -Force -ErrorAction SilentlyContinue
}

Compress-Archive -Path manifest.json, content.js, content.css, inject.js, deleter.js, popup, README.md -DestinationPath $ZipName -Force

if (Test-Path $ZipName) {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "  [SUCCESS] Extension zipped successfully!" -ForegroundColor Green
    Write-Host "  [LOCATION] $(Get-Location)\$ZipName" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host "  [ERROR] Packaging failed!" -ForegroundColor Red
    Write-Host "===================================================" -ForegroundColor Red
}

Write-Host ""
