# Simple Screenshot Guide for Psychological Studio User Guide
# This script will guide you through taking screenshots manually

Write-Host "================================" -ForegroundColor Magenta
Write-Host "Screenshot Guide" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "We'll take 8 screenshots for the user guide." -ForegroundColor Cyan
Write-Host ""
Write-Host "For each screenshot:" -ForegroundColor Yellow
Write-Host "1. Press Win+Shift+S (Windows Snipping Tool)" -ForegroundColor White
Write-Host "2. Capture the described area" -ForegroundColor White
Write-Host "3. The screenshot will be copied to clipboard" -ForegroundColor White
Write-Host "4. Paste (Ctrl+V) into Paint or image editor" -ForegroundColor White
Write-Host "5. Save with the filename shown below" -ForegroundColor White
Write-Host ""

# Create screenshots directory
$screenshotsDir = ".\docs\screenshots"
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force
    Write-Host "✓ Created directory: $screenshotsDir" -ForegroundColor Green
}

Write-Host "Save all screenshots to: $screenshotsDir" -ForegroundColor Cyan
Write-Host ""

$screenshots = @(
    @{num=1; file="01-main-studio.png"; desc="Main Studio View with sample pads (1-100)"},
    @{num=2; file="02-arrangement-view.png"; desc="Arrangement View showing timeline, tracks, and clips"},
    @{num=3; file="03-effects-basic.png"; desc="Effects Popup - Basic Tab (Volume, Delay, Reverb, Filter)"},
    @{num=4; file="04-effects-eq.png"; desc="Effects Popup - EQ Tab with visual canvas"},
    @{num=5; file="05-effects-lfo.png"; desc="Effects Popup - LFO Tab with 4 LFO controls"},
    @{num=6; file="06-effects-automation.png"; desc="Effects Popup - Automation Tab"},
    @{num=7; file="07-controls.png"; desc="Top control panel (Play, Stop, BPM, File menu)"},
    @{num=8; file="08-clip-context-menu.png"; desc="Right-click context menu on a clip"}
)

foreach ($screenshot in $screenshots) {
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host "Screenshot $($screenshot.num)/8" -ForegroundColor Cyan
    Write-Host "Filename: $($screenshot.file)" -ForegroundColor Green
    Write-Host "Capture: $($screenshot.desc)" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Win+Shift+S now to capture..." -ForegroundColor Yellow
    $null = Read-Host "Press Enter when saved to continue"
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "✓ All screenshots captured!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Screenshots should be in: $screenshotsDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Run update-guide-with-screenshots.ps1 to embed them in the HTML" -ForegroundColor Yellow
