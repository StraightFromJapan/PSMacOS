# PowerShell script to take screenshots of Psychological Studio
# This will capture the active window and save screenshots

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Create screenshots directory
$screenshotsDir = ".\docs\screenshots"
if (-not (Test-Path $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
}

function Take-Screenshot {
    param (
        [string]$filename,
        [int]$delay = 2
    )
    
    Write-Host "Taking screenshot in $delay seconds: $filename" -ForegroundColor Cyan
    Write-Host "Please focus the Psychological Studio window and navigate to the desired view..." -ForegroundColor Yellow
    Start-Sleep -Seconds $delay
    
    # Get screen bounds
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Capture screenshot
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    
    # Save to file
    $filepath = Join-Path $screenshotsDir $filename
    $bitmap.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "✓ Saved: $filepath" -ForegroundColor Green
    
    # Cleanup
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host "================================" -ForegroundColor Magenta
Write-Host "Screenshot Capture Tool" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "This script will take screenshots for the user guide." -ForegroundColor White
Write-Host "Make sure Psychological Studio is open and visible!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Screenshots to capture:" -ForegroundColor Cyan
Write-Host "1. Main Studio View (sample pads)" -ForegroundColor White
Write-Host "2. Arrangement View (timeline)" -ForegroundColor White
Write-Host "3. Effects Popup - Basic Tab" -ForegroundColor White
Write-Host "4. Effects Popup - EQ Tab" -ForegroundColor White
Write-Host "5. Effects Popup - LFO Tab" -ForegroundColor White
Write-Host "6. Effects Popup - Automation Tab" -ForegroundColor White
Write-Host "7. Piano Roll / Pattern Editor" -ForegroundColor White
Write-Host "8. File Menu / Save Dialog" -ForegroundColor White
Write-Host ""

$response = Read-Host "Press Enter to start capturing screenshots (or Ctrl+C to cancel)"

# Capture screenshots with 5-second delays for manual navigation
Take-Screenshot -filename "01-main-studio.png" -delay 5
Read-Host "Navigate to ARRANGEMENT VIEW and press Enter..."

Take-Screenshot -filename "02-arrangement-view.png" -delay 3
Read-Host "Right-click a clip and open EFFECTS popup (Basic tab), then press Enter..."

Take-Screenshot -filename "03-effects-basic.png" -delay 3
Read-Host "Switch to EQ TAB in effects popup, then press Enter..."

Take-Screenshot -filename "04-effects-eq.png" -delay 3
Read-Host "Switch to LFO TAB in effects popup, then press Enter..."

Take-Screenshot -filename "05-effects-lfo.png" -delay 3
Read-Host "Switch to AUTOMATION TAB in effects popup, then press Enter..."

Take-Screenshot -filename "06-effects-automation.png" -delay 3
Read-Host "Close effects and navigate to show PIANO ROLL or PATTERN EDITOR, then press Enter..."

Take-Screenshot -filename "07-piano-roll.png" -delay 3
Read-Host "Open FILE MENU or SAVE DIALOG, then press Enter..."

Take-Screenshot -filename "08-file-menu.png" -delay 3

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "✓ All screenshots captured!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Screenshots saved to: $screenshotsDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run the update script to embed them in USER_GUIDE.html" -ForegroundColor Yellow
