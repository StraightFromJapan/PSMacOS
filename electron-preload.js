const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - exposes safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Window management
    openPsychologicalStudio: () => ipcRenderer.send('open-psychological-studio'),
    openArrangement: () => ipcRenderer.send('open-arrangement'),
    closePsychologicalStudio: () => ipcRenderer.send('close-psychological-studio'),
    closeArrangement: () => ipcRenderer.send('close-arrangement'),
    closeArrangementToPsychologicalStudio: () => ipcRenderer.send('close-arrangement-to-psychological-studio'),
    quitApp: () => ipcRenderer.send('quit-app'),
    
    // Authentication
    setAuthenticated: () => ipcRenderer.send('set-authenticated'),
    clearAuthenticated: () => ipcRenderer.send('clear-authenticated'),
    
    // File system
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    loadFolderAudioFiles: (folderPath) => ipcRenderer.invoke('load-folder-audio-files', folderPath),
    loadAudioFile: (filePath) => ipcRenderer.invoke('load-audio-file', filePath),
    readAudioFile: (filePath) => ipcRenderer.invoke('load-audio-file', filePath), // Alias for clarity
    loadAudioFilesBatch: (filePaths) => ipcRenderer.invoke('load-audio-files-batch', filePaths), // Batch loading
    saveAudioFile: (audioData, format) => ipcRenderer.invoke('save-audio-file', audioData, format),
    
    // Professional DAW project saving and loading
    saveProject: (projectData) => ipcRenderer.invoke('save-project', projectData),
    saveProjectWithAudio: (projectData, customSamples) => ipcRenderer.invoke('save-project-with-audio', projectData, customSamples),
    loadProjectFile: () => ipcRenderer.invoke('load-project-file'),
    
    // Path utilities (for loading)
    joinPath: (...parts) => ipcRenderer.invoke('join-path', parts),
    dirname: (filePath) => ipcRenderer.invoke('get-dirname', filePath),
    
    // App info
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    
    // Environment
    isElectron: true,
    isDev: process.env.NODE_ENV === 'development'
});

// Synchronously get app info and set up authentication BEFORE any other scripts load
try {
    // Use synchronous ipcRenderer.sendSync for critical startup tasks
    const info = ipcRenderer.sendSync('get-app-info-sync');
    
    window.APP_CONFIG = {
        backendUrl: info.backendUrl,
        isDev: info.environment === 'development',
        isElectron: true,
        isPreAuthenticated: info.isAuthenticated
    };
    
    console.log('[Preload] isAuthenticated from Electron:', info.isAuthenticated);
    
    // If pre-authenticated in Electron, set localStorage for security.js IMMEDIATELY
    if (info.isAuthenticated) {
        // Generate a proper token that lasts 24 hours from NOW
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 10);
        const token = btoa('PsychStudio_' + timestamp + '_' + randomStr).substring(0, 32);
        const expiry = timestamp + (24 * 60 * 60 * 1000); // 24 hours from NOW
        
        const authData = {
            token,
            expiry,
            createdAt: timestamp,
            expiresAt: new Date(expiry).toISOString()
        };
        
        localStorage.setItem('psychStudioAuth', JSON.stringify(authData));
        console.log('[Preload] ✓ Pre-authentication set from Electron');
        console.log('[Preload] Token expires at:', new Date(expiry).toISOString());
        console.log('[Preload] User will bypass login screen');
        
        // Set a flag so security.js knows it's already authenticated
        window.__ELECTRON_PRE_AUTHENTICATED__ = true;
    } else {
        console.log('[Preload] Not pre-authenticated - User needs to login');
    }
} catch (error) {
    console.error('[Preload] Error getting app info:', error);
}
