
// CPU/MEMORY MONITORING

class PerformanceMonitor {
    constructor() {
        this.cpuUsage = 0;
        this.memoryUsage = 0;
        this.activeVoices = 0;
        this.updateInterval = 1000; // Update every second
        this.measurements = [];
        this.maxMeasurements = 60; // Keep last 60 measurements
        this.init();
    }

    init() {
        this.createUI();
        this.startMonitoring();
    }

    createUI() {
        // Performance monitor disabled by user preference
        return;
        
        // Check if already exists
        if (document.getElementById('performance-monitor')) return;

        const monitor = document.createElement('div');
        monitor.id = 'performance-monitor';
        monitor.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(26, 26, 46, 0.95);
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px 15px;
            z-index: 9999;
            font-family: 'Segoe UI', monospace;
            font-size: 12px;
            color: #e0e0e0;
            min-width: 200px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;

        monitor.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: bold; color: #fff;">Performance</span>
                <button id="perf-toggle" style="
                    background: none;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                " title="Minimize">−</button>
            </div>
            <div id="perf-details">
                <div style="margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span>CPU:</span>
                        <span id="cpu-percent" style="font-weight: bold;">0%</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 4px;
                        background: #333;
                        border-radius: 2px;
                        overflow: hidden;
                    ">
                        <div id="cpu-bar" style="
                            height: 100%;
                            width: 0%;
                            background: linear-gradient(90deg, #4CAF50, #ff9800, #f44336);
                            transition: width 0.3s;
                        "></div>
                    </div>
                </div>
                <div style="margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span>Memory:</span>
                        <span id="memory-mb" style="font-weight: bold;">0 MB</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 4px;
                        background: #333;
                        border-radius: 2px;
                        overflow: hidden;
                    ">
                        <div id="memory-bar" style="
                            height: 100%;
                            width: 0%;
                            background: #2196F3;
                            transition: width 0.3s;
                        "></div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Voices:</span>
                    <span id="voices-count" style="font-weight: bold; color: #4CAF50;">0</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px; padding-top: 5px; border-top: 1px solid #333;">
                    <span style="font-size: 10px; color: #888;" id="autosave-status">Not saved yet</span>
                </div>
            </div>
        `;

        document.body.appendChild(monitor);

        // Toggle minimize/maximize
        const toggleBtn = document.getElementById('perf-toggle');
        const details = document.getElementById('perf-details');
        let minimized = false;

        toggleBtn.addEventListener('click', () => {
            minimized = !minimized;
            details.style.display = minimized ? 'none' : 'block';
            toggleBtn.textContent = minimized ? '+' : '−';
            toggleBtn.title = minimized ? 'Expand' : 'Minimize';
        });
    }

    startMonitoring() {
        setInterval(() => {
            this.updateMetrics();
        }, this.updateInterval);
    }

    updateMetrics() {
        // Measure CPU usage (approximate using animation frame timing)
        this.measureCPU();

        // Measure memory usage
        this.measureMemory();

        // Count active voices
        this.countActiveVoices();

        // Update UI
        this.updateUI();
    }

    measureCPU() {
        // Approximate CPU usage based on frame timing
        const start = performance.now();
        
        // Simulate some work
        let count = 0;
        for (let i = 0; i < 1000; i++) {
            count += Math.random();
        }
        
        const elapsed = performance.now() - start;
        
        // Normalize to percentage (higher elapsed = higher CPU usage)
        // This is a rough approximation
        this.cpuUsage = Math.min(100, Math.max(0, (elapsed / 10) * 100));
        
        // If we have access to performance API
        if (performance.memory) {
            // Use JS heap as proxy for CPU activity
            const heapPercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
            this.cpuUsage = Math.min(100, heapPercent);
        }
    }

    measureMemory() {
        if (performance.memory) {
            const usedMB = performance.memory.usedJSHeapSize / (1024 * 1024);
            const totalMB = performance.memory.jsHeapSizeLimit / (1024 * 1024);
            this.memoryUsage = (usedMB / totalMB) * 100;
            this.memoryMB = usedMB;
        } else {
            // Fallback: estimate based on loaded data
            let estimatedMB = 0;
            
            // Count audio buffers
            if (typeof sampleBuffers !== 'undefined') {
                estimatedMB += Object.keys(sampleBuffers).length * 2; // ~2MB per sample
            }
            if (typeof folderAudioBuffers !== 'undefined') {
                estimatedMB += Object.keys(folderAudioBuffers).length * 2;
            }
            
            this.memoryMB = estimatedMB;
            this.memoryUsage = Math.min(100, (estimatedMB / 500) * 100); // Assume 500MB limit
        }
    }

    countActiveVoices() {
        let count = 0;
        
        // Count playing clips in arrangement
        if (typeof arrangementState !== 'undefined' && arrangementState.isPlaying) {
            count += arrangementState.scheduledSources?.length || 0;
        }
        
        // Count piano roll preview voices
        if (typeof pianoRollPreviewActiveVoices !== 'undefined') {
            count += Object.keys(pianoRollPreviewActiveVoices).length;
        }
        
        // Count sample preview
        if (typeof previewSource !== 'undefined' && previewSource) {
            count += 1;
        }
        
        this.activeVoices = count;
    }

    updateUI() {
        const cpuPercent = document.getElementById('cpu-percent');
        const cpuBar = document.getElementById('cpu-bar');
        const memoryMb = document.getElementById('memory-mb');
        const memoryBar = document.getElementById('memory-bar');
        const voicesCount = document.getElementById('voices-count');

        if (cpuPercent) {
            cpuPercent.textContent = `${Math.round(this.cpuUsage)}%`;
            cpuPercent.style.color = this.cpuUsage > 80 ? '#f44336' : this.cpuUsage > 50 ? '#ff9800' : '#4CAF50';
        }
        
        if (cpuBar) {
            cpuBar.style.width = `${this.cpuUsage}%`;
        }

        if (memoryMb) {
            memoryMb.textContent = `${Math.round(this.memoryMB)} MB`;
        }
        
        if (memoryBar) {
            memoryBar.style.width = `${this.memoryUsage}%`;
        }

        if (voicesCount) {
            voicesCount.textContent = this.activeVoices;
            voicesCount.style.color = this.activeVoices > 50 ? '#f44336' : this.activeVoices > 20 ? '#ff9800' : '#4CAF50';
        }
    }

    getMetrics() {
        return {
            cpu: this.cpuUsage,
            memory: this.memoryMB,
            voices: this.activeVoices
        };
    }
}

// Global instance
window.perfMonitor = new PerformanceMonitor();
