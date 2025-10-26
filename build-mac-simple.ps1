# Psychological Studio - macOS DMG Build Script
# Simple version without emoji issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "macOS Build - Psychological Studio" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if package.json exists
if (-Not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found. Run from project root." -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed successfully" -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] Checking icon.icns..." -ForegroundColor Yellow
if (-Not (Test-Path "icon.icns")) {
    Write-Host "WARNING: icon.icns not found" -ForegroundColor Yellow
    Write-Host "Attempting to generate from icon.png..." -ForegroundColor Yellow
    
    if (Test-Path "icon.png") {
        npm install -g png2icons 2>&1 | Out-Null
        npx png2icons icon.png icon.icns -icns 2>&1 | Out-Null
        
        if (Test-Path "icon.icns") {
            Write-Host "icon.icns generated successfully" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Could not generate icon.icns" -ForegroundColor Yellow
            Write-Host "Build will continue with default icon" -ForegroundColor Yellow
        }
    } else {
        Write-Host "WARNING: icon.png not found" -ForegroundColor Yellow
        Write-Host "Build will continue with default icon" -ForegroundColor Yellow
    }
} else {
    Write-Host "icon.icns found" -ForegroundColor Green
}
Write-Host ""

Write-Host "[3/4] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist" 2>&1 | Out-Null
    Write-Host "Cleaned dist folder" -ForegroundColor Green
} else {
    Write-Host "No previous builds found" -ForegroundColor Green
}
Write-Host ""

Write-Host "[4/4] Building macOS DMG (Universal Binary)..." -ForegroundColor Yellow
Write-Host "Building for Intel (x64) and Apple Silicon (arm64)" -ForegroundColor Cyan
Write-Host "This may take 5-10 minutes..." -ForegroundColor Cyan
Write-Host ""

npm run build-mac

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  - Update electron-builder: npm install -D electron-builder@latest" -ForegroundColor White
    Write-Host "  - Check icon.icns is valid" -ForegroundColor White
    Write-Host "  - Ensure all dependencies installed" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "BUILD SUCCESSFUL" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Find DMG file
$dmgFiles = Get-ChildItem -Path "dist" -Filter "*.dmg" -Recurse -ErrorAction SilentlyContinue
if ($dmgFiles.Count -gt 0) {
    $dmgPath = $dmgFiles[0].FullName
    $dmgSize = [math]::Round($dmgFiles[0].Length / 1MB, 2)
    
    Write-Host "DMG Location:" -ForegroundColor Cyan
    Write-Host "  $dmgPath" -ForegroundColor White
    Write-Host ""
    Write-Host "File Size: $dmgSize MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Build Info:" -ForegroundColor Cyan
    Write-Host "  - Universal Binary (Intel + Apple Silicon)" -ForegroundColor White
    Write-Host "  - macOS 10.13+ compatible" -ForegroundColor White
    Write-Host "  - Hardened Runtime enabled" -ForegroundColor White
    Write-Host "  - Professional DMG installer" -ForegroundColor White
    Write-Host ""
    
    # Check for app file
    $appFiles = Get-ChildItem -Path "dist" -Filter "*.app" -Recurse -Directory -ErrorAction SilentlyContinue
    if ($appFiles.Count -gt 0) {
        Write-Host "Also created:" -ForegroundColor Cyan
        Write-Host "  $($appFiles[0].FullName)" -ForegroundColor White
        Write-Host ""
    }
    
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Transfer DMG to Mac for testing" -ForegroundColor White
    Write-Host "  2. Double-click to mount DMG" -ForegroundColor White
    Write-Host "  3. Drag app to Applications folder" -ForegroundColor White
    Write-Host "  4. Test all features" -ForegroundColor White
    Write-Host ""
    Write-Host "See MAC_BUILD_GUIDE.md for more details" -ForegroundColor Cyan
    Write-Host ""
    
    # Open dist folder
    Write-Host "Opening dist folder..." -ForegroundColor Cyan
    Start-Process explorer.exe -ArgumentList (Resolve-Path "dist").Path
    
} else {
    Write-Host "WARNING: DMG file not found in dist folder" -ForegroundColor Yellow
    Write-Host "Check dist folder manually" -ForegroundColor White
    if (Test-Path "dist") {
        Start-Process explorer.exe -ArgumentList (Resolve-Path "dist").Path
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Build completed successfully" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
