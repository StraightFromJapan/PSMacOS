# 🚀 Automated Build System

This folder contains GitHub Actions workflows that automatically build Psychological Studio for multiple platforms.

## 📋 Available Workflows

### 1. `build-all-platforms.yml` (Recommended)
Builds for **both Windows and macOS** automatically.

**Triggers:**
- Push to `main` or `master` branch
- Creating a tag (e.g., `v3.0.0`)
- Manual trigger via Actions tab

**Builds:**
- ✅ Windows 64-bit Installer (.exe)
- ✅ macOS Universal DMG (Intel + Apple Silicon)

### 2. `build-macos-release.yml`
Standalone macOS build workflow.

## 🎯 How to Use

### Method 1: Push to GitHub (Automatic)
1. Make your changes
2. Run `QUICK-PUSH.ps1` or `push-and-build.ps1`
3. GitHub Actions will automatically build both platforms
4. Download builds from the [Actions tab](https://github.com/psypower999/Psychological-Studio/actions)

### Method 2: Manual Trigger
1. Go to [Actions tab](https://github.com/psypower999/Psychological-Studio/actions)
2. Select "Build All Platforms"
3. Click "Run workflow"
4. Choose branch and click "Run workflow"

### Method 3: Create a Release Tag
```bash
git tag v3.0.0
git push origin v3.0.0
```
This will:
- Build both platforms
- Create a GitHub Release
- Attach installers automatically

## 📥 Downloading Builds

### From Actions Tab:
1. Go to [Actions](https://github.com/psypower999/Psychological-Studio/actions)
2. Click on the latest successful workflow run
3. Scroll to **Artifacts** section
4. Download:
   - `Psychological-Studio-Windows.zip` (Windows installer)
   - `Psychological-Studio-macOS.zip` (macOS DMG)

### From Releases:
If you pushed a tag, builds will appear in [Releases](https://github.com/psypower999/Psychological-Studio/releases)

## ⚙️ Build Configuration

Builds are configured in `package.json` under the `build` section:

- **Windows**: NSIS installer with custom branding
- **macOS**: Universal DMG for Intel (x64) and Apple Silicon (arm64)

## 🔧 Build Requirements

GitHub Actions runners include:
- ✅ Node.js 18
- ✅ npm/npx
- ✅ electron-builder
- ✅ Platform-specific build tools

**No manual setup required!** Everything is automated.

## 📊 Build Status

Check current build status: [Actions Tab](https://github.com/psypower999/Psychological-Studio/actions)

- 🟢 Green checkmark = Build successful
- 🔴 Red X = Build failed (click for logs)
- 🟡 Yellow dot = Build in progress

## 🎉 Quick Start

**To build macOS version right now:**
1. Run: `./QUICK-PUSH.ps1`
2. Wait 5-10 minutes
3. Download from Actions tab
4. Done! 🎊

## 📝 Notes

- macOS builds are **unsigned** (users will need to bypass Gatekeeper)
- Windows builds include custom NSIS installer with dark theme
- Builds are kept for 30 days
- Each push triggers a new build automatically

---

**Need help?** Check the [Actions logs](https://github.com/psypower999/Psychological-Studio/actions) for detailed build information.
