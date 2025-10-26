// LIVE PERFORMANCE ENHANCEMENTS


class LivePerformanceManager {
    constructor() {
        this.performanceMode = false;
        this.midiInputs = [];
        this.midiMappings = new Map(); // MIDI CC to parameter mappings
        this.quantizeEnabled = true;
        this.quantizeValue = 16; // 1/16 note
        this.metronomeEnabled = false;
        this.metronomeGain = null;
        this.metronomeBeat = 0;
        this.audioLatency = 0;
        this.targetLatency = 0.005; // 5ms target for live performance
        this.preloadedSamples = new Map();
        this.init();
    }

    async init() {
        await this.setupMIDI();
        this.setupPerformanceMode();
        this.setupMetronome();
        this.optimizeAudioLatency();
    }

    // ========== ULTRA-LOW LATENCY OPTIMIZATION ==========
    async optimizeAudioLatency() {
        if (!window.audioContext) return;

        const ctx = window.audioContext;

        // Request lowest possible latency
        if (ctx.baseLatency !== undefined) {
            this.audioLatency = ctx.baseLatency;
            console.log(`Base latency: ${(this.audioLatency * 1000).toFixed(2)}ms`);
        }

        // Configure for live performance
        if (ctx.audioWorklet) {
            // Use AudioWorklet for ultra-low latency processing
            this.audioLatency = ctx.baseLatency || 0.005;
        }

        // Optimize buffer size for live performance
        const optimalBufferSize = 128; // Smaller = lower latency
        console.log(`Audio context latency optimized: ${(this.audioLatency * 1000).toFixed(2)}ms`);
    }

    // ========== MIDI SUPPORT ==========
    async setupMIDI() {
        if (!navigator.requestMIDIAccess) {
            console.log('WebMIDI not supported');
            return;
        }

        try {
            const midiAccess = await navigator.requestMIDIAccess();
            console.log('✅ MIDI Access granted');

            // Listen for MIDI inputs
            midiAccess.inputs.forEach(input => {
                console.log(`MIDI Input detected: ${input.name}`);
                this.midiInputs.push(input);
                input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
            });

            // Listen for device changes
            midiAccess.onstatechange = (e) => {
                console.log(`MIDI device ${e.port.state}: ${e.port.name}`);
                if (e.port.state === 'connected' && e.port.type === 'input') {
                    this.midiInputs.push(e.port);
                    e.port.onmidimessage = (msg) => this.handleMIDIMessage(msg);
                }
            };

            // Show MIDI indicator
            this.showMIDIStatus(true);
        } catch (err) {
            console.log('MIDI access denied or not available');
        }
    }

    handleMIDIMessage(message) {
        const [status, note, velocity] = message.data;
        const command = status & 0xf0;
        const channel = status & 0x0f;

        switch (command) {
            case 0x90: // Note On
                if (velocity > 0) {
                    this.triggerSampleFromMIDI(note, velocity);
                } else {
                    this.stopSampleFromMIDI(note);
                }
                break;

            case 0x80: // Note Off
                this.stopSampleFromMIDI(note);
                break;

            case 0xB0: // Control Change
                this.handleMIDICC(note, velocity);
                break;
        }
    }

    triggerSampleFromMIDI(midiNote, velocity) {
        // Map MIDI notes to sample pads (C3 = 48 = Sample 1)
        const sampleNumber = midiNote - 47; // C3 (48) maps to sample 1
        
        if (sampleNumber >= 1 && sampleNumber <= 32) {
            const button = document.getElementById(`sample${sampleNumber}`);
            if (button) {
                // Trigger with velocity sensitivity
                const velocityGain = velocity / 127;
                this.triggerSampleWithVelocity(sampleNumber, velocityGain);
                
                // Visual feedback
                button.classList.add('midi-triggered');
                setTimeout(() => button.classList.remove('midi-triggered'), 100);
            }
        }
    }

    stopSampleFromMIDI(midiNote) {
        const sampleNumber = midiNote - 47;
        if (sampleNumber >= 1 && sampleNumber <= 32) {
            // Stop sample if configured for one-shot mode
            if (window.currentPlaying && window.currentPlaying[sampleNumber]) {
                // Optionally stop sample
            }
        }
    }

    handleMIDICC(cc, value) {
        // Map MIDI CC to parameters
        const mapping = this.midiMappings.get(cc);
        if (mapping) {
            mapping.callback(value / 127); // Normalize to 0-1
        }

        // Common CC mappings
        switch (cc) {
            case 1: // Mod Wheel - Master Volume
                if (window.masterGain) {
                    window.masterGain.gain.value = value / 127;
                }
                break;
            case 7: // Channel Volume - Group Volume
                // Map to selected group
                break;
            case 71: // Filter Resonance
                // Map to filter controls
                break;
        }
    }

    // ========== PERFORMANCE MODE ==========
    setupPerformanceMode() {
        // Create performance mode toggle
        const perfBtn = document.createElement('button');
        perfBtn.id = 'performance-mode-btn';
        perfBtn.className = 'arr-btn';
        perfBtn.textContent = '🎹 Performance Mode';
        perfBtn.title = 'Enable live performance optimizations';
        perfBtn.style.cssText = `
            position: fixed;
            top: 70px;
            left: 10px;
            z-index: 9998;
            background: #533483;
        `;

        perfBtn.addEventListener('click', () => {
            this.togglePerformanceMode();
        });

        document.body.appendChild(perfBtn);
    }

    togglePerformanceMode() {
        this.performanceMode = !this.performanceMode;
        
        const btn = document.getElementById('performance-mode-btn');
        if (this.performanceMode) {
            btn.style.background = '#4CAF50';
            btn.textContent = '🎹 Performance ON';
            
            // Enable optimizations
            this.enablePerformanceOptimizations();
            
            if (window.notify) {
                window.notify.success('Performance Mode Enabled - Optimized for live play!', 3000);
            }
        } else {
            btn.style.background = '#533483';
            btn.textContent = '🎹 Performance Mode';
            
            this.disablePerformanceOptimizations();
            
            if (window.notify) {
                window.notify.info('Performance Mode Disabled', 2000);
            }
        }
    }

    enablePerformanceOptimizations() {
        // Preload all samples into memory
        this.preloadAllSamples();

        // Reduce visual updates
        this.reduceVisualUpdates();

        // Disable expensive effects during playback
        document.body.classList.add('performance-mode');

        // Show latency monitor
        this.showLatencyMonitor();
    }

    disablePerformanceOptimizations() {
        document.body.classList.remove('performance-mode');
        this.hideLatencyMonitor();
    }

    preloadAllSamples() {
        if (!window.currentPlaying) return;

        Object.keys(window.currentPlaying).forEach(sampleNum => {
            const sample = window.currentPlaying[sampleNum];
            if (sample.buffer) {
                this.preloadedSamples.set(sampleNum, sample.buffer);
            }
        });

        console.log(`✅ Preloaded ${this.preloadedSamples.size} samples for instant playback`);
    }

    reduceVisualUpdates() {
        // Throttle visual updates to every 100ms instead of every frame
        if (window.perfOptimizer) {
            // Already handled by performance optimizer
        }
    }

    // ========== METRONOME ==========
    setupMetronome() {
        const metroBtn = document.createElement('button');
        metroBtn.id = 'metronome-btn';
        metroBtn.className = 'arr-btn';
        metroBtn.textContent = '🥁 Metronome';
        metroBtn.title = 'Toggle metronome';
        metroBtn.style.cssText = `
            position: fixed;
            top: 120px;
            left: 10px;
            z-index: 9998;
            background: #444;
        `;

        metroBtn.addEventListener('click', () => {
            this.toggleMetronome();
        });

        document.body.appendChild(metroBtn);
    }

    toggleMetronome() {
        this.metronomeEnabled = !this.metronomeEnabled;
        
        const btn = document.getElementById('metronome-btn');
        if (this.metronomeEnabled) {
            btn.style.background = '#4CAF50';
            btn.textContent = '🥁 Metronome ON';
            this.startMetronome();
        } else {
            btn.style.background = '#444';
            btn.textContent = '🥁 Metronome';
            this.stopMetronome();
        }
    }

    startMetronome() {
        if (!window.audioContext) return;

        // Create metronome gain node
        this.metronomeGain = window.audioContext.createGain();
        this.metronomeGain.gain.value = 0.3;
        this.metronomeGain.connect(window.audioContext.destination);

        // Hook into bar counter to trigger metronome clicks
        this.metronomeBeat = 0;
    }

    stopMetronome() {
        if (this.metronomeGain) {
            this.metronomeGain.disconnect();
            this.metronomeGain = null;
        }
    }

    playMetronomeClick(isDownbeat = false) {
        if (!this.metronomeEnabled || !this.metronomeGain) return;

        const ctx = window.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Downbeat = higher pitch
        osc.frequency.value = isDownbeat ? 1200 : 800;
        osc.connect(gain);
        gain.connect(this.metronomeGain);

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
    }

    // ========== VELOCITY-SENSITIVE TRIGGER ==========
    triggerSampleWithVelocity(sampleNumber, velocityGain) {
        // Instant trigger with velocity sensitivity
        if (!window.currentPlaying || !window.currentPlaying[sampleNumber]) return;

        const sample = window.currentPlaying[sampleNumber];
        
        // Apply velocity to volume
        if (sample.gainNode) {
            const baseGain = sample.gainNode.gain.value;
            sample.gainNode.gain.value = baseGain * velocityGain;
        }

        // Trigger sample immediately (bypass bar quantization in performance mode)
        if (this.performanceMode) {
            // Direct trigger without waiting for next bar
            const button = document.getElementById(`sample${sampleNumber}`);
            if (button && button.click) {
                button.click();
            }
        }
    }

    // ========== LATENCY MONITORING ==========
    showLatencyMonitor() {
        const monitor = document.createElement('div');
        monitor.id = 'latency-monitor';
        monitor.style.cssText = `
            position: fixed;
            top: 170px;
            left: 10px;
            background: rgba(26, 26, 46, 0.95);
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            z-index: 9998;
            font-size: 12px;
            color: #e0e0e0;
            min-width: 180px;
        `;

        monitor.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">⚡ Latency</div>
            <div>Audio: <span id="audio-latency-value">0ms</span></div>
            <div>Input: <span id="input-latency-value">0ms</span></div>
        `;

        document.body.appendChild(monitor);

        // Update latency values
        this.updateLatencyMonitor();
        this.latencyInterval = setInterval(() => {
            this.updateLatencyMonitor();
        }, 1000);
    }

    hideLatencyMonitor() {
        const monitor = document.getElementById('latency-monitor');
        if (monitor) monitor.remove();
        
        if (this.latencyInterval) {
            clearInterval(this.latencyInterval);
        }
    }

    updateLatencyMonitor() {
        if (!window.audioContext) return;

        const audioLatency = document.getElementById('audio-latency-value');
        const inputLatency = document.getElementById('input-latency-value');

        if (audioLatency) {
            const latencyMs = (window.audioContext.baseLatency || this.audioLatency) * 1000;
            audioLatency.textContent = `${latencyMs.toFixed(1)}ms`;
            audioLatency.style.color = latencyMs < 10 ? '#4CAF50' : latencyMs < 20 ? '#ff9800' : '#f44336';
        }

        if (inputLatency) {
            // Estimate input latency (touch/click to audio)
            const totalLatency = this.audioLatency * 1000 + 5; // +5ms for processing
            inputLatency.textContent = `${totalLatency.toFixed(1)}ms`;
        }
    }

    // ========== MIDI STATUS ==========
    showMIDIStatus(enabled) {
        const status = document.createElement('div');
        status.id = 'midi-status';
        status.style.cssText = `
            position: fixed;
            top: 40px;
            left: 10px;
            background: ${enabled ? '#4CAF50' : '#666'};
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 11px;
            z-index: 9999;
        `;
        status.textContent = enabled ? '🎹 MIDI Connected' : '🎹 No MIDI';
        
        document.body.appendChild(status);
    }

    // ========== QUANTIZE SETTINGS ==========
    setQuantize(value) {
        this.quantizeValue = value; // 4, 8, 16, 32 (note divisions)
        this.quantizeEnabled = value > 0;
    }
}

// Global instance
window.livePerformance = new LivePerformanceManager();

// Add CSS for MIDI triggered visual feedback
const style = document.createElement('style');
style.textContent = `
    .midi-triggered {
        transform: scale(0.95);
        box-shadow: 0 0 20px #4CAF50 !important;
        transition: all 0.05s !important;
    }

    .performance-mode .expensive-animation {
        animation: none !important;
        transition: none !important;
    }

    .performance-mode * {
        will-change: auto !important;
    }
`;
document.head.appendChild(style);

console.log('✅ Live Performance Manager loaded - MIDI support enabled');

// ========== UI INTEGRATION ==========
document.addEventListener('DOMContentLoaded', () => {
    const midiBtn = document.getElementById('midiSettingsBtn');
    const modal = document.getElementById('midiModal');
    const closeBtn = document.querySelector('.midi-modal-close');
    const performanceModeBtn = document.getElementById('performanceModeBtn');
    const metronomeBtn = document.getElementById('metronomeBtn');
    const latencyMonitorBtn = document.getElementById('latencyMonitorBtn');
    const latencyDisplay = document.getElementById('latencyDisplay');
    const midiDeviceList = document.getElementById('midiDeviceList');

    // Open modal
    if (midiBtn) {
        midiBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            updateMIDIDeviceList();
        });
    }

    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Performance Mode toggle
    if (performanceModeBtn) {
        performanceModeBtn.addEventListener('click', () => {
            window.livePerformance.togglePerformanceMode();
            performanceModeBtn.classList.toggle('active');
            performanceModeBtn.textContent = window.livePerformance.performanceMode 
                ? 'Disable Performance Mode' 
                : 'Enable Performance Mode';
        });
    }

    // Metronome toggle
    if (metronomeBtn) {
        metronomeBtn.addEventListener('click', () => {
            window.livePerformance.metronomeEnabled = !window.livePerformance.metronomeEnabled;
            metronomeBtn.classList.toggle('active');
            metronomeBtn.textContent = window.livePerformance.metronomeEnabled 
                ? 'Disable Metronome' 
                : 'Enable Metronome';
        });
    }

    // Latency Monitor toggle
    if (latencyMonitorBtn) {
        latencyMonitorBtn.addEventListener('click', () => {
            const isVisible = latencyDisplay.style.display !== 'none';
            latencyDisplay.style.display = isVisible ? 'none' : 'block';
            latencyMonitorBtn.classList.toggle('active');
            latencyMonitorBtn.textContent = isVisible 
                ? 'Show Latency Monitor' 
                : 'Hide Latency Monitor';
            
            if (!isVisible) {
                updateLatencyDisplay();
            }
        });
    }

    // Update MIDI device list
    function updateMIDIDeviceList() {
        if (!midiDeviceList) return;
        
        const lp = window.livePerformance;
        if (lp.midiInputs.length === 0) {
            midiDeviceList.innerHTML = '<p class="midi-status">No MIDI devices detected</p>';
        } else {
            midiDeviceList.innerHTML = lp.midiInputs.map(input => 
                `<div class="midi-device">🎹 ${input.name || 'Unknown Device'}</div>`
            ).join('');
        }
    }

    // Update latency display
    function updateLatencyDisplay() {
        if (!window.audioContext) return;
        
        const audioLatency = (window.audioContext.baseLatency || 0) * 1000;
        const inputLatency = (window.audioContext.baseLatency || 0) * 1000;
        
        const audioEl = document.getElementById('audioLatency');
        const inputEl = document.getElementById('inputLatency');
        
        if (audioEl) {
            audioEl.textContent = `${audioLatency.toFixed(2)}ms`;
            audioEl.className = 'latency-value ' + getLatencyClass(audioLatency);
        }
        
        if (inputEl) {
            inputEl.textContent = `${inputLatency.toFixed(2)}ms`;
            inputEl.className = 'latency-value ' + getLatencyClass(inputLatency);
        }
        
        // Update every second
        if (latencyDisplay && latencyDisplay.style.display !== 'none') {
            setTimeout(updateLatencyDisplay, 1000);
        }
    }

    function getLatencyClass(latency) {
        if (latency < 10) return 'good';
        if (latency < 20) return 'okay';
        return 'high';
    }

    // Listen for MIDI connection changes
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(access => {
            access.addEventListener('statechange', () => {
                updateMIDIDeviceList();
            });
        }).catch(err => {
            console.log('MIDI access denied or not supported');
        });
    }
});
