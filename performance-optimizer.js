// PERFORMANCE OPTIMIZER

class PerformanceOptimizer {
    constructor() {
        this.rafId = null;
        this.rafQueue = [];
        this.lazyLoadQueue = [];
        this.virtualScrollEnabled = true;
        this.init();
    }

    init() {
        this.setupRAFScheduler();
        this.setupIntersectionObserver();
    }

    // ========== REQUEST ANIMATION FRAME SCHEDULER ==========
    setupRAFScheduler() {
        const processRAFQueue = () => {
            if (this.rafQueue.length > 0) {
                const tasks = [...this.rafQueue];
                this.rafQueue = [];
                
                tasks.forEach(task => {
                    try {
                        task();
                    } catch (err) {
                        console.error('RAF task error:', err);
                    }
                });
            }
            
            this.rafId = requestAnimationFrame(processRAFQueue);
        };
        
        this.rafId = requestAnimationFrame(processRAFQueue);
    }

    scheduleRAF(callback) {
        this.rafQueue.push(callback);
    }

    // ========== LAZY LOADING WITH INTERSECTION OBSERVER ==========
    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;
                        const callback = element.__lazyLoadCallback;
                        
                        if (callback) {
                            callback(element);
                            this.observer.unobserve(element);
                            delete element.__lazyLoadCallback;
                        }
                    }
                });
            },
            {
                root: null,
                rootMargin: '50px', // Load 50px before visible
                threshold: 0.01
            }
        );
    }

    observeLazyLoad(element, callback) {
        element.__lazyLoadCallback = callback;
        this.observer.observe(element);
    }

    // ========== VIRTUAL SCROLLING FOR TRACKS ==========
    createVirtualScroller(container, items, renderItem, itemHeight = 50) {
        const viewport = {
            height: container.clientHeight,
            scrollTop: 0
        };

        const totalHeight = items.length * itemHeight;
        const visibleCount = Math.ceil(viewport.height / itemHeight) + 2; // +2 for buffer

        // Create scroll container
        const scrollContainer = document.createElement('div');
        scrollContainer.style.height = `${totalHeight}px`;
        scrollContainer.style.position = 'relative';

        // Create visible items container
        const itemsContainer = document.createElement('div');
        itemsContainer.style.position = 'absolute';
        itemsContainer.style.top = '0';
        itemsContainer.style.left = '0';
        itemsContainer.style.right = '0';

        scrollContainer.appendChild(itemsContainer);
        container.appendChild(scrollContainer);

        const updateVisibleItems = () => {
            viewport.scrollTop = container.scrollTop;
            const startIndex = Math.floor(viewport.scrollTop / itemHeight);
            const endIndex = Math.min(startIndex + visibleCount, items.length);

            // Clear and render only visible items
            itemsContainer.innerHTML = '';
            itemsContainer.style.transform = `translateY(${startIndex * itemHeight}px)`;

            for (let i = startIndex; i < endIndex; i++) {
                const itemEl = renderItem(items[i], i);
                itemEl.style.height = `${itemHeight}px`;
                itemsContainer.appendChild(itemEl);
            }
        };

        // Throttled scroll handler
        let scrollTimeout;
        container.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            
            scrollTimeout = setTimeout(() => {
                this.scheduleRAF(updateVisibleItems);
                scrollTimeout = null;
            }, 16); // ~60fps
        });

        // Initial render
        updateVisibleItems();

        return {
            update: (newItems) => {
                items = newItems;
                scrollContainer.style.height = `${newItems.length * itemHeight}px`;
                updateVisibleItems();
            },
            destroy: () => {
                container.removeChild(scrollContainer);
            }
        };
    }

    // ========== DEBOUNCE & THROTTLE ==========
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit = 100) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ========== BATCH DOM UPDATES ==========
    batchDOMUpdates(updates) {
        this.scheduleRAF(() => {
            // Use DocumentFragment for efficiency
            const fragment = document.createDocumentFragment();
            
            updates.forEach(update => {
                try {
                    if (typeof update === 'function') {
                        update();
                    }
                } catch (err) {
                    console.error('Batch update error:', err);
                }
            });
        });
    }

    // ========== LAZY LOAD WAVEFORMS ==========
    lazyLoadWaveform(canvas, audioBuffer) {
        this.observeLazyLoad(canvas, () => {
            this.scheduleRAF(() => {
                this.drawWaveform(canvas, audioBuffer);
            });
        });
    }

    drawWaveform(canvas, audioBuffer) {
        if (!canvas || !audioBuffer) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(100, 100, 255, 0.5)';
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.8)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const min = Math.min(...data.slice(i * step, (i + 1) * step));
            const max = Math.max(...data.slice(i * step, (i + 1) * step));
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
    }

    // ========== MEMORY CLEANUP ==========
    cleanupUnusedResources() {
        // Clean up old audio buffers not used in last 5 minutes
        if (typeof sampleBuffers !== 'undefined') {
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5 minutes

            Object.keys(sampleBuffers).forEach(key => {
                const buffer = sampleBuffers[key];
                if (buffer._lastUsed && (now - buffer._lastUsed) > maxAge) {
                    delete sampleBuffers[key];
                }
            });
        }
    }

    // ========== OPTIMIZE CLIP RENDERING ==========
    optimizeClipRendering(clips, visibleRange) {
        // Only render clips in visible range
        return clips.filter(clip => {
            const clipEnd = clip.startBar + clip.length;
            return clipEnd >= visibleRange.start && clip.startBar <= visibleRange.end;
        });
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}

// Global instance
window.perfOptimizer = new PerformanceOptimizer();

// Cleanup every 5 minutes
setInterval(() => {
    if (window.perfOptimizer) {
        window.perfOptimizer.cleanupUnusedResources();
    }
}, 5 * 60 * 1000);
