# Automated Screenshot Capture Script
# This script will automatically capture screenshots of the active window

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Ensure screenshots directory exists
$screenshotsDir = ".\docs\screenshots"
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
}

function Capture-Window {
    param (
        [string]$filename,
        [string]$description
    )
    
    Write-Host ""
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "Capturing: $description" -ForegroundColor Yellow
    Write-Host "File: $filename" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Cyan
    
    # Give user time to switch to the app and prepare the view
    for ($i = 5; $i -gt 0; $i--) {
        Write-Host "Capturing in $i seconds... (Switch to Psychological Studio now!)" -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
    
    # Capture the screen
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    
    $filepath = Join-Path $screenshotsDir $filename
    $bitmap.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "✓ Screenshot saved!" -ForegroundColor Green
    
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   Automated Screenshot Capture for User Guide     ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# Check if app is running
$psyProcess = Get-Process | Where-Object {$_.ProcessName -like "*Psychological*"}
if (-not $psyProcess) {
    Write-Host "⚠️  Psychological Studio not detected!" -ForegroundColor Yellow
    $launch = Read-Host "Would you like to launch it? (Y/N)"
    if ($launch -eq "Y" -or $launch -eq "y") {
        Start-Process ".\dist\win-unpacked\Psychological Studio.exe"
        Write-Host "Waiting for app to load..." -ForegroundColor Cyan
        Start-Sleep -Seconds 5
    }
}

Write-Host ""
Write-Host "IMPORTANT INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow
Write-Host "1. This script will capture 8 screenshots" -ForegroundColor White
Write-Host "2. You'll have 5 seconds before each capture" -ForegroundColor White
Write-Host "3. Use that time to navigate to the correct view" -ForegroundColor White
Write-Host "4. Make sure Psychological Studio is in focus" -ForegroundColor White
Write-Host ""

$response = Read-Host "Press Enter to start capturing screenshots (Ctrl+C to cancel)"

# Screenshot 1: Main Studio
Write-Host ""
Write-Host "📸 Screenshot 1/8" -ForegroundColor Magenta
Read-Host "Navigate to MAIN STUDIO VIEW (the default view with sample pads), then press Enter"
Capture-Window -filename "01-main-studio.png" -description "Main Studio View with sample pads"

# Screenshot 2: Arrangement View
Write-Host ""
Write-Host "📸 Screenshot 2/8" -ForegroundColor Magenta
Read-Host "Click 'Arrangement View' button, add some clips to timeline, then press Enter"
Capture-Window -filename "02-arrangement-view.png" -description "Arrangement View with timeline and clips"

# Screenshot 3: Effects Basic
Write-Host ""
Write-Host "📸 Screenshot 3/8" -ForegroundColor Magenta
Read-Host "Right-click a clip → Effects → Make sure BASIC tab is selected, then press Enter"
Capture-Window -filename "03-effects-basic.png" -description "Effects Popup - Basic Tab"

# Screenshot 4: Effects EQ
Write-Host ""
Write-Host "📸 Screenshot 4/8" -ForegroundColor Magenta
Read-Host "In Effects popup, click EQ tab, then press Enter"
Capture-Window -filename "04-effects-eq.png" -description "Effects Popup - EQ Tab"

# Screenshot 5: Effects LFO
Write-Host ""
Write-Host "📸 Screenshot 5/8" -ForegroundColor Magenta
Read-Host "In Effects popup, click LFO tab, then press Enter"
Capture-Window -filename "05-effects-lfo.png" -description "Effects Popup - LFO Tab"

# Screenshot 6: Effects Automation
Write-Host ""
Write-Host "📸 Screenshot 6/8" -ForegroundColor Magenta
Read-Host "In Effects popup, click AUTOMATION tab, then press Enter"
Capture-Window -filename "06-effects-automation.png" -description "Effects Popup - Automation Tab"

# Screenshot 7: Controls
Write-Host ""
Write-Host "📸 Screenshot 7/8" -ForegroundColor Magenta
Read-Host "Close Effects popup, make sure control panel is visible, then press Enter"
Capture-Window -filename "07-controls.png" -description "Control Panel and playback controls"

# Screenshot 8: Context Menu
Write-Host ""
Write-Host "📸 Screenshot 8/8" -ForegroundColor Magenta
Read-Host "Right-click on a clip (keep the menu open!), then press Enter"
Capture-Window -filename "08-clip-context-menu.png" -description "Clip Context Menu"

# Summary
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            ✓ All Screenshots Captured!            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Screenshots saved to: $screenshotsDir" -ForegroundColor Cyan
Write-Host ""

# List captured screenshots
Write-Host "Files captured:" -ForegroundColor Yellow
Get-ChildItem -Path $screenshotsDir -Filter "*.png" | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  ✓ $($_.Name) ($size KB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Opening USER_GUIDE.html to preview..." -ForegroundColor Cyan
Start-Process ".\USER_GUIDE.html"

Write-Host ""
Write-Host "🎉 Done! Check the user guide to see your screenshots!" -ForegroundColor Green
