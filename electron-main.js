const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');

// ========== HARDWARE ACCELERATION ==========
// Enable maximum hardware acceleration for smooth performance
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
let psychologicalStudioWindow = null;
let arrangementWindow = null;

// Track which window opened which child (for validation)
let psychologicalStudioOpenedFromMain = false;
let arrangementOpenedFromStudio = false;

// Auth storage path
const userDataPath = app.getPath('userData');
const authFilePath = path.join(userDataPath, 'auth.json');
// Backup auth in writable resources folder (process.resourcesPath is always writable, even in unpacked mode)
const authBackupPath = path.join(process.resourcesPath, '..', 'auth_backup.json');
// First-run marker
const firstRunMarkerPath = path.join(userDataPath, '.first-run');

/**
 * Clear app cache on fresh install
 */
function clearCacheOnFirstRun() {
    if (!fs.existsSync(firstRunMarkerPath)) {
        try {
            // Clear localStorage
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.session.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] });
            }
            // Delete auth files to force login
            if (fs.existsSync(authFilePath)) fs.unlinkSync(authFilePath);
            if (fs.existsSync(authBackupPath)) fs.unlinkSync(authBackupPath);
        } catch (err) {
            // Silent fail
        }
        // Create marker so next launch skips this
        try {
            fs.writeFileSync(firstRunMarkerPath, new Date().toISOString());
        } catch (err) {
            // Silent fail
        }
    }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    try {
        // Primary check: userData auth.json
        if (fs.existsSync(authFilePath)) {
            const data = fs.readFileSync(authFilePath, 'utf8');
            const auth = JSON.parse(data);
            const isValid = auth.authenticated === true && auth.timestamp > (Date.now() - 30*24*60*60*1000);
            if (isValid) return true;
        }

        // Fallback check: backup file next to the resources (auth_backup.json in parent of resources)
        if (fs.existsSync(authBackupPath)) {
            const data = fs.readFileSync(authBackupPath, 'utf8');
            const auth = JSON.parse(data);
            const isValid = auth.authenticated === true && auth.timestamp > (Date.now() - 30*24*60*60*1000);
            if (isValid) return true;
        }
    } catch (error) {
        // Silent fail
    }
    return false;
}

/**
 * Create main window - Load PsychologicalStudio.html directly (always)
 */
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
            sandbox: true,
            devTools: isDev,  // Only enable in development
            webSecurity: true,  // Prevent file:// access
            allowRunningInsecureContent: false
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    // Always load PsychologicalStudio.html directly
    console.log('[Electron Main] Loading PsychologicalStudio.html');
    mainWindow.loadFile(path.join(__dirname, 'PsychologicalStudio.html'));
    
    // Set flag to allow PsychologicalStudio window to be opened properly
    psychologicalStudioOpenedFromMain = true;
    
    // DISABLE dev tools in production
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // 🔒 SECURITY: Disable F12, Ctrl+Shift+I, Ctrl+Shift+C, right-click menu
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (!isDev) {
            // Disable F12 (dev tools)
            if (input.control === false && input.shift === false && input.alt === false && input.meta === false && input.keyCode === 123) {
                event.preventDefault();
            }
            // Disable Ctrl+Shift+I (dev tools)
            if (input.control && input.shift && input.keyCode === 73) {
                event.preventDefault();
            }
            // Disable Ctrl+Shift+C (dev tools)
            if (input.control && input.shift && input.keyCode === 67) {
                event.preventDefault();
            }
            // Disable Ctrl+Shift+J (console)
            if (input.control && input.shift && input.keyCode === 74) {
                event.preventDefault();
            }
            // Disable Right-click context menu
            if (input.keyCode === 93) {
                event.preventDefault();
            }
        }
    });

    // Disable right-click context menu in production
    if (!isDev) {
        mainWindow.webContents.on('context-menu', (e) => {
            e.preventDefault();
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        psychologicalStudioOpenedFromMain = false;
        if (psychologicalStudioWindow) {
            psychologicalStudioWindow.close();
        }
        if (arrangementWindow) {
            arrangementWindow.close();
        }
    });
}

/**
 * Create Psychological Studio window
 * ONLY allowed to be opened from PsyStudio (main window)
 */
function createPsychologicalStudioWindow() {
    // SECURITY: Only allow if opened from main window
    if (!psychologicalStudioOpenedFromMain) {
        return;
    }

    if (psychologicalStudioWindow) {
        psychologicalStudioWindow.focus();
        return;
    }

    psychologicalStudioWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
            sandbox: true,
            devTools: isDev,
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        parent: mainWindow,
        show: false
    });

    psychologicalStudioWindow.loadFile(path.join(__dirname, 'PsychologicalStudio.html'));
    psychologicalStudioWindow.once('ready-to-show', () => {
        psychologicalStudioWindow.show();
    });

    // 🔒 SECURITY: Disable F12, Ctrl+Shift+I, Ctrl+Shift+C, right-click menu
    psychologicalStudioWindow.webContents.on('before-input-event', (event, input) => {
        if (!isDev) {
            if (input.control === false && input.shift === false && input.alt === false && input.meta === false && input.keyCode === 123) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 73) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 67) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 74) {
                event.preventDefault();
            }
            if (input.keyCode === 93) {
                event.preventDefault();
            }
        }
    });

    if (!isDev) {
        psychologicalStudioWindow.webContents.on('context-menu', (e) => {
            e.preventDefault();
        });
    }

    if (isDev) {
        psychologicalStudioWindow.webContents.openDevTools();
    }

    psychologicalStudioWindow.on('closed', () => {
        psychologicalStudioWindow = null;
        arrangementOpenedFromStudio = false; // Reset arrangement flag
    });
}

/**
 * Create Arrangement window
 * ONLY allowed to be opened from PsychologicalStudio
 */
function createArrangementWindow() {
    // SECURITY: Only allow if opened from PsychologicalStudio
    if (!arrangementOpenedFromStudio) {
        return;
    }

    if (arrangementWindow) {
        arrangementWindow.focus();
        return;
    }

    arrangementWindow = new BrowserWindow({
        width: 1800,
        height: 1000,
        minWidth: 1400,
        minHeight: 800,
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
            sandbox: true,
            devTools: isDev,
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        parent: mainWindow,
        show: false
    });

    arrangementWindow.loadFile(path.join(__dirname, 'arrangement.html'));
    
    // Clear cache in development mode to always load latest changes
    if (isDev) {
        arrangementWindow.webContents.session.clearCache();
    }
    
    arrangementWindow.once('ready-to-show', () => {
        arrangementWindow.show();
    });

    // 🔒 SECURITY: Disable F12, Ctrl+Shift+I, Ctrl+Shift+C, right-click menu
    arrangementWindow.webContents.on('before-input-event', (event, input) => {
        if (!isDev) {
            if (input.control === false && input.shift === false && input.alt === false && input.meta === false && input.keyCode === 123) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 73) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 67) {
                event.preventDefault();
            }
            if (input.control && input.shift && input.keyCode === 74) {
                event.preventDefault();
            }
            if (input.keyCode === 93) {
                event.preventDefault();
            }
        }
    });

    if (!isDev) {
        arrangementWindow.webContents.on('context-menu', (e) => {
            e.preventDefault();
        });
    }

    if (isDev) {
        arrangementWindow.webContents.openDevTools();
    }

    arrangementWindow.on('closed', () => {
        arrangementWindow = null;
    });
}

/**
 * IPC Handlers for window communication
 */
ipcMain.on('open-psychological-studio', () => {
    // Only allow from main window
    psychologicalStudioOpenedFromMain = true;
    // Reuse main window by loading PsychologicalStudio page
    if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, 'PsychologicalStudio.html'));
    }
});

ipcMain.on('open-arrangement', () => {
    console.log('🟣 [MAIN] open-arrangement called');
    // Only allow from PsychologicalStudio window
    arrangementOpenedFromStudio = true;
    // Reuse main window by loading arrangement page
    if (mainWindow) {
        console.log('🟣 [MAIN] Loading arrangement.html...');
        mainWindow.loadFile(path.join(__dirname, 'arrangement.html')).then(() => {
            console.log('✅ [MAIN] Arrangement loaded');
        }).catch(err => {
            console.error('❌ [MAIN] Failed to load arrangement:', err);
        });
    } else {
        console.error('🔴 [MAIN] mainWindow is null!');
    }
});

ipcMain.on('close-psychological-studio', () => {
    // Navigate back to login instead of closing
    if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, 'PsyStudio-electron.html'));
    }
});

let isNavigating = false;
ipcMain.on('close-arrangement', () => {
    console.log('🟢 [MAIN] close-arrangement called');
    
    // Prevent multiple rapid calls (debounce)
    if (isNavigating) {
        console.log('⚠️ [MAIN] Already navigating, ignoring duplicate call');
        return;
    }
    
    isNavigating = true;
    
    // CRITICAL FIX: Windows Electron bug - webContents is corrupted after modal dialog
    // Solution: Create a NEW window and destroy the old one
    if (mainWindow) {
        console.log('🟢 [MAIN] Creating new window to replace corrupted one...');
        
        const oldWindow = mainWindow;
        const bounds = oldWindow.getBounds();
        
        // Remove the closed handler from old window to prevent mainWindow from being set to null
        oldWindow.removeAllListeners('closed');
        
        // Create fresh window
        const newWindow = new BrowserWindow({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            webPreferences: {
                preload: path.join(__dirname, 'electron-preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            },
            icon: path.join(__dirname, 'icon.ico')
        });
        
        // Attach window event handlers to new window
        newWindow.on('closed', () => {
            mainWindow = null;
        });
        
        newWindow.webContents.on('did-finish-load', () => {
            console.log('[Electron Main] Page loaded');
        });
        
        newWindow.loadFile(path.join(__dirname, 'PsychologicalStudio.html')).then(() => {
            console.log('✅ [MAIN] New window loaded, updating mainWindow reference');
            // Update the global reference BEFORE destroying old window
            mainWindow = newWindow;
            console.log('🗑️ [MAIN] Destroying old window');
            oldWindow.destroy();
            isNavigating = false;
            console.log('✅ [MAIN] Window replacement complete, mainWindow:', mainWindow ? 'OK' : 'NULL');
        }).catch(err => {
            console.error('❌ [MAIN] Failed to create new window:', err);
            mainWindow = newWindow; // Still update reference even if load fails
            isNavigating = false;
        });
    } else {
        console.error('🔴 [MAIN] mainWindow is null!');
        isNavigating = false;
    }
});

ipcMain.on('close-arrangement-to-psychological-studio', () => {
    // Navigate back to PsychologicalStudio
    if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, 'PsychologicalStudio.html'));
    }
});

// Quit app completely
ipcMain.on('quit-app', () => {
    console.log('Quit app requested - forcing immediate exit');
    // Destroy all windows first
    BrowserWindow.getAllWindows().forEach(window => {
        try {
            window.destroy();
        } catch (e) {}
    });
    // Force quit immediately
    app.exit(0);
});

ipcMain.on('set-authenticated', () => {
    // Save authentication state
    try {
        console.log('[Electron Main] set-authenticated IPC received');
        console.log('[Electron Main] Saving auth to:', authFilePath);
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.writeFileSync(authFilePath, JSON.stringify({
            authenticated: true,
            timestamp: Date.now()
        }));
        console.log('[Electron Main] ✅ Authentication saved to userData:', authFilePath);
        console.log('[Electron Main] Auth file exists:', fs.existsSync(authFilePath));
        
        // Also write a backup auth file to resources parent (useful for portable/unpacked scenarios)
        try {
            console.log('[Electron Main] Attempting to write backup auth to:', authBackupPath);
            fs.writeFileSync(authBackupPath, JSON.stringify({
                authenticated: true,
                timestamp: Date.now()
            }));
            console.log('[Electron Main] ✅ Backup authentication saved to:', authBackupPath);
        } catch (backupErr) {
            console.warn('[Electron Main] Could not write auth backup file:', backupErr.message);
        }
    } catch (error) {
        console.error('[Electron Main] Error saving auth:', error);
    }
});

ipcMain.on('clear-authenticated', () => {
    // Clear authentication state
    try {
        if (fs.existsSync(authFilePath)) {
            fs.unlinkSync(authFilePath);
        }
        console.log('✅ Authentication cleared');
    } catch (error) {
        console.error('Error clearing auth:', error);
    }
});

ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        environment: isDev ? 'development' : 'production',
        backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
        isAuthenticated: isAuthenticated()
    };
});

ipcMain.on('get-app-info-sync', (event) => {
    event.returnValue = {
        version: app.getVersion(),
        environment: isDev ? 'development' : 'production',
        backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
        isAuthenticated: isAuthenticated()
    };
});

/**
 * File System Handlers - Folder Selection for Audio Files
 */
ipcMain.handle('select-folder', async (event) => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow || BrowserWindow.getFocusedWindow(), {
            properties: ['openDirectory'],
            title: 'Select Folder with Audio Files',
            message: 'Choose a folder containing your audio files'
        });
        
        return filePaths.length > 0 ? filePaths[0] : null;
    } catch (error) {
        console.error('Error selecting folder:', error);
        return null;
    }
});

// Load project file with automatic sample loading
ipcMain.handle('load-project-file', async (event) => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow || BrowserWindow.getFocusedWindow(), {
            properties: ['openFile'],
            title: 'Load Project',
            filters: [
                { name: 'Project Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (filePaths.length === 0) {
            return { success: false, error: 'No file selected' };
        }
        
        const projectPath = filePaths[0];
        const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
        
        console.log(`✅ Loaded project: ${projectPath}`);
        
        // Auto-load custom samples from backup folder
        const projectDir = path.dirname(projectPath);
        const audioBackupFolder = projectData.audioBackupFolder || `${path.basename(projectPath, '.json')}_Audio`;
        const audioBackupPath = path.join(projectDir, audioBackupFolder);
        
        const customSampleBuffers = {};
        
        if (fs.existsSync(audioBackupPath) && projectData.customSampleFiles) {
            console.log(`🎵 Auto-loading ${Object.keys(projectData.customSampleFiles).length} custom samples...`);
            
            for (const [sampleKey, fileName] of Object.entries(projectData.customSampleFiles)) {
                const samplePath = path.join(audioBackupPath, fileName);
                
                if (fs.existsSync(samplePath)) {
                    try {
                        const fileBuffer = fs.readFileSync(samplePath);
                        customSampleBuffers[sampleKey] = {
                            data: Array.from(fileBuffer),
                            mimeType: getMimeType(samplePath),
                            size: fileBuffer.length,
                            originalFilePath: samplePath
                        };
                        console.log(`✅ Loaded: ${sampleKey} (${fileName})`);
                    } catch (err) {
                        console.warn(`⚠️ Failed to load ${sampleKey}:`, err.message);
                    }
                } else {
                    console.warn(`⚠️ Sample file not found: ${samplePath}`);
                }
            }
        }
        
        return {
            success: true,
            projectPath: projectPath,
            projectData: projectData,
            customSampleBuffers: customSampleBuffers,
            samplesLoaded: Object.keys(customSampleBuffers).length
        };
    } catch (error) {
        console.error('❌ Error loading project:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-folder-audio-files', async (event, folderPath) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Normalize path for cross-platform compatibility (macOS uses forward slashes)
        folderPath = path.normalize(folderPath);
        
        if (!fs.existsSync(folderPath)) {
            console.error('❌ Folder does not exist:', folderPath);
            return { success: false, count: 0, error: 'Folder not found' };
        }
        
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
        const files = fs.readdirSync(folderPath);
        
        let audioFileCount = 0;
        const audioFiles = [];
        const audioFilePaths = {}; // Map filename to full path for later access
        
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (audioExtensions.includes(ext)) {
                audioFileCount++;
                audioFiles.push(file);
                // Use path.join for cross-platform path concatenation
                audioFilePaths[file] = path.join(folderPath, file);
                console.log(`✅ Found audio file: ${file}`);
            }
        }
        
        console.log(`📁 Found ${audioFileCount} audio files in ${folderPath}`);
        
        // Find the calling window (could be mainWindow, arrangementWindow, or psychologicalStudioWindow)
        const callingWindow = BrowserWindow.getAllWindows().find(win => {
            try {
                return win.webContents === event.sender;
            } catch (e) {
                return false;
            }
        });
        
        // Send the audio files list to the calling window (where the request came from)
        if (callingWindow) {
            callingWindow.webContents.send('folder-audio-files-loaded', {
                folderPath,
                audioFiles,
                audioFilePaths,
                count: audioFileCount
            });
            console.log('✅ Sent folder-audio-files-loaded to renderer');
        }
        
        return { success: true, count: audioFileCount, files: audioFiles };
    } catch (error) {
        console.error('❌ Error loading folder audio files:', error);
        return { success: false, count: 0, error: error.message };
    }
});

// BATCH: Load multiple audio files at once (much faster than individual calls)
ipcMain.handle('load-audio-files-batch', async (event, filePaths) => {
    try {
        const fs = require('fs').promises; // Use async fs
        
        // Load all files in parallel
        const results = await Promise.all(
            filePaths.map(async (filePath) => {
                try {
                    // Check if file exists
                    await fs.access(filePath);
                    
                    // Read file buffer
                    const fileBuffer = await fs.readFile(filePath);
                    
                    return {
                        success: true,
                        filePath: filePath,
                        data: Array.from(fileBuffer),
                        size: fileBuffer.length
                    };
                } catch (error) {
                    return {
                        success: false,
                        filePath: filePath,
                        error: error.message
                    };
                }
            })
        );
        
        return { success: true, results };
    } catch (error) {
        console.error('❌ Error in batch load:', error);
        return { success: false, error: error.message };
    }
});

// NEW: Handle audio file loading by path (for loading individual files from selected folder)
ipcMain.handle('load-audio-file', async (event, filePath) => {
    try {
        const fs = require('fs').promises; // Use async fs for non-blocking
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            console.error('❌ File not found:', filePath);
            return { success: false, error: 'File not found' };
        }
        
        // Read file as raw buffer asynchronously (non-blocking)
        const fileBuffer = await fs.readFile(filePath);
        const mimeType = getMimeType(filePath);
        
        // OPTIMIZATION: Send buffer directly instead of converting to array
        // Electron IPC can handle buffers efficiently
        return {
            success: true,
            data: fileBuffer, // Send Buffer directly (much faster than Array.from)
            mimeType: mimeType,
            size: fileBuffer.length
        };
    } catch (error) {
        console.error('❌ Error loading audio file:', error);
        return { success: false, error: error.message };
    }
});

// Save audio file handler
ipcMain.handle('save-audio-file', async (event, audioData, format) => {
    try {
        const { dialog, BrowserWindow } = require('electron');
        
        // Get the window that made the request
        const window = BrowserWindow.fromWebContents(event.sender);
        
        // Show save file dialog
        const result = await dialog.showSaveDialog(window, {
            title: `Export to ${format.toUpperCase()}`,
            defaultPath: `arrangement.${format}`,
            filters: [
                { name: format.toUpperCase() + ' File', extensions: [format] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled) {
            return { success: false, error: 'Save cancelled' };
        }

        // Convert audio data (WAV buffer) to file
        // audioData should be an ArrayBuffer or Uint8Array
        const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
        
        // Write file
        await require('fs').promises.writeFile(result.filePath, buffer);
        
        console.log(`✅ Audio file saved: ${result.filePath}`);
        return { success: true, filePath: result.filePath };
    } catch (error) {
        console.error('❌ Error saving audio file:', error);
        return { success: false, error: error.message };
    }
});

// Helper function to get MIME type from file extension
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac'
    };
    return mimeTypes[ext] || 'audio/mpeg';
}

// project save
ipcMain.handle('save-project', async (event, projectData) => {
    console.log('🔵 [MAIN] save-project handler called');
    try {
        const { dialog, app, BrowserWindow } = require('electron');
        const fs = require('fs');
        const path = require('path');
        
        // CRITICAL FIX: Get the window that made the request to avoid blocking the entire app
        const window = BrowserWindow.fromWebContents(event.sender);
        console.log('🔵 [MAIN] Got window reference:', window ? 'OK' : 'NULL');
        
        // Show save dialog for project file
        const documentsPath = app.getPath('documents');
        console.log('🔵 [MAIN] Showing save dialog...');
        const result = await dialog.showSaveDialog(window, {
            title: 'Save Project',
            defaultPath: path.join(documentsPath, `PsyProject_${Date.now()}.json`),
            filters: [
                { name: 'Project File', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        console.log('🔵 [MAIN] Dialog closed, result:', result);

        if (result.canceled) {
            console.log('🔵 [MAIN] Save cancelled by user');
            return { success: false, error: 'Save cancelled' };
        }

        const projectPath = result.filePath;
        console.log('🔵 [MAIN] Writing file:', projectPath);
        
        // Save project JSON directly - file paths are already in projectData
        fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
        console.log('🔵 [MAIN] File written successfully');

        console.log('🔵 [MAIN] Returning success...');
        return {
            success: true,
            projectPath: projectPath
        };
    } catch (error) {
        console.error('🔴 [MAIN] Error saving project:', error);
        return { success: false, error: error.message };
    }
});

// Professional DAW project save: Save JSON + audio files in backup folder
ipcMain.handle('save-project-with-audio', async (event, projectData, customSamples) => {
    try {
        const { dialog, app, BrowserWindow } = require('electron');
        const fs = require('fs');
        const path = require('path');
        
        // Get the window that made the request
        const window = BrowserWindow.fromWebContents(event.sender);
        
        // Show save dialog for project file (default to Documents folder)
        const documentsPath = app.getPath('documents');
        const result = await dialog.showSaveDialog(window, {
            title: 'Save Project',
            defaultPath: path.join(documentsPath, `PsyProject_${Date.now()}.json`),
            filters: [
                { name: 'Project File', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled) {
            return { success: false, error: 'Save cancelled' };
        }

        const projectPath = result.filePath;
        const projectDir = path.dirname(projectPath);
        const projectName = path.basename(projectPath, '.json');
        const audioBackupDir = path.join(projectDir, `${projectName}_Audio`);

        // Create audio backup directory
        if (!fs.existsSync(audioBackupDir)) {
            fs.mkdirSync(audioBackupDir, { recursive: true });
        }

        // Save custom sample audio files (copy original files or save as WAV)
        const sampleReferences = {};
        for (const [sampleKey, audioData] of Object.entries(customSamples)) {
            // Extract original file extension from sampleKey (e.g., custom_song.mp3 -> .mp3)
            const originalFileName = sampleKey.replace('custom_', '').replace('recording_', '');
            const fileExt = path.extname(originalFileName) || '.wav';
            const fileName = `${sampleKey}${fileExt}`;
            const destPath = path.join(audioBackupDir, fileName);
            
            // If we have the original file path, COPY the original file (preserves format)
            if (audioData.originalFilePath && fs.existsSync(audioData.originalFilePath)) {
                console.log(`📁 Copying original file: ${audioData.originalFilePath} -> ${fileName}`);
                fs.copyFileSync(audioData.originalFilePath, destPath);
            } else {
                // No original file - save audio buffer as WAV
                console.log(`💾 Saving as WAV: ${fileName}`);
                const wavBuffer = audioBufferToWav(audioData);
                fs.writeFileSync(destPath, Buffer.from(wavBuffer));
            }
            
            sampleReferences[sampleKey] = fileName; // Just store filename, not full path
            console.log(`✅ Saved: ${fileName}`);
        }

        // Add audio references to project data
        projectData.audioBackupFolder = `${projectName}_Audio`;
        projectData.customSampleFiles = sampleReferences;

        // Save project JSON
        fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));

        console.log(`✅ Project saved: ${projectPath}`);
        console.log(`✅ Audio backup: ${audioBackupDir}`);

        return {
            success: true,
            projectPath: projectPath,
            audioFolder: audioBackupDir,
            samplesCount: Object.keys(sampleReferences).length
        };
    } catch (error) {
        console.error('❌ Error saving project:', error);
        return { success: false, error: error.message };
    }
});

// Helper: Convert AudioBuffer to WAV file buffer
function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const samples = audioBuffer.channels.map(ch => ch);
    const dataLength = audioBuffer.length * numChannels * bytesPerSample;
    
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            let sample = samples[channel][i];
            sample = Math.max(-1, Math.min(1, sample));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }
    
    return buffer;
}

// Helper function to get MIME type from file extension
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac'
    };
    return mimeTypes[ext] || 'audio/mpeg';
}

// Path utility handlers
ipcMain.handle('join-path', async (event, parts) => {
    return path.join(...parts);
});

ipcMain.handle('get-dirname', async (event, filePath) => {
    return path.dirname(filePath);
});

/**
 * App Event Handlers
 */
app.on('ready', () => {
    clearCacheOnFirstRun();
    createMainWindow();
    createMenu();
});

app.on('window-all-closed', () => {
    // On macOS, applications stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS, re-create window when the dock icon is clicked and no other windows are open
    if (mainWindow === null) {
        createMainWindow();
    }
});

/**
 * Application Menu
 */
const createMenu = () => {
    const viewSubmenu = isDev ? [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
    ] : [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
    ];

    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Exit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: viewSubmenu
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Psychological Studio',
                    click: () => {
                        // Open ABOUTPS.html in a new window
                        const aboutWindow = new BrowserWindow({
                            width: 900,
                            height: 700,
                            webPreferences: {
                                nodeIntegration: false,
                                contextIsolation: true
                            },
                            title: 'About Psychological Studio',
                            autoHideMenuBar: true,
                            icon: path.join(__dirname, 'icon.png')
                        });
                        
                        aboutWindow.loadFile('ABOUTPS.html');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
};

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
