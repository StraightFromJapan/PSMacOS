Add-Type -AssemblyName System.Drawing

# Create sidebar image (164x314)
$sidebarBmp = New-Object System.Drawing.Bitmap(164, 314)
$graphics = [System.Drawing.Graphics]::FromImage($sidebarBmp)
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 26, 46))
$graphics.FillRectangle($darkBrush, 0, 0, 164, 314)
$redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(147, 0, 24))
$graphics.FillRectangle($redBrush, 0, 0, 4, 314)
$sidebarBmp.Save("build\installer-sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$graphics.Dispose()
$sidebarBmp.Dispose()
Write-Host "Created installer-sidebar.bmp (164x314)" -ForegroundColor Green

# Create header image (150x57)
$headerBmp = New-Object System.Drawing.Bitmap(150, 57)
$graphics = [System.Drawing.Graphics]::FromImage($headerBmp)
$graphics.FillRectangle($darkBrush, 0, 0, 150, 57)
$graphics.FillRectangle($redBrush, 0, 54, 150, 3)
$headerBmp.Save("build\installer-header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$graphics.Dispose()
$headerBmp.Dispose()
Write-Host "Created installer-header.bmp (150x57)" -ForegroundColor Green

$darkBrush.Dispose()
$redBrush.Dispose()

Write-Host "`nInstaller images created successfully!" -ForegroundColor Cyan
