// CRASH RECOVERY SYSTEM

class CrashRecoveryManager {
    constructor() {
        this.recoveryKey = 'psypower-crash-recovery';
        this.recoveryInterval = 30000; // Save every 30 seconds
        this.timer = null;
        this.lastSave = null;
        this.init();
    }

    init() {
        // Check for crash on startup
        this.checkForCrash();

        // Start recovery saves
        this.startRecoverySaves();

        // Mark as cleanly closed on exit
        window.addEventListener('beforeunload', () => {
            this.markCleanExit();
        });

        // Detect crashes via heartbeat
        this.startHeartbeat();
    }

    checkForCrash() {
        try {
            const sessionKey = 'psypower-session-active';
            const wasActive = sessionStorage.getItem(sessionKey);
            const recoveryData = localStorage.getItem(this.recoveryKey);

            // If session was active but we're starting fresh = crash
            if (wasActive === 'true' && recoveryData) {
                const data = JSON.parse(recoveryData);
                const age = Date.now() - data.timestamp;
                
                // Only show if recovery file is recent (< 1 hour)
                if (age < 60 * 60 * 1000) {
                    setTimeout(() => {
                        this.showRecoveryDialog(data);
                    }, 1000);
                }
            }

            // Mark session as active
            sessionStorage.setItem(sessionKey, 'true');
        } catch (err) {
            console.error('Crash check failed:', err);
        }
    }

    async showRecoveryDialog(recoveryData) {
        const ageMinutes = Math.floor((Date.now() - recoveryData.timestamp) / (1000 * 60));
        
        if (window.notify) {
            const recover = await window.notify.modal({
                title: '⚠️ Unexpected Shutdown Detected',
                message: `
                    It looks like the application didn't close properly last time.
                    <br><br>
                    <strong>Unsaved work found from ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago.</strong>
                    <br><br>
                    Would you like to recover your work?
                `,
                type: 'warning',
                confirmText: 'Recover',
                cancelText: 'Discard',
                showCancel: true
            });

            if (recover) {
                await this.recoverProject(recoveryData.data);
            } else {
                this.clearRecovery();
            }
        }
    }

    async recoverProject(projectData) {
        try {
            // For arrangement view
            if (typeof loadArrangementFromObject === 'function') {
                await loadArrangementFromObject(projectData);
            }
            // For main studio view
            else if (typeof loadProjectData === 'function') {
                await loadProjectData(projectData);
            }

            if (window.notify) {
                window.notify.success('Project recovered successfully!', 3000);
            }

            // Mark as dirty so user saves it
            if (window.autoSave) {
                window.autoSave.markDirty();
            }
        } catch (err) {
            if (window.notify) {
                window.notify.error('Failed to recover project: ' + err.message, 5000);
            }
        }
    }

    startRecoverySaves() {
        this.timer = setInterval(() => {
            this.saveRecovery();
        }, this.recoveryInterval);
    }

    saveRecovery() {
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

            const recoveryData = {
                timestamp: Date.now(),
                data: projectData
            };

            localStorage.setItem(this.recoveryKey, JSON.stringify(recoveryData));
            this.lastSave = Date.now();

        } catch (err) {
            // Silent fail - don't disrupt user
            console.error('Recovery save failed:', err);
        }
    }

    markCleanExit() {
        try {
            sessionStorage.setItem('psypower-session-active', 'false');
            // Don't clear recovery data - keep it for next session check
        } catch (err) {
            // Ignore
        }
    }

    clearRecovery() {
        try {
            localStorage.removeItem(this.recoveryKey);
        } catch (err) {
            // Ignore
        }
    }

    startHeartbeat() {
        // Update heartbeat every 5 seconds
        setInterval(() => {
            try {
                sessionStorage.setItem('psypower-heartbeat', Date.now().toString());
            } catch (err) {
                // Ignore
            }
        }, 5000);
    }

    getStatus() {
        if (!this.lastSave) return 'No recovery save yet';
        
        const elapsed = Date.now() - this.lastSave;
        const seconds = Math.floor(elapsed / 1000);
        
        if (seconds < 30) return 'Recovery saved just now';
        return `Last recovery save: ${seconds}s ago`;
    }
}

// Global instance
window.crashRecovery = new CrashRecoveryManager();

// Also add to Electron main process
if (window.electronAPI) {
    // IPC handler will be added in electron-main.js to save recovery files
    // to userData directory for extra safety
}
