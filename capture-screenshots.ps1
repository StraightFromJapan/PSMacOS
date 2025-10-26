# Quick Screenshot Helper
# This script opens Paint and the Snipping Tool to make screenshot capture easier

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Quick Screenshot Helper" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Psychological Studio is running
$psyStudioProcess = Get-Process | Where-Object {$_.ProcessName -like "*Psychological*"}
if ($psyStudioProcess) {
    Write-Host "✓ Psychological Studio is running" -ForegroundColor Green
} else {
    Write-Host "⚠️  Psychological Studio is NOT running" -ForegroundColor Yellow
    Write-Host "   Starting it now..." -ForegroundColor Yellow
    Start-Process ".\dist\win-unpacked\Psychological Studio.exe"
    Start-Sleep -Seconds 3
}

# Create screenshots directory
$screenshotsDir = ".\docs\screenshots"
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
}

Write-Host ""
Write-Host "📁 Screenshots will be saved to:" -ForegroundColor Cyan
Write-Host "   $((Resolve-Path $screenshotsDir).Path)" -ForegroundColor White
Write-Host ""

# Open Paint for saving screenshots
Write-Host "🎨 Opening Paint for you..." -ForegroundColor Cyan
Start-Process "mspaint.exe"
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "================================" -ForegroundColor Magenta
Write-Host "How to use:" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "1. Press Win+Shift+S to capture a screenshot" -ForegroundColor White
Write-Host "2. Select the area to capture" -ForegroundColor White
Write-Host "3. Go to Paint and press Ctrl+V to paste" -ForegroundColor White
Write-Host "4. Click File > Save As > PNG" -ForegroundColor White
Write-Host "5. Save to: docs\screenshots\" -ForegroundColor White
Write-Host "6. Use exact filenames from the guide" -ForegroundColor White
Write-Host ""

Write-Host "📸 Screenshots needed:" -ForegroundColor Cyan
Write-Host ""
$screenshots = @(
    "01-main-studio.png",
    "02-arrangement-view.png",
    "03-effects-basic.png",
    "04-effects-eq.png",
    "05-effects-lfo.png",
    "06-effects-automation.png",
    "07-controls.png",
    "08-clip-context-menu.png"
)

foreach ($i in 0..($screenshots.Count - 1)) {
    $num = $i + 1
    $file = $screenshots[$i]
    $fullPath = Join-Path $screenshotsDir $file
    
    if (Test-Path $fullPath) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ⚪ $file" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "Tip: Refer to SCREENSHOT_GUIDE.html for detailed instructions!" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Monitor for new screenshots
Write-Host "Press Ctrl+C to exit monitoring..." -ForegroundColor Yellow
Write-Host ""

$lastCount = (Get-ChildItem -Path $screenshotsDir -Filter "*.png" -ErrorAction SilentlyContinue | Measure-Object).Count

while ($true) {
    Start-Sleep -Seconds 2
    $currentCount = (Get-ChildItem -Path $screenshotsDir -Filter "*.png" -ErrorAction SilentlyContinue | Measure-Object).Count
    
    if ($currentCount -ne $lastCount) {
        Write-Host "✓ New screenshot detected! ($currentCount/8 complete)" -ForegroundColor Green
        $lastCount = $currentCount
        
        if ($currentCount -eq 8) {
            Write-Host ""
            Write-Host "🎉 All 8 screenshots captured!" -ForegroundColor Green
            Write-Host "Opening USER_GUIDE.html to preview..." -ForegroundColor Cyan
            Start-Process ".\USER_GUIDE.html"
            break
        }
    }
}
