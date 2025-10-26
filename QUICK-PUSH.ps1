# Quick Push and Build Script
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git add .
git commit -m "Build: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push origin main
Write-Host "✅ Done! Check https://github.com/psypower999/Psychological-Studio/actions" -ForegroundColor Green
timeout /t 5
