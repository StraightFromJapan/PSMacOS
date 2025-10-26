/**
 * Electron App Navigation Helper
 * This script provides functions for navigating between pages in the Electron app
 */

// Check if running in Electron
const isElectron = () => {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

// Navigation functions
const ElectronAppNav = {
    /**
     * Open Psychological Studio
     */
    openPsychologicalStudio: () => {
        if (isElectron()) {
            window.electronAPI.openPsychologicalStudio();
        } else {
            // Web fallback
            window.location.href = 'PsychologicalStudio.html';
        }
    },

    /**
     * Open Arrangement
     */
    openArrangement: () => {
        if (isElectron()) {
            window.electronAPI.openArrangement();
        } else {
            // Web fallback
            window.location.href = 'arrangement.html';
        }
    },

    /**
     * Close Arrangement and return to Psychological Studio
     */
    closeToPsychologicalStudio: () => {
        if (isElectron()) {
            window.electronAPI.closeArrangementToPsychologicalStudio();
        } else {
            // Web fallback
            window.location.href = 'PsychologicalStudio.html';
        }
    },

    /**
     * Close current window
     */
    closeWindow: () => {
        if (isElectron()) {
            // Get current filename
            const currentFile = window.location.pathname.split('/').pop();
            if (currentFile.includes('PsychologicalStudio')) {
                window.electronAPI.closePsychologicalStudio();
            } else if (currentFile.includes('arrangement')) {
                window.electronAPI.closeArrangement();
            }
        } else {
            window.close();
        }
    },

    /**
     * Get app configuration
     */
    getAppConfig: async () => {
        if (isElectron()) {
            return await window.electronAPI.getAppInfo();
        }
        return {
            backendUrl: window.APP_CONFIG?.backendUrl || 'http://localhost:3000',
            isDev: true,
            isElectron: false
        };
    },

    /**
     * Check if running in Electron
     */
    isRunningInElectron: () => isElectron(),

    /**
     * Get backend URL
     */
    getBackendUrl: () => {
        if (window.APP_CONFIG?.backendUrl) {
            return window.APP_CONFIG.backendUrl;
        }
        return 'http://localhost:3000';
    }
};

// Make globally available
window.ElectronAppNav = ElectronAppNav;
