# Branded installer images for Psychological Studio
# Brand colors: Dark #1a1a2e, Red #930018, White #FFFFFF

Add-Type -AssemblyName System.Drawing

Write-Host "Creating professional installer images..." -ForegroundColor Cyan

# Colors
$darkBg = [System.Drawing.Color]::FromArgb(26, 26, 46)
$redAccent = [System.Drawing.Color]::FromArgb(147, 0, 24)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255)
$lightGray = [System.Drawing.Color]::FromArgb(113, 125, 159)

# ===== SIDEBAR IMAGE (164x314) =====
$sidebarBmp = New-Object System.Drawing.Bitmap(164, 314)
$graphics = [System.Drawing.Graphics]::FromImage($sidebarBmp)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Dark background
$darkBrush = New-Object System.Drawing.SolidBrush($darkBg)
$graphics.FillRectangle($darkBrush, 0, 0, 164, 314)

# Red accent stripe on left
$redBrush = New-Object System.Drawing.SolidBrush($redAccent)
$graphics.FillRectangle($redBrush, 0, 0, 6, 314)

# Red gradient accent at top
$gradientBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, 80)),
    $redAccent,
    $darkBg
)
$graphics.FillRectangle($gradientBrush, 6, 0, 158, 80)

# Add "PS" logo-style text at top
$logoFont = New-Object System.Drawing.Font("Arial Black", 32, [System.Drawing.FontStyle]::Bold)
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$graphics.DrawString("PS", $logoFont, $whiteBrush, 45, 20)

# Product name
$titleFont = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$graphics.DrawString("Psychological", $titleFont, $whiteBrush, 28, 100)
$graphics.DrawString("Studio", $titleFont, $whiteBrush, 50, 120)

# Version
$versionFont = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$grayBrush = New-Object System.Drawing.SolidBrush($lightGray)
$graphics.DrawString("v3.0.0", $versionFont, $grayBrush, 58, 145)

# Tagline at bottom
$taglineFont = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Regular)
$graphics.DrawString("Professional DAW", $taglineFont, $grayBrush, 35, 260)
$graphics.DrawString("Music Production", $taglineFont, $grayBrush, 35, 275)
$graphics.DrawString("Psypower Studios", $taglineFont, $grayBrush, 35, 295)

$sidebarBmp.Save("build\installer-sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
Write-Host "✓ Created installer-sidebar.bmp (164x314)" -ForegroundColor Green

# ===== HEADER IMAGE (150x57) =====
$headerBmp = New-Object System.Drawing.Bitmap(150, 57)
$graphics = [System.Drawing.Graphics]::FromImage($headerBmp)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Dark background
$graphics.FillRectangle($darkBrush, 0, 0, 150, 57)

# Red accent line at bottom
$graphics.FillRectangle($redBrush, 0, 54, 150, 3)

# Red accent stripe on left
$graphics.FillRectangle($redBrush, 0, 0, 4, 57)

# Mini "PS" logo
$miniLogoFont = New-Object System.Drawing.Font("Arial Black", 16, [System.Drawing.FontStyle]::Bold)
$graphics.DrawString("PS", $miniLogoFont, $whiteBrush, 10, 15)

# Product name
$headerTitleFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$graphics.DrawString("Psychological Studio", $headerTitleFont, $whiteBrush, 42, 20)

$headerBmp.Save("build\installer-header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
Write-Host "✓ Created installer-header.bmp (150x57)" -ForegroundColor Green

# Cleanup
$graphics.Dispose()
$sidebarBmp.Dispose()
$headerBmp.Dispose()
$darkBrush.Dispose()
$redBrush.Dispose()
$whiteBrush.Dispose()
$grayBrush.Dispose()
$gradientBrush.Dispose()

Write-Host ""
Write-Host "Professional installer images created!" -ForegroundColor Cyan
Write-Host "Rebuild with npm run build-win" -ForegroundColor White

