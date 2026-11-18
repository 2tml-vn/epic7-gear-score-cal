$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$venv = Join-Path $PSScriptRoot ".venv"
$python = Join-Path $venv "Scripts\python.exe"

Write-Host "Preparing build environment..." -ForegroundColor Cyan
if (-not (Test-Path $python)) {
  python -m venv $venv
}
& $python -m pip install --quiet --upgrade pip
& $python -m pip install --quiet -r requirements.txt

Write-Host "Generating icon..." -ForegroundColor Cyan
& $python tools/make_icon.py

Write-Host "Building E7GearSheet.exe..." -ForegroundColor Cyan
& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name E7GearSheet `
  --icon assets/icon.ico `
  --add-data "web;web" `
  --add-data "assets;assets" `
  --collect-all webview `
  app.py

Write-Host ""
Write-Host "Done: dist\E7GearSheet.exe" -ForegroundColor Green
