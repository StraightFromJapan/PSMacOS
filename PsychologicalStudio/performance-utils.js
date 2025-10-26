/**
 * Performance Utilities for Psychological Studio
 * Optimized for mobile and laptop performance
 */

// Debounce function - prevents excessive function calls
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Throttle function - limits function execution rate
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// RequestAnimationFrame-based throttle for smooth animations
export function rafThrottle(func) {
    let rafId = null;
    return function(...args) {
        const context = this;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            func.apply(context, args);
            rafId = null;
        });
    };
}

// Batch DOM updates to minimize reflows
export class DOMBatcher {
    constructor() {
        this.updates = [];
        this.rafId = null;
    }

    schedule(updateFunc) {
        this.updates.push(updateFunc);
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(() => this.flush());
        }
    }

    flush() {
        const updates = this.updates;
        this.updates = [];
        this.rafId = null;
        
        // Execute all updates in a single animation frame
        for (const update of updates) {
            try {
                update();
            } catch (error) {
                console.error('DOM batch update error:', error);
            }
        }
    }
}

// Object pool for reusing objects (reduces garbage collection)
export class ObjectPool {
    constructor(createFunc, resetFunc, initialSize = 10) {
        this.createFunc = createFunc;
        this.resetFunc = resetFunc;
        this.pool = [];
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFunc());
        }
    }

    acquire() {
        return this.pool.length > 0 ? this.pool.pop() : this.createFunc();
    }

    release(obj) {
        if (this.resetFunc) {
            this.resetFunc(obj);
        }
        this.pool.push(obj);
    }

    clear() {
        this.pool = [];
    }
}

// Memory-efficient event delegation
export class EventDelegator {
    constructor(rootElement) {
        this.root = rootElement;
        this.handlers = new Map();
    }

    on(selector, eventType, handler) {
        const key = `${selector}:${eventType}`;
        
        if (!this.handlers.has(key)) {
            const delegatedHandler = (event) => {
                const target = event.target.closest(selector);
                if (target && this.root.contains(target)) {
                    handler.call(target, event);
                }
            };
            
            this.root.addEventListener(eventType, delegatedHandler);
            this.handlers.set(key, delegatedHandler);
        }
    }

    off(selector, eventType) {
        const key = `${selector}:${eventType}`;
        const handler = this.handlers.get(key);
        
        if (handler) {
            this.root.removeEventListener(eventType, handler);
            this.handlers.delete(key);
        }
    }

    destroy() {
        this.handlers.forEach((handler, key) => {
            const [, eventType] = key.split(':');
            this.root.removeEventListener(eventType, handler);
        });
        this.handlers.clear();
    }
}

// Lazy loading for heavy components
export class LazyLoader {
    constructor() {
        this.loaded = new Set();
        this.loading = new Map();
    }

    async load(componentId, loaderFunc) {
        if (this.loaded.has(componentId)) {
            return true;
        }

        if (this.loading.has(componentId)) {
            return this.loading.get(componentId);
        }

        const promise = (async () => {
            try {
                await loaderFunc();
                this.loaded.add(componentId);
                this.loading.delete(componentId);
                return true;
            } catch (error) {
                console.error(`Failed to load component ${componentId}:`, error);
                this.loading.delete(componentId);
                return false;
            }
        })();

        this.loading.set(componentId, promise);
        return promise;
    }

    isLoaded(componentId) {
        return this.loaded.has(componentId);
    }
}

// Virtual scrolling for large lists (piano roll optimization)
export class VirtualScroller {
    constructor(container, itemHeight, totalItems, renderFunc) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.totalItems = totalItems;
        this.renderFunc = renderFunc;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;
        
        this.setupScrolling();
    }

    setupScrolling() {
        const throttledScroll = throttle(() => this.onScroll(), 16); // ~60fps
        this.container.addEventListener('scroll', throttledScroll);
    }

    onScroll() {
        this.scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        
        // Calculate visible range with buffer
        const buffer = 5;
        this.visibleStart = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - buffer);
        this.visibleEnd = Math.min(
            this.totalItems,
            Math.ceil((this.scrollTop + containerHeight) / this.itemHeight) + buffer
        );
        
        this.render();
    }

    render() {
        this.renderFunc(this.visibleStart, this.visibleEnd);
    }

    update(totalItems) {
        this.totalItems = totalItems;
        this.onScroll();
    }
}

// Performance monitor
export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            domNodes: 0
        };
        this.frameTimes = [];
        this.maxFrames = 60;
        this.lastTime = performance.now();
        this.rafId = null;
    }

    start() {
        this.measure();
    }

    measure() {
        const now = performance.now();
        const frameTime = now - this.lastTime;
        this.lastTime = now;

        this.frameTimes.push(frameTime);
        if (this.frameTimes.length > this.maxFrames) {
            this.frameTimes.shift();
        }

        // Calculate average FPS
        const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.metrics.fps = Math.round(1000 / avgFrameTime);
        this.metrics.frameTime = avgFrameTime.toFixed(2);

        // Memory usage (if available)
        if (performance.memory) {
            this.metrics.memoryUsage = Math.round(
                performance.memory.usedJSHeapSize / 1048576
            );
        }

        // DOM nodes count
        this.metrics.domNodes = document.getElementsByTagName('*').length;

        this.rafId = requestAnimationFrame(() => this.measure());
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    getMetrics() {
        return { ...this.metrics };
    }

    log() {
        console.log('Performance Metrics:', this.metrics);
    }
}

// Audio buffer pool for efficient reuse
export class AudioBufferPool {
    constructor(audioContext, maxSize = 50) {
        this.audioContext = audioContext;
        this.pool = new Map();
        this.maxSize = maxSize;
        this.usage = new Map();
    }

    async getBuffer(url) {
        // Check if already in pool
        if (this.pool.has(url)) {
            this.usage.set(url, Date.now());
            return this.pool.get(url);
        }

        // Load and cache
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Manage pool size
            if (this.pool.size >= this.maxSize) {
                this.evictOldest();
            }
            
            this.pool.set(url, audioBuffer);
            this.usage.set(url, Date.now());
            return audioBuffer;
        } catch (error) {
            console.error(`Failed to load audio buffer: ${url}`, error);
            throw error;
        }
    }

    evictOldest() {
        let oldestUrl = null;
        let oldestTime = Infinity;
        
        for (const [url, time] of this.usage) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestUrl = url;
            }
        }
        
        if (oldestUrl) {
            this.pool.delete(oldestUrl);
            this.usage.delete(oldestUrl);
        }
    }

    clear() {
        this.pool.clear();
        this.usage.clear();
    }

    getSize() {
        return this.pool.size;
    }
}

// Mobile-specific optimizations
export const MobileOptimizations = {
    // Disable hover effects on mobile
    disableHoverEffects() {
        if ('ontouchstart' in window) {
            document.body.classList.add('touch-device');
            const style = document.createElement('style');
            style.textContent = `
                .touch-device *:hover {
                    /* Disable hover effects on touch devices */
                }
            `;
            document.head.appendChild(style);
        }
    },

    // Optimize touch scrolling
    enableSmoothScrolling() {
        document.body.style.webkitOverflowScrolling = 'touch';
        document.body.style.overflowScrolling = 'touch';
    },

    // Prevent zoom on double tap
    preventDoubleTabZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    },

    // Optimize for low-power mode
    detectLowPowerMode() {
        // Check battery API
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                if (battery.level < 0.2 || battery.charging === false) {
                    return true;
                }
                return false;
            });
        }
        return false;
    }
};

// Export all utilities
export default {
    debounce,
    throttle,
    rafThrottle,
    DOMBatcher,
    ObjectPool,
    EventDelegator,
    LazyLoader,
    VirtualScroller,
    PerformanceMonitor,
    AudioBufferPool,
    MobileOptimizations
};
