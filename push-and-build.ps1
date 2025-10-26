# Psychological Studio - Push to GitHub and Trigger macOS Build
# This script will add all changes, commit, and push to trigger the automated build

Write-Host "🚀 Psychological Studio - GitHub Push Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a git repo
if (-not (Test-Path .git)) {
    Write-Host "❌ Not a git repository! Initializing..." -ForegroundColor Red
    git init
    git remote add origin https://github.com/psypower999/Psychological-Studio.git
}

# Show current status
Write-Host "📋 Current Status:" -ForegroundColor Yellow
git status --short

Write-Host ""
Write-Host "📦 Adding all changes..." -ForegroundColor Green
git add .

Write-Host ""
$commitMessage = Read-Host "💬 Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm') - Ready for macOS build"
}

Write-Host ""
Write-Host "💾 Committing changes..." -ForegroundColor Green
git commit -m "$commitMessage"

Write-Host ""
Write-Host "🌐 Pushing to GitHub..." -ForegroundColor Green
git push origin main

Write-Host ""
Write-Host "✅ Push complete! GitHub Actions will automatically:" -ForegroundColor Green
Write-Host "   1. Build Windows installer (.exe)" -ForegroundColor White
Write-Host "   2. Build macOS app (.dmg) for Intel & Apple Silicon" -ForegroundColor White
Write-Host "   3. Create artifacts you can download" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Check build status at:" -ForegroundColor Cyan
Write-Host "   https://github.com/psypower999/Psychological-Studio/actions" -ForegroundColor White
Write-Host ""
Write-Host "📥 Download builds from the Actions tab once complete!" -ForegroundColor Green

Read-Host "Press Enter to exit"
