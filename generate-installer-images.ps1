# Generate branded installer images for Psychological Studio
# Brand colors: Dark background (#1a1a2e), Red accent (#930018), White text (#FFFFFF)

Write-Host "Generating Psychological Studio installer images..." -ForegroundColor Cyan

# Create build directory if it doesn't exist
$buildDir = "build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir | Out-Null
}

# Check if ImageMagick is available (optional, for advanced image generation)
$hasImageMagick = Get-Command "magick" -ErrorAction SilentlyContinue

if ($hasImageMagick) {
    Write-Host "ImageMagick found, generating high-quality images..." -ForegroundColor Green
    
    # Generate sidebar image (164x314 pixels) - NSIS installer sidebar
    & magick -size 164x314 `
        -background "#1a1a2e" `
        -fill "#FFFFFF" `
        -font Arial-Bold -pointsize 24 `
        -gravity North `
        -annotate +0+40 "Psychological`nStudio" `
        -fill "#930018" `
        -pointsize 16 `
        -annotate +0+120 "v3.0.0" `
        -fill "#717d9f" `
        -pointsize 12 `
        -annotate +0+280 "Psypower Studios" `
        "$buildDir\installer-sidebar.bmp"
    
    # Generate header image (150x57 pixels) - NSIS installer header
    & magick -size 150x57 `
        -background "#1a1a2e" `
        -fill "#FFFFFF" `
        -font Arial-Bold -pointsize 16 `
        -gravity West `
        -annotate +10+0 "Psychological Studio" `
        "$buildDir\installer-header.bmp"
    
    Write-Host "✓ Installer images generated successfully!" -ForegroundColor Green
} else {
    Write-Host "ImageMagick not found. Installing basic fallback images..." -ForegroundColor Yellow
    Write-Host "For best results, install ImageMagick: https://imagemagick.org/script/download.php" -ForegroundColor Yellow
    
    # Create simple colored BMP files using .NET (fallback)
    Add-Type -AssemblyName System.Drawing
    
    # Sidebar image (164x314)
    $sidebarBmp = New-Object System.Drawing.Bitmap(164, 314)
    $graphics = [System.Drawing.Graphics]::FromImage($sidebarBmp)
    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 26, 46))
    $graphics.FillRectangle($darkBrush, 0, 0, 164, 314)
    
    # Add red accent stripe
    $redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(147, 0, 24))
    $graphics.FillRectangle($redBrush, 0, 0, 4, 314)
    
    $sidebarBmp.Save("$buildDir\installer-sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
    $graphics.Dispose()
    $sidebarBmp.Dispose()
    
    # Header image (150x57)
    $headerBmp = New-Object System.Drawing.Bitmap(150, 57)
    $graphics = [System.Drawing.Graphics]::FromImage($headerBmp)
    $graphics.FillRectangle($darkBrush, 0, 0, 150, 57)
    $graphics.FillRectangle($redBrush, 0, 54, 150, 3)
    
    $headerBmp.Save("$buildDir\installer-header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
    $graphics.Dispose()
    $headerBmp.Dispose()
    
    $darkBrush.Dispose()
    $redBrush.Dispose()
    
    Write-Host "✓ Basic installer images created!" -ForegroundColor Green
}

Write-Host "`nInstaller branding setup complete!" -ForegroundColor Cyan
Write-Host "Run 'npm run build-win' to build the installer with custom branding." -ForegroundColor White
