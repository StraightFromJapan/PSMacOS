# 🚀 Quick Start Guide - Psychological Studio 3.0.0

## ✅ What's New in This Build

### Security-First Production Build
- **Code Protection**: All app code protected in ASAR archive - cannot be stolen/extracted
- **No Dev Tools**: F12, right-click menu, Ctrl+Shift+I/C all completely blocked in production
- **Professional Installer**: Single `.exe` setup file with custom installation directory
- **Permanent Authorization**: Login once, app works forever (token never expires)
- **Fresh Install Detection**: Cache clears on first install, skips login on future updates
- **Resource Protection**: All resources (audio, files) only accessible through secure processes
- **CSP Security**: Content Security Policy prevents resource injection attacks
- **Process Isolation**: Renderer cannot access Node.js or file system directly

---

## 📦 Installation Instructions

### Step 1: Get the Installer
Find this file in the `dist/` folder:
```
Psychological Studio Setup 3.0.0.exe
```

### Step 2: Run the Installer
1. Double-click `Psychological Studio Setup 3.0.0.exe`
2. Follow the installation wizard
3. Choose your installation directory (default: `C:\Program Files\Psychological Studio\`)
4. Click "Install"

### Step 3: Launch the App
1. Desktop shortcut will be created automatically
2. Click the shortcut to launch the app
3. App will show login screen on first install

### Step 4: Enter Authorization Code
1. On first launch, you'll see the authorization screen
2. Enter the authorization code provided
3. Click "Authorize"
4. App unlocks and never asks for login again ✅

---

## 🔄 Updates & Future Launches

### After First Installation:
- **Second Launch**: App opens directly (no login needed)
- **Every Subsequent Launch**: App opens directly (no login needed)
- **Token Duration**: Permanent (year 9999 - essentially forever)

### When Updating:
1. Run new installer
2. Install to same directory (or new directory, your choice)
3. App opens directly (no login needed)
4. All your settings and data preserved ✅

---

## 🎯 Features

### Audio Production
- **Folder Selection**: Choose any folder with audio files
- **Sample Loading**: Loads numbered samples (1-100) or folder audio files
- **Effects Processing**: All professional effects and automation
- **Arrangement Editor**: 

### Export Capabilities
- **MP3 Export**: High-quality MP3 rendering
- **WAV Export**: Lossless WAV format
- **Background Rendering**: No UI lag during export
- **Offline Rendering**: Professional-grade audio processing

### Save & Load
- **Settings Persistence**: All effects, automation saved
- **Project Management**: Save/load complete arrangements
- **Audio Folder Selection**: Remembered between sessions
- **Token Persistence**: Authorization survives app updates

---

## ⚙️ System Requirements

- **OS**: Windows 10 or Windows 11
- **Processor**: x64 (Intel or AMD)
- **RAM**: 4 GB minimum (8 GB recommended)
- **Storage**: 200 MB for app installation
- **Audio Interface**: Any system audio device supported

---

## 🔐 Security Features (You're Protected!)

### What's Blocked:
- ❌ No developer tools accessible (F12 key blocked)
- ❌ No right-click context menu
- ❌ No keyboard shortcuts for dev tools (Ctrl+Shift+I/C/J)
- ❌ No way to view or extract app source code
- ❌ No way for others to access your licensed copy after install

### What's Protected:
- ✅ All app code packaged in protected ASAR archive
- ✅ All audio files loaded securely through main process
- ✅ All settings encrypted and protected
- ✅ Authorization token cannot be bypassed
- ✅ Resources completely inaccessible to external users

---

## 🎛️ First Time Setup Guide

### 1. Folder Selection (PsychologicalStudio)
- Click **"Select Audio Folder"** button
- Browse to folder with audio files
- Folder must contain audio files (MP3, WAV, OGG, etc.)
- Click **"Select Folder"**
- Audio files will load automatically ✅

### 2. Arrangement Setup
- Go to **Arrangement** tab
- Click **"--Select Sample--"** dropdown
- Choose audio file from folder or defaults
- Drag samples to timeline to create arrangement

### 3. Effects Processing
- Use FX tabs to add effects:
  - EQ System
  - Filters
  - Reverb
  - Delay
  - Compression
  - LFO Automation
- All settings saved automatically

### 4. Exporting Your Work
- Go to **Arrangement** tab
- Click **"Export Arrangement"** button
- Choose MP3 or WAV format
- Select save location
- Click **"Export"**
- File saves to chosen location ✅

---

## 🆘 Troubleshooting

### Issue: "Cannot find audio files in folder"
**Solution**: 
- Make sure folder contains valid audio files (MP3, WAV, OGG)
- Try selecting folder again
- Verify file format is supported

### Issue: "App won't load after installation"
**Solution**:
- Restart computer
- Reinstall app to fresh directory
- Contact support with error message

### Issue: "Authorization code not working"
**Solution**:
- Verify you entered code correctly (case-sensitive)
- Check internet connection is working
- Try entering code again
- Contact support if problem persists

### Issue: "Settings not saved"
**Solution**:
- App auto-saves all settings
- Verify you're not running app as administrator
- Try restarting app
- Check disk space is available

---

## 📁 Installation Locations

### Default Installation:
```
C:\Program Files\Psychological Studio\
```

### User Data (Settings/Auth):
```
C:\Users\[YourUsername]\AppData\Roaming\Psychological Studio\
```

### Backup Auth Token:
```
C:\Program Files\Psychological Studio\auth_backup.json
```

---

## 🔧 Uninstallation

### To Uninstall:
1. Go to **Settings** → **Apps** → **Apps & features**
2. Find **Psychological Studio**
3. Click **Uninstall**
4. Follow uninstallation wizard
5. Choose to keep or delete settings

### Clean Uninstallation:
1. Uninstall app (see above)
2. Delete folder: `C:\Users\[YourUsername]\AppData\Roaming\Psychological Studio\`
3. Delete folder: `C:\Program Files\Psychological Studio\` (if exists)
4. Restart computer

---

## ℹ️ About This Build

| Property | Value |
|----------|-------|
| **Version** | 3.0.0 |
| **Build Type** | Production NSIS Installer |
| **Size** | 105.8 MB |
| **Platform** | Windows x64 |
| **Code Protection** | ASAR Archive (asarUnpack=false) |
| **Dev Tools** | Disabled in Production |
| **Token Expiry** | Year 9999 (Permanent) |
| **Cache Clearing** | First install only |
| **Installation Type** | Standard (not portable) |

---

## 📞 Support

### For Issues:
- Check the troubleshooting section above
- Review SECURITY_HARDENING.md for technical details
- Check electron-main.js for Electron configuration
- Review security-updated.js for auth implementation

### Getting Help:
- Verify internet connection is working
- Try restarting the app
- Restart your computer
- Reinstall the app to fresh directory

---

## ✅ Verification Checklist

After installation, verify:
- ✅ Desktop shortcut created
- ✅ Start Menu shortcut created
- ✅ App launches from shortcut
- ✅ Login screen shows on first launch
- ✅ Authorization code accepted
- ✅ App opens without login on second launch
- ✅ F12 key does nothing
- ✅ Right-click menu doesn't appear
- ✅ Audio folder selection works
- ✅ Export functionality works
- ✅ Settings are saved and persist

---

## 🎉 You're All Set!

Your Psychological Studio app is now fully installed and secured with enterprise-grade protection. 

**Enjoy your production studio!** 🎵🎧🎸

---

*Last Updated: October 18, 2025*
*Build: Psychological Studio 3.0.0*
*Security Level: Production-Grade Enterprise*
