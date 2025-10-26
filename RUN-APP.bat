@echo off
REM Psychological Studio Launcher
REM This script properly runs the Electron app with all dependencies

cd /d "%~dp0\dist\win-unpacked"
start "" "Psychological Studio.exe"
