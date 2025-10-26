# =============================================================================
# Psychological Studio - macOS DMG Build Script
# =============================================================================
# This script builds a professional DMG installer for macOS
# Includes: Icon generation, Universal binary (Intel + Apple Silicon), Code signing prep
# =============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🍎 Psychological Studio - macOS Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-Not (Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found. Run this script from project root." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Step 1: Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Check if icon.icns exists, if not try to generate it
if (-Not (Test-Path "icon.icns")) {
    Write-Host "🎨 Step 2: Generating icon.icns..." -ForegroundColor Yellow
    
    if (Test-Path "icon.png") {
        Write-Host "   Using online converter method (recommended)..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "   ⚠️  MANUAL STEP REQUIRED:" -ForegroundColor Yellow
        Write-Host "   1. Visit: https://cloudconvert.com/png-to-icns" -ForegroundColor White
        Write-Host "   2. Upload icon.png" -ForegroundColor White
        Write-Host "   3. Download icon.icns" -ForegroundColor White
        Write-Host "   4. Place it in project root" -ForegroundColor White
        Write-Host "   5. Press Enter to continue..." -ForegroundColor White
        Read-Host
        
        if (-Not (Test-Path "icon.icns")) {
            Write-Host "   ⚠️  icon.icns not found. Attempting npm package method..." -ForegroundColor Yellow
            npm install -g png2icons
            npx png2icons icon.png icon.icns -icns
            
            if (-Not (Test-Path "icon.icns")) {
                Write-Host "   ⚠️  Warning: icon.icns not generated. Build will use default icon." -ForegroundColor Yellow
            } else {
                Write-Host "   ✅ icon.icns generated successfully!" -ForegroundColor Green
            }
        } else {
            Write-Host "   ✅ icon.icns found!" -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️  Warning: icon.png not found. Build will use default icon." -ForegroundColor Yellow
    }
} else {
    Write-Host "🎨 Step 2: icon.icns found ✅" -ForegroundColor Green
}
Write-Host ""

Write-Host "🔧 Step 3: Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "✅ Cleaned dist folder" -ForegroundColor Green
} else {
    Write-Host "✅ No previous builds found" -ForegroundColor Green
}
Write-Host ""

Write-Host "🏗️  Step 4: Building macOS DMG (Universal Binary)..." -ForegroundColor Yellow
Write-Host "   This will build for both Intel (x64) and Apple Silicon (arm64)" -ForegroundColor Cyan
Write-Host "   ⏱️  This may take 5-10 minutes..." -ForegroundColor Cyan
Write-Host ""

npm run build-mac

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Build failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  • Make sure you have the latest electron-builder: npm install -D electron-builder@latest" -ForegroundColor White
    Write-Host "  • Check that icon.icns is valid" -ForegroundColor White
    Write-Host "  • Ensure all dependencies are installed" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ macOS DMG BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Find the DMG file
$dmgFiles = Get-ChildItem -Path "dist" -Filter "*.dmg" -Recurse
if ($dmgFiles.Count -gt 0) {
    $dmgPath = $dmgFiles[0].FullName
    $dmgSize = [math]::Round($dmgFiles[0].Length / 1MB, 2)
    
    Write-Host "📦 DMG Location:" -ForegroundColor Cyan
    Write-Host "   $dmgPath" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 File Size: $dmgSize MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Build Info:" -ForegroundColor Cyan
    Write-Host "   • Universal Binary (Intel + Apple Silicon)" -ForegroundColor White
    Write-Host "   • macOS 10.13+ compatible" -ForegroundColor White
    Write-Host "   • Hardened Runtime enabled" -ForegroundColor White
    Write-Host "   • Professional DMG installer" -ForegroundColor White
    Write-Host ""
    
    # Check for app file too
    $appFiles = Get-ChildItem -Path "dist" -Filter "*.app" -Recurse -Directory
    if ($appFiles.Count -gt 0) {
        Write-Host "🎯 Also created:" -ForegroundColor Cyan
        Write-Host "   $($appFiles[0].FullName)" -ForegroundColor White
        Write-Host ""
    }
    
    Write-Host "🚀 Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   1. Transfer the DMG to a Mac for testing" -ForegroundColor White
    Write-Host "   2. Double-click to mount the DMG" -ForegroundColor White
    Write-Host "   3. Drag Psychological Studio to Applications folder" -ForegroundColor White
    Write-Host "   4. Test all features (especially audio and file management)" -ForegroundColor White
    Write-Host ""
    Write-Host "   📝 Optional: Code signing for distribution" -ForegroundColor Cyan
    Write-Host "      See MAC_DISTRIBUTION_GUIDE.md for details" -ForegroundColor White
    Write-Host ""
    
    # Open dist folder
    Write-Host "📂 Opening dist folder..." -ForegroundColor Cyan
    Start-Process explorer.exe -ArgumentList (Resolve-Path "dist").Path
    
} else {
    Write-Host "⚠️  Warning: DMG file not found in dist folder" -ForegroundColor Yellow
    Write-Host "   Check dist folder manually" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Build completed successfully! 🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
