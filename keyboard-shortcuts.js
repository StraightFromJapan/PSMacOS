// KEYBOARD SHORTCUTS

class KeyboardShortcutManager {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.init();
    }

    init() {
        document.addEventListener('keydown', (e) => {
            if (!this.enabled) return;
            
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }

            const key = this.getKeyCombo(e);
            const action = this.shortcuts.get(key);
            
            if (action) {
                e.preventDefault();
                action.callback();
            }
        });
    }

    getKeyCombo(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        
        // Normalize key name
        let key = e.key;
        if (key === ' ') key = 'Space';
        else if (key === 'Enter') key = 'Enter';
        else key = key.toUpperCase();
        
        parts.push(key);
        return parts.join('+');
    }

    register(combo, description, callback) {
        this.shortcuts.set(combo, { description, callback });
    }

    unregister(combo) {
        this.shortcuts.delete(combo);
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    getAll() {
        return Array.from(this.shortcuts.entries()).map(([combo, data]) => ({
            combo,
            description: data.description
        }));
    }

    showHelp() {
        const shortcuts = this.getAll();
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? '⌘' : 'Ctrl';
        
        const html = `
            <div style="max-height: 500px; overflow-y: auto;">
                <p style="color: #aaa; margin-bottom: 15px; font-size: 13px;">
                    ${isMac ? 'macOS keyboard shortcuts (⌘ = Command key)' : 'Windows keyboard shortcuts'}
                </p>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #1a1a2e; position: sticky; top: 0;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #444;">Shortcut</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #444;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shortcuts.map(s => {
                            // Replace Ctrl with platform-specific key
                            const displayCombo = s.combo.replace(/Ctrl/g, modKey);
                            return `
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding: 10px;">
                                    <code style="
                                        background: #444;
                                        padding: 4px 8px;
                                        border-radius: 4px;
                                        font-family: monospace;
                                        font-size: 13px;
                                    ">${displayCombo.replace(/\+/g, ' + ')}</code>
                                </td>
                                <td style="padding: 10px; color: #e0e0e0;">${s.description}</td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;

        if (window.notify) {
            window.notify.modal({
                title: '⌨️ Keyboard Shortcuts',
                message: html,
                type: 'info',
                confirmText: 'Got it!'
            });
        }
    }
}

// Global instance
window.shortcuts = new KeyboardShortcutManager();

// Register default arrangement shortcuts (will be customized per view)
function registerArrangementShortcuts() {
    const s = window.shortcuts;
    
    // Playback controls
    s.register('SPACE', 'Play/Pause', () => {
        const playBtn = document.getElementById('arr-play-btn');
        if (playBtn) playBtn.click();
    });
    
    s.register('ENTER', 'Stop playback', () => {
        const stopBtn = document.getElementById('arr-stop-btn');
        if (stopBtn) stopBtn.click();
    });
    
    // File operations
    s.register('Ctrl+S', 'Save project', () => {
        const saveBtn = document.querySelector('[onclick*="saveArrangement"]');
        if (saveBtn) saveBtn.click();
    });
    
    s.register('Ctrl+O', 'Open project', () => {
        const loadBtn = document.querySelector('[onclick*="loadArrangement"]');
        if (loadBtn) loadBtn.click();
    });
    
    s.register('Ctrl+E', 'Export arrangement', () => {
        const exportBtn = document.querySelector('[onclick*="exportArrangement"]');
        if (exportBtn) exportBtn.click();
    });
    
    // Edit operations
    s.register('Ctrl+Z', 'Undo', () => {
        if (window.undoManager) window.undoManager.undo();
    });
    
    s.register('Ctrl+Y', 'Redo', () => {
        if (window.undoManager) window.undoManager.redo();
    });
    
    s.register('Ctrl+Shift+Z', 'Redo (alternative)', () => {
        if (window.undoManager) window.undoManager.redo();
    });
    
    // Clip operations
    s.register('DELETE', 'Delete selected clip', () => {
        if (window.deleteSelectedClip) window.deleteSelectedClip();
    });
    
    s.register('Ctrl+C', 'Copy selected clip', () => {
        if (window.copySelectedClip) window.copySelectedClip();
    });
    
    s.register('Ctrl+V', 'Paste clip', () => {
        if (window.pasteClip) window.pasteClip();
    });
    
    s.register('Ctrl+D', 'Duplicate selected clip', () => {
        if (window.duplicateSelectedClip) window.duplicateSelectedClip();
    });
    
    // View controls
    s.register('Ctrl++', 'Zoom in', () => {
        if (window.zoomIn) window.zoomIn();
    });
    
    s.register('Ctrl+-', 'Zoom out', () => {
        if (window.zoomOut) window.zoomOut();
    });
    
    s.register('Ctrl+0', 'Reset zoom', () => {
        if (window.resetZoom) window.resetZoom();
    });
    
    // Help
    s.register('F1', 'Show keyboard shortcuts', () => {
        s.showHelp();
    });
    
    s.register('Shift+/', 'Show keyboard shortcuts (alternative)', () => {
        s.showHelp();
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerArrangementShortcuts);
} else {
    registerArrangementShortcuts();
}
