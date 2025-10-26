# Simple Interactive Screenshot Taker
# Run this and follow the prompts

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screenshotsDir = ".\docs\screenshots"

function Take-Screenshot {
    param([string]$filename)
    
    Write-Host "Taking screenshot in 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    
    $filepath = Join-Path $screenshotsDir $filename
    $bitmap.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "✓ Saved: $filename" -ForegroundColor Green
    
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host "Screenshot Capture Tool" -ForegroundColor Cyan
Write-Host "======================="  -ForegroundColor Cyan
Write-Host ""

# 1
Write-Host "1/8: Main Studio View" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "01-main-studio.png"

# 2  
Write-Host "2/8: Arrangement View" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "02-arrangement-view.png"

# 3
Write-Host "3/8: Effects Basic Tab" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "03-effects-basic.png"

# 4
Write-Host "4/8: Effects EQ Tab" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "04-effects-eq.png"

# 5
Write-Host "5/8: Effects LFO Tab" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "05-effects-lfo.png"

# 6
Write-Host "6/8: Effects Automation Tab" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "06-effects-automation.png"

# 7
Write-Host "7/8: Control Panel" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "07-controls.png"

# 8
Write-Host "8/8: Context Menu" -ForegroundColor Magenta
Read-Host "Prepare the view and press Enter"
Take-Screenshot -filename "08-clip-context-menu.png"

Write-Host ""
Write-Host "✓ All done!" -ForegroundColor Green
Start-Process ".\USER_GUIDE.html"
