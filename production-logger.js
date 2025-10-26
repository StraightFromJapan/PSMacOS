// ========================================
// PRODUCTION LOGGER
// Only logs in development mode
// ========================================

const isDevelopment = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' ||
     window.location.protocol === 'file:');

const logger = {
    log: (...args) => {
        if (isDevelopment) console.log(...args);
    },
    error: (...args) => {
        // Always log errors
        console.error(...args);
    },
    warn: (...args) => {
        if (isDevelopment) console.warn(...args);
    },
    info: (...args) => {
        if (isDevelopment) console.info(...args);
    },
    debug: (...args) => {
        if (isDevelopment) console.debug(...args);
    }
};

// Replace global console in production
if (!isDevelopment) {
    window.console = {
        ...window.console,
        log: logger.log,
        warn: logger.warn,
        info: logger.info,
        debug: logger.debug
    };
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = logger;
}
