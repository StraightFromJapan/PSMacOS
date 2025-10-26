// AUTO-SAVE


class AutoSaveManager {
    constructor() {
        this.interval = 5 * 60 * 1000; // 5 minutes
        this.timer = null;
        this.enabled = true;
        this.lastSaveTime = null;
        this.isDirty = false; // Track if changes have been made
        this.init();
    }

    init() {
        // Start auto-save timer
        this.start();

        // Track changes to set dirty flag
        this.trackChanges();

        // Save before unload
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                this.saveNow();
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    start() {
        if (this.timer) return;
        
        this.timer = setInterval(() => {
            if (this.enabled && this.isDirty) {
                this.saveNow();
            }
        }, this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    enable() {
        this.enabled = true;
        this.start();
    }

    disable() {
        this.enabled = false;
        this.stop();
    }

    markDirty() {
        this.isDirty = true;
    }

    markClean() {
        this.isDirty = false;
    }

    async saveNow() {
        if (!this.isDirty) return;

        try {
            // Get current project data
            let projectData = null;
            
            // For arrangement view
            if (typeof saveArrangementToObject === 'function') {
                projectData = saveArrangementToObject();
            }
            // For main studio view
            else if (typeof getAllProjectData === 'function') {
                projectData = getAllProjectData();
            }

            if (!projectData) return;

            // Save to localStorage as backup
            const autoSaveKey = 'psypower-autosave-backup';
            const autoSaveData = {
                timestamp: Date.now(),
                data: projectData
            };
            
            try {
                localStorage.setItem(autoSaveKey, JSON.stringify(autoSaveData));
                this.lastSaveTime = Date.now();
                this.isDirty = false;

                // Show subtle notification
                if (window.notify) {
                    window.notify.success('Auto-saved', 2000);
                }

                // Also save to Electron if available
                if (window.electronAPI && window.electronAPI.saveProjectWithAudio) {
                    const userDataPath = await window.electronAPI.getAppInfo();
                    const autoSavePath = userDataPath.userDataPath + '/autosave.psy';
                    
                    // Don't await this - let it save in background
                    window.electronAPI.saveProjectWithAudio(autoSavePath, projectData).catch(() => {
                        // Silent fail for auto-save
                    });
                }
            } catch (err) {
                // Storage quota exceeded - try to clear old data
                this.clearOldAutoSaves();
            }
        } catch (err) {
            console.error('Auto-save failed:', err);
        }
    }

    trackChanges() {
        // Track arrangement state changes
        if (typeof arrangementState !== 'undefined') {
            const originalPush = Array.prototype.push;
            const originalSplice = Array.prototype.splice;
            const self = this;

            // Monitor clips array
            if (arrangementState.clips) {
                const clipsProxy = new Proxy(arrangementState.clips, {
                    set(target, prop, value) {
                        self.markDirty();
                        return Reflect.set(target, prop, value);
                    }
                });
            }

            // Monitor tracks array
            if (arrangementState.tracks) {
                const tracksProxy = new Proxy(arrangementState.tracks, {
                    set(target, prop, value) {
                        self.markDirty();
                        return Reflect.set(target, prop, value);
                    }
                });
            }
        }

        // Also mark dirty on any undo/redo action
        if (window.undoManager) {
            const originalExecute = window.undoManager.execute.bind(window.undoManager);
            const autoSaveManager = this; // Store reference to AutoSaveManager
            window.undoManager.execute = function(command) {
                if (autoSaveManager && autoSaveManager.markDirty) {
                    autoSaveManager.markDirty();
                }
                return originalExecute(command);
            };
        }
    }

    clearOldAutoSaves() {
        try {
            // Remove auto-save if older than 24 hours
            const autoSaveKey = 'psypower-autosave-backup';
            const data = localStorage.getItem(autoSaveKey);
            if (data) {
                const parsed = JSON.parse(data);
                const age = Date.now() - parsed.timestamp;
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (age > maxAge) {
                    localStorage.removeItem(autoSaveKey);
                }
            }
        } catch (err) {
            // Ignore
        }
    }

    async checkForAutoSave() {
        try {
            const autoSaveKey = 'psypower-autosave-backup';
            const data = localStorage.getItem(autoSaveKey);
            
            if (data) {
                const parsed = JSON.parse(data);
                const age = Date.now() - parsed.timestamp;
                const ageMinutes = Math.floor(age / (1000 * 60));

                if (age < 24 * 60 * 60 * 1000) { // Less than 24 hours old
                    const restore = await window.notify.confirm(
                        `Auto-saved project found from ${ageMinutes} minutes ago. Would you like to restore it?`,
                        'Restore Auto-Save?'
                    );

                    if (restore) {
                        return parsed.data;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check auto-save:', err);
        }
        return null;
    }

    getStatus() {
        if (!this.lastSaveTime) return 'Not saved yet';
        
        const elapsed = Date.now() - this.lastSaveTime;
        const minutes = Math.floor(elapsed / (1000 * 60));
        
        if (minutes < 1) return 'Saved just now';
        if (minutes === 1) return 'Saved 1 minute ago';
        return `Saved ${minutes} minutes ago`;
    }
}

// Global instance
window.autoSave = new AutoSaveManager();

// Add status display to UI
function updateAutoSaveStatus() {
    const statusEl = document.getElementById('autosave-status');
    if (statusEl && window.autoSave) {
        statusEl.textContent = window.autoSave.getStatus();
        
        // Update color based on dirty state
        if (window.autoSave.isDirty) {
            statusEl.style.color = '#ff9800'; // Orange = unsaved changes
        } else {
            statusEl.style.color = '#4CAF50'; // Green = saved
        }
    }
}

// Update status every 10 seconds
setInterval(updateAutoSaveStatus, 10000);

// Check for auto-save on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.autoSave) {
                window.autoSave.checkForAutoSave();
            }
        }, 1000);
    });
} else {
    setTimeout(() => {
        if (window.autoSave) {
            window.autoSave.checkForAutoSave();
        }
    }, 1000);
}
