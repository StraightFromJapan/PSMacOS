// ========================================
// ERROR HANDLING & RECOVERY

class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 50;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        // Catch unhandled errors
        window.addEventListener('error', (event) => {
            this.handleError(event.error || event.message, 'Unhandled Error', {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, 'Unhandled Promise Rejection');
        });

        // Catch audio context errors
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
            window.AudioContext = window.webkitAudioContext = function(...args) {
                const ctx = new OriginalAudioContext(...args);
                ctx.addEventListener('error', (e) => {
                    window.errorHandler.handleError(e, 'Audio Context Error');
                });
                return ctx;
            };
        }
    }

    handleError(error, context = 'Unknown Error', metadata = {}) {
        const errorInfo = {
            message: error?.message || error?.toString() || 'Unknown error',
            context,
            metadata,
            timestamp: new Date().toISOString(),
            stack: error?.stack
        };

        // Add to log
        this.errorLog.push(errorInfo);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // Always log to console
        console.error(`[${context}]`, error, metadata);

        // Show user-friendly notification
        this.showUserNotification(errorInfo);

        // Auto-save on critical errors
        this.attemptAutoSave();

        return errorInfo;
    }

    showUserNotification(errorInfo) {
        if (!window.notify) return;

        const isCritical = this.isCriticalError(errorInfo);

        if (isCritical) {
            window.notify.modal({
                title: '⚠️ Error Occurred',
                message: `
                    <strong>${errorInfo.context}</strong><br><br>
                    ${this.getUserFriendlyMessage(errorInfo.message)}<br><br>
                    <small style="color: #999;">Your work has been auto-saved. You can continue working or restart the application.</small>
                `,
                type: 'error',
                confirmText: 'Continue Working'
            });
        }
        // Non-critical errors are logged but not shown to user
        // } else {
        //     window.notify.error(
        //         this.getUserFriendlyMessage(errorInfo.message),
        //         5000
        //     );
        // }
    }

    getUserFriendlyMessage(technicalMessage) {
        const errorMap = {
            'QuotaExceededError': 'Storage quota exceeded. Please free up some space or export your projects.',
            'NotAllowedError': 'Permission denied. Please allow microphone/audio access in your browser settings.',
            'AbortError': 'Operation was cancelled.',
            'NetworkError': 'Network connection failed. Please check your internet connection.',
            'AudioContext': 'Audio system error. Try refreshing the page.',
            'out of memory': 'Not enough memory. Try closing other applications.',
            'Failed to fetch': 'Unable to load resource. Check your internet connection.',
            'undefined is not': 'Internal error. The application will try to recover.',
            'cannot read property': 'Internal error. The application will try to recover.',
            'is not a function': 'Internal error. The application will try to recover.'
        };

        for (const [key, friendlyMsg] of Object.entries(errorMap)) {
            if (technicalMessage.toLowerCase().includes(key.toLowerCase())) {
                return friendlyMsg;
            }
        }

        return 'An unexpected error occurred. Your work has been saved automatically.';
    }

    isCriticalError(errorInfo) {
        const criticalPatterns = [
            'out of memory',
            'quota exceeded',
            'audiocontext',
            'cannot read property',
            'is not a function',
            'undefined is not'
        ];

        const msg = errorInfo.message.toLowerCase();
        return criticalPatterns.some(pattern => msg.includes(pattern));
    }

    attemptAutoSave() {
        try {
            if (window.autoSave && window.autoSave.isDirty) {
                window.autoSave.saveNow();
            }
        } catch (err) {
            console.error('Auto-save during error recovery failed:', err);
        }
    }

    // Wrapper for async functions with error handling
    async wrapAsync(asyncFunc, context = 'Async Operation') {
        try {
            return await asyncFunc();
        } catch (error) {
            this.handleError(error, context);
            throw error; // Re-throw after handling
        }
    }

    // Wrapper for sync functions with error handling
    wrapSync(func, context = 'Sync Operation', fallbackValue = null) {
        try {
            return func();
        } catch (error) {
            this.handleError(error, context);
            return fallbackValue;
        }
    }

    getErrorLog() {
        return [...this.errorLog];
    }

    clearErrorLog() {
        this.errorLog = [];
    }

    exportErrorLog() {
        const log = this.getErrorLog();
        const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error-log-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Global instance
window.errorHandler = new ErrorHandler();

// Helper functions for common use cases
window.safeAsync = (asyncFunc, context) => {
    return window.errorHandler.wrapAsync(asyncFunc, context);
};

window.safeSync = (func, context, fallback) => {
    return window.errorHandler.wrapSync(func, context, fallback);
};
