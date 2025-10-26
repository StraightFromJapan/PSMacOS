/**
 * Audio Processing Web Worker
 * Offloads heavy audio computations from the main thread
 */

// Worker state
let audioContext = null;
let sampleBuffers = new Map();
let processingQueue = [];

// Initialize audio context in worker (if supported)
self.addEventListener('message', async (event) => {
    const { type, data, id } = event.data;

    try {
        switch (type) {
            case 'INIT':
                handleInit(data);
                break;
            
            case 'DECODE_AUDIO':
                await handleDecodeAudio(data, id);
                break;
            
            case 'ANALYZE_WAVEFORM':
                await handleAnalyzeWaveform(data, id);
                break;
            
            case 'PROCESS_EFFECTS':
                await handleProcessEffects(data, id);
                break;
            
            case 'CALCULATE_FFT':
                await handleCalculateFFT(data, id);
                break;
            
            case 'NORMALIZE_AUDIO':
                await handleNormalizeAudio(data, id);
                break;
            
            case 'CLEAR_CACHE':
                handleClearCache();
                break;
            
            default:
                console.warn('Unknown worker message type:', type);
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            id,
            error: error.message
        });
    }
});

function handleInit(data) {
    console.log('Audio worker initialized');
    self.postMessage({ type: 'INITIALIZED' });
}

async function handleDecodeAudio(data, id) {
    const { arrayBuffer, cacheKey } = data;
    
    try {
        // Use OfflineAudioContext for decoding in worker
        const offlineContext = new OfflineAudioContext(2, 44100, 44100);
        const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);
        
        // Extract channel data
        const channelData = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            channelData.push(audioBuffer.getChannelData(i));
        }
        
        // Store in cache
        if (cacheKey) {
            sampleBuffers.set(cacheKey, {
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                numberOfChannels: audioBuffer.numberOfChannels,
                length: audioBuffer.length
            });
        }
        
        self.postMessage({
            type: 'AUDIO_DECODED',
            id,
            data: {
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                numberOfChannels: audioBuffer.numberOfChannels,
                length: audioBuffer.length,
                channelData: channelData
            }
        }, channelData.map(data => data.buffer)); // Transfer ownership
        
    } catch (error) {
        throw new Error(`Failed to decode audio: ${error.message}`);
    }
}

async function handleAnalyzeWaveform(data, id) {
    const { audioData, width, height } = data;
    
    try {
        // Downsample audio data for waveform visualization
        const samples = downsampleAudio(audioData, width);
        
        // Calculate peaks for visualization
        const peaks = calculatePeaks(samples, height);
        
        self.postMessage({
            type: 'WAVEFORM_ANALYZED',
            id,
            data: { peaks }
        });
        
    } catch (error) {
        throw new Error(`Failed to analyze waveform: ${error.message}`);
    }
}

async function handleProcessEffects(data, id) {
    const { audioData, effects } = data;
    
    try {
        let processedData = new Float32Array(audioData);
        
        // Apply effects sequentially
        if (effects.volume !== undefined && effects.volume !== 1) {
            processedData = applyVolume(processedData, effects.volume);
        }
        
        if (effects.pitch !== undefined && effects.pitch !== 1) {
            processedData = applyPitchShift(processedData, effects.pitch);
        }
        
        if (effects.normalize) {
            processedData = normalizeAudio(processedData);
        }
        
        self.postMessage({
            type: 'EFFECTS_PROCESSED',
            id,
            data: { processedData }
        }, [processedData.buffer]);
        
    } catch (error) {
        throw new Error(`Failed to process effects: ${error.message}`);
    }
}

async function handleCalculateFFT(data, id) {
    const { audioData, fftSize } = data;
    
    try {
        // Calculate FFT for frequency analysis
        const fftData = calculateFFT(audioData, fftSize || 2048);
        
        self.postMessage({
            type: 'FFT_CALCULATED',
            id,
            data: { fftData }
        });
        
    } catch (error) {
        throw new Error(`Failed to calculate FFT: ${error.message}`);
    }
}

async function handleNormalizeAudio(data, id) {
    const { audioData } = data;
    
    try {
        const normalized = normalizeAudio(audioData);
        
        self.postMessage({
            type: 'AUDIO_NORMALIZED',
            id,
            data: { normalized }
        }, [normalized.buffer]);
        
    } catch (error) {
        throw new Error(`Failed to normalize audio: ${error.message}`);
    }
}

function handleClearCache() {
    sampleBuffers.clear();
    processingQueue = [];
    self.postMessage({ type: 'CACHE_CLEARED' });
}

// Helper functions

function downsampleAudio(audioData, targetLength) {
    const blockSize = Math.floor(audioData.length / targetLength);
    const samples = new Float32Array(targetLength);
    
    for (let i = 0; i < targetLength; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, audioData.length);
        let sum = 0;
        
        for (let j = start; j < end; j++) {
            sum += Math.abs(audioData[j]);
        }
        
        samples[i] = sum / (end - start);
    }
    
    return samples;
}

function calculatePeaks(samples, height) {
    const peaks = [];
    const halfHeight = height / 2;
    
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i] * halfHeight;
        peaks.push({
            min: halfHeight - value,
            max: halfHeight + value
        });
    }
    
    return peaks;
}

function applyVolume(audioData, volume) {
    const output = new Float32Array(audioData.length);
    
    for (let i = 0; i < audioData.length; i++) {
        output[i] = audioData[i] * volume;
    }
    
    return output;
}

function applyPitchShift(audioData, pitchFactor) {
    // Simple pitch shift using sample rate conversion
    const outputLength = Math.floor(audioData.length / pitchFactor);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
        const position = i * pitchFactor;
        const index = Math.floor(position);
        const fraction = position - index;
        
        if (index + 1 < audioData.length) {
            // Linear interpolation
            output[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
        } else if (index < audioData.length) {
            output[i] = audioData[index];
        }
    }
    
    return output;
}

function normalizeAudio(audioData) {
    // Find peak value
    let peak = 0;
    for (let i = 0; i < audioData.length; i++) {
        const abs = Math.abs(audioData[i]);
        if (abs > peak) peak = abs;
    }
    
    // Normalize to 0.95 to prevent clipping
    const output = new Float32Array(audioData.length);
    const normalizationFactor = peak > 0 ? 0.95 / peak : 1;
    
    for (let i = 0; i < audioData.length; i++) {
        output[i] = audioData[i] * normalizationFactor;
    }
    
    return output;
}

function calculateFFT(audioData, fftSize) {
    // Simple DFT implementation (for demonstration)
    // In production, use a proper FFT library like fft.js
    const output = new Float32Array(fftSize / 2);
    const N = Math.min(audioData.length, fftSize);
    
    for (let k = 0; k < fftSize / 2; k++) {
        let real = 0;
        let imag = 0;
        
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / fftSize;
            real += audioData[n] * Math.cos(angle);
            imag -= audioData[n] * Math.sin(angle);
        }
        
        output[k] = Math.sqrt(real * real + imag * imag) / N;
    }
    
    return output;
}

// Report ready state
self.postMessage({ type: 'READY' });
