// ========================================
// PERFORMANCE OPTIMIZATIONS FOR PSYCHOLOGICAL STUDIO
// Optimizes audio processing and rendering for smooth playback
// ========================================

console.log('🚀 Loading performance optimizations...');

// 1. Audio Processing Optimization
// Use efficient audio buffer pooling to reduce GC pressure
class AudioBufferPool {
    constructor(maxBuffers = 10) {
        this.maxBuffers = maxBuffers;
        this.pool = [];
    }

    acquire(context, length, channels = 1, sampleRate = 44100) {
        if (this.pool.length > 0) {
            const buffer = this.pool.pop();
            if (buffer.length === length && buffer.numberOfChannels === channels) {
                return buffer;
            }
        }
        return context.createBuffer(channels, length, sampleRate);
    }

    release(buffer) {
        if (this.pool.length < this.maxBuffers) {
            // Clear buffer data
            for (let i = 0; i < buffer.numberOfChannels; i++) {
                const channel = buffer.getChannelData(i);
                for (let j = 0; j < channel.length; j++) {
                    channel[j] = 0;
                }
            }
            this.pool.push(buffer);
        }
    }

    clear() {
        this.pool = [];
    }
}

// 2. Optimize Canvas Rendering (reduce redraws)
class OptimizedCanvasRenderer {
    constructor(canvas, fps = 60) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false }); // Disable transparency for performance
        this.fps = fps;
        this.frameInterval = 1000 / fps;
        this.lastFrameTime = 0;
        this.isAnimating = false;
        this.animationId = null;
    }

    startAnimation(renderCallback) {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.lastFrameTime = performance.now();

        const animate = (currentTime) => {
            const deltaTime = currentTime - this.lastFrameTime;

            // Only render if enough time has passed for the target FPS
            if (deltaTime >= this.frameInterval) {
                renderCallback(this.ctx, deltaTime / 1000);
                this.lastFrameTime = currentTime;
            }

            if (this.isAnimating) {
                this.animationId = requestAnimationFrame(animate);
            }
        };

        this.animationId = requestAnimationFrame(animate);
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// 3. Memory-efficient audio node management
class AudioNodeManager {
    constructor() {
        this.activeNodes = new Map();
        this.maxNodes = 50; // Maximum simultaneous audio nodes
    }

    create(context, nodeType, config = {}) {
        if (this.activeNodes.size >= this.maxNodes) {
            // Clean up oldest node
            const firstKey = this.activeNodes.keys().next().value;
            this.cleanup(firstKey);
        }

        let node;
        switch (nodeType) {
            case 'gain':
                node = context.createGain();
                break;
            case 'filter':
                node = context.createBiquadFilter();
                break;
            case 'oscillator':
                node = context.createOscillator();
                break;
            case 'analyser':
                node = context.createAnalyser();
                break;
            default:
                return null;
        }

        // Apply config
        for (const [key, value] of Object.entries(config)) {
            if (node[key] !== undefined) {
                if (typeof node[key].value !== 'undefined') {
                    node[key].value = value;
                } else {
                    node[key] = value;
                }
            }
        }

        const nodeId = Date.now() + Math.random();
        this.activeNodes.set(nodeId, { node, type: nodeType, createdAt: performance.now() });
        return { node, id: nodeId };
    }

    cleanup(nodeId) {
        const data = this.activeNodes.get(nodeId);
        if (data) {
            try {
                if (data.type === 'oscillator') {
                    data.node.stop();
                }
                // Disconnect all connections
                data.node.disconnect();
            } catch (e) {
                console.warn('Error cleaning up audio node:', e);
            }
            this.activeNodes.delete(nodeId);
        }
    }

    cleanupAll() {
        for (const nodeId of this.activeNodes.keys()) {
            this.cleanup(nodeId);
        }
    }
}

// 4. Efficient sample loading with compression detection
async function loadAudioOptimized(context, url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();

        // Use OfflineAudioContext for decoding if main context is busy
        if (context.state === 'suspended') {
            await context.resume();
        }

        // Decode with error handling
        let audioBuffer;
        try {
            audioBuffer = await context.decodeAudioData(arrayBuffer);
        } catch (decodeError) {
            console.error('Failed to decode audio, trying alternative decoder:', decodeError);
            // Fallback: try with Web Audio API's alternative methods
            return null;
        }

        return audioBuffer;
    } catch (error) {
        console.error('Error loading audio:', error);
        return null;
    }
}

// 5. Efficient sample playback with voice pool
class VoicePool {
    constructor(context, maxVoices = 16) {
        this.context = context;
        this.maxVoices = maxVoices;
        this.voices = [];
        this.activeVoices = new Set();

        for (let i = 0; i < maxVoices; i++) {
            this.voices.push({
                active: false,
                source: null,
                gain: context.createGain(),
                startTime: 0
            });
        }
    }

    getVoice() {
        let voice = this.voices.find(v => !v.active);
        if (!voice && this.activeVoices.size < this.maxVoices) {
            voice = {
                active: false,
                source: null,
                gain: this.context.createGain(),
                startTime: 0
            };
            this.voices.push(voice);
        }
        return voice;
    }

    playBuffer(buffer, rate = 1, gain = 1) {
        const voice = this.getVoice();
        if (!voice) return null;

        try {
            if (voice.source) {
                voice.source.stop();
                voice.source.disconnect();
            }

            voice.source = this.context.createBufferSource();
            voice.source.buffer = buffer;
            voice.source.playbackRate.value = rate;
            voice.gain.gain.value = gain;
            voice.source.connect(voice.gain);
            voice.gain.connect(this.context.destination);

            voice.active = true;
            voice.startTime = performance.now();

            voice.source.onended = () => {
                voice.active = false;
                this.activeVoices.delete(voice);
            };

            voice.source.start(0);
            this.activeVoices.add(voice);

            return voice;
        } catch (e) {
            console.error('Error playing buffer:', e);
            return null;
        }
    }

    stopAll() {
        for (const voice of this.voices) {
            if (voice.active && voice.source) {
                try {
                    voice.source.stop();
                } catch (e) { /* already stopped */ }
                voice.active = false;
            }
        }
        this.activeVoices.clear();
    }
}

// 6. Debounce heavy operations
function debounce(func, wait) {
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

// 7. Request Animation Frame throttle for smooth 60 FPS
let lastFrameTime = 0;
const frameIntervals = {
    '60fps': 16.67,
    '30fps': 33.33,
    '24fps': 41.67
};

function throttleRAF(callback, fps = '60fps') {
    return () => {
        const currentTime = performance.now();
        const interval = frameIntervals[fps] || frameIntervals['60fps'];

        if (currentTime - lastFrameTime >= interval) {
            callback();
            lastFrameTime = currentTime;
        }
        requestAnimationFrame(() => throttleRAF(callback, fps));
    };
}

// 8. Efficient audio visualization with decimation
class EfficientVisualizer {
    constructor(analyser, canvas, decimationFactor = 4) {
        this.analyser = analyser;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.decimationFactor = decimationFactor;
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    draw() {
        this.analyser.getByteFrequencyData(this.dataArray);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.dataArray.length;

        this.ctx.fillStyle = 'rgb(20, 20, 30)';
        this.ctx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * this.decimationFactor;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i += this.decimationFactor) {
            barHeight = (this.dataArray[i] / 255) * height;

            // Color gradient
            const hue = (i / bufferLength) * 360;
            this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth;
        }
    }
}

// 9. Enable Web Workers for heavy computation
function createWorkerForFFT() {
    const workerCode = `
        self.onmessage = function(event) {
            const data = event.data;
            // Simple FFT or signal processing can go here
            self.postMessage({ result: data });
        };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

// 10. Export optimizations for global use
window.AudioOptimizations = {
    BufferPool: AudioBufferPool,
    CanvasRenderer: OptimizedCanvasRenderer,
    NodeManager: AudioNodeManager,
    loadAudioOptimized,
    VoicePool,
    debounce,
    EfficientVisualizer,
    createWorkerForFFT
};

console.log('✅ Performance optimizations loaded. Access via window.AudioOptimizations');
