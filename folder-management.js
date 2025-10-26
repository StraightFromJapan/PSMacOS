// ========================================
// FOLDER & AUDIO MANAGEMENT
// Handles folder selection, audio loading, persistence
// ========================================

// Global audio storage - IMPORTANT: Declare before use
let sampleBuffers = {}; // Stores decoded audio buffers by filename
let folderAudioBuffers = {}; // For arrangement folder loading
let currentFolderPath = null; // Current folder being used
let currentFolderFiles = []; // List of files in current folder

// Persistent storage keys
const STORAGE_KEYS = {
    FOLDER_PATH: 'psypower-selected-folder-path',
    FOLDER_FILES: 'psypower-selected-folder-files',
    SAMPLE_BUFFERS: 'psypower-sample-buffers-cache',
    PROJECT_FOLDER: 'psypower-project-folder'
};

/**
 * Initialize global audio context for decoding
 */
let globalAudioContext = null;
function getAudioContext() {
    if (!globalAudioContext) {
        try {
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();

        } catch (e) {
            console.error('❌ Failed to create audio context:', e);
        }
    }
    return globalAudioContext;
}

/**
 * Convert base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Load single audio file from folder through IPC
 */
async function loadAudioFileFromFolder(filePath) {
    try {

        if (!window.electronAPI || !window.electronAPI.loadAudioFile) {
            console.error('❌ [Load] electronAPI.loadAudioFile not available');
            console.error('   window.electronAPI exists:', !!window.electronAPI);
            console.error('   loadAudioFile exists:', window.electronAPI ? !!window.electronAPI.loadAudioFile : false);
            return null;
        }

        const ctx = getAudioContext();
        if (!ctx) {
            console.error('❌ [Load] Audio context unavailable');
            return null;
        }

        // Call main process to load file

        const result = await window.electronAPI.loadAudioFile(filePath);

        if (!result.success) {
            console.error(`❌ [Load] Failed to load ${filePath}:`, result.error);
            return null;
        }

        // Decode audio data (now receives raw array, not base64)
        try {

            // Convert array to ArrayBuffer (no CSP issues!)
            const arrayBuffer = new Uint8Array(result.data).buffer;

            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            
            console.log(`✅ [Load] Decoded successfully: ${filePath.split(/[\\/]/).pop()} (${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels}ch, SR=${audioBuffer.sampleRate})`);
            return audioBuffer;
        } catch (decodeError) {
            console.error('❌ [Load] Failed to decode audio:', decodeError);
            console.error('   Error message:', decodeError.message);
            console.error('   Error stack:', decodeError.stack);
            return null;
        }
    } catch (error) {
        console.error('❌ [Load] Error loading audio file:', error);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
        return null;
    }
}

/**
 * Save folder path and files to persistent storage
 */
function saveFolderState(folderPath, files) {
    try {
        localStorage.setItem(STORAGE_KEYS.FOLDER_PATH, folderPath);
        localStorage.setItem(STORAGE_KEYS.FOLDER_FILES, JSON.stringify(files));
        console.log(`✅ Saved folder state: ${folderPath} (${files.length} files)`);
    } catch (e) {
        console.error('❌ Failed to save folder state:', e);
    }
}

/**
 * Load folder path and files from persistent storage
 */
function loadFolderState() {
    try {
        const folderPath = localStorage.getItem(STORAGE_KEYS.FOLDER_PATH);
        const filesJson = localStorage.getItem(STORAGE_KEYS.FOLDER_FILES);
        
        if (folderPath && filesJson) {
            const files = JSON.parse(filesJson);
            console.log(`✅ Loaded folder state: ${folderPath} (${files.length} files)`);
            return { folderPath, files };
        }
        return null;
    } catch (e) {
        console.error('❌ Failed to load folder state:', e);
        return null;
    }
}

/**
 * Load all audio files from folder (for both PsychologicalStudio and Arrangement)
 */
async function loadAllAudioFilesFromFolder(folderPath, audioFiles, targetBuffer, progressCallback = null) {
    try {

        // Validate inputs
        if (!audioFiles || !Array.isArray(audioFiles)) {
            console.error('❌ [LoadAll] audioFiles is not an array:', audioFiles);
            return { success: false, error: 'audioFiles is not an array', loadedCount: 0 };
        }
        
        if (audioFiles.length === 0) {
            console.warn('⚠️ [LoadAll] No audio files to load');
            return { success: true, loadedCount: 0, totalCount: 0, errors: [] };
        }
        
        const targetBuf = targetBuffer || folderAudioBuffers;
        let loadedCount = 0;
        const errors = [];
        const maxConcurrent = 4; // Load 4 files at a time for smooth progress

        // Load in batches to show real-time progress
        for (let i = 0; i < audioFiles.length; i += maxConcurrent) {
            const batch = audioFiles.slice(i, i + maxConcurrent);
            
            const batchPromises = batch.map(async (fileName) => {
                try {
                    // Build Windows file path
                    const filePath = folderPath + '\\' + fileName;
                    const buffer = await loadAudioFileFromFolder(filePath);

                    if (buffer && buffer.duration > 0) {
                        targetBuf[fileName] = buffer;
                        loadedCount++;
                        
                        // Report progress
                        if (progressCallback) {
                            progressCallback(loadedCount, audioFiles.length, fileName);
                        }
                        return { success: true, fileName };
                    } else {
                        console.warn(`    ❌ Got null/invalid buffer for ${fileName}`);
                        errors.push(fileName);
                        loadedCount++; // Count as processed
                        if (progressCallback) {
                            progressCallback(loadedCount, audioFiles.length, fileName);
                        }
                        return { success: false, fileName };
                    }
                } catch (err) {
                    console.warn(`    ⚠️ Failed to load ${fileName}:`, err.message);
                    errors.push(fileName);
                    loadedCount++; // Count as processed
                    if (progressCallback) {
                        progressCallback(loadedCount, audioFiles.length, fileName);
                    }
                    return { success: false, fileName };
                }
            });

            await Promise.all(batchPromises);
            
            // Small delay to allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        return { success: true, loadedCount: loadedCount - errors.length, totalCount: audioFiles.length, errors };
    } catch (error) {
        console.error('❌ [LoadAll] Error loading audio files:', error);
        return { success: false, error: error.message, loadedCount: 0 };
    }
}

/**
 * Get audio buffer by filename
 */
function getAudioBuffer(fileName, useFolder = false) {
    const source = useFolder ? folderAudioBuffers : sampleBuffers;
    return source[fileName] || null;
}

/**
 * Play audio buffer in arrangement
 */
function playAudioBufferInArrangement(audioBuffer, gainNode, filterNode, currentTime = 0, duration = null) {
    try {
        if (!audioBuffer) {
            console.warn('⚠️ No audio buffer provided');
            return null;
        }

        const ctx = getAudioContext();
        if (!ctx) return null;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        // Connect to nodes if provided
        if (gainNode && filterNode) {
            source.connect(filterNode);
            filterNode.connect(gainNode);
            gainNode.connect(ctx.destination);
        } else if (gainNode) {
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
        } else {
            source.connect(ctx.destination);
        }

        // Start playback
        source.start(ctx.currentTime, currentTime);

        // Stop at duration if specified
        if (duration !== null && duration > 0) {
            const stopTime = Math.min(currentTime + duration, audioBuffer.duration);
            source.stop(ctx.currentTime + (stopTime - currentTime));
        }

        console.log(`▶️ Playing audio buffer (${audioBuffer.duration.toFixed(2)}s)`);
        return source;
    } catch (error) {
        console.error('❌ Error playing audio buffer:', error);
        return null;
    }
}

/**
 * Export arrangement to audio file (MP3 or WAV)
 */
async function exportArrangementToFile(format = 'mp3') {
    try {
        console.log(`🎚️ Starting export to ${format.toUpperCase()}...`);

        if (!window.electronAPI || !window.electronAPI.saveAudioFile) {
            console.error('❌ electronAPI.saveAudioFile not available');
            alert('Export feature not available in this mode');
            return;
        }

        // Render arrangement offline
        const { audioBuffer, duration } = await renderArrangementOffline();

        if (!audioBuffer) {
            alert('❌ Failed to render arrangement');
            return;
        }

        // Convert to WAV or MP3
        let audioData;
        if (format === 'wav') {
            audioData = audioBufferToWAV(audioBuffer);
        } else {
            // For MP3, we'll send WAV data - main process can convert if available
            audioData = audioBufferToWAV(audioBuffer);
        }

        // Save file
        const result = await window.electronAPI.saveAudioFile(audioData, format);

        if (result.success) {

            alert(`✅ Exported successfully!\n${result.filePath}`);
        } else {
            console.error('❌ Export failed:', result.error);
            alert('❌ Export failed: ' + result.error);
        }
    } catch (error) {
        console.error('❌ Error exporting arrangement:', error);
        alert('❌ Error exporting: ' + error.message);
    }
}

/**
 * Convert audio buffer to WAV format
 */
function audioBufferToWAV(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const audioData = [];
    for (let channel = 0; channel < numberOfChannels; channel++) {
        audioData.push(audioBuffer.getChannelData(channel));
    }

    const interleaved = new Float32Array(audioBuffer.length * numberOfChannels);
    let index = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            interleaved[index++] = audioData[channel][i];
        }
    }

    const dataLength = interleaved.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // PCM data
    let offset = 44;
    const volume = 0.8;
    for (let i = 0; i < interleaved.length; i++) {
        view.setInt16(offset, interleaved[i] < 0 ? interleaved[i] * 0x8000 : interleaved[i] * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Render entire arrangement to offline audio context
 */
async function renderArrangementOffline() {
    try {
        if (typeof arrangementState === 'undefined') {
            console.error('❌ arrangementState not available');
            return { success: false, error: 'Arrangement state not found' };
        }

        // Calculate total duration
        let maxEndTime = 0;
        for (const clip of arrangementState.clips) {
            const endTime = (clip.startBar + clip.lengthBars) * (60 / arrangementState.tempo) / 4;
            maxEndTime = Math.max(maxEndTime, endTime);
        }

        const duration = Math.ceil(maxEndTime);
        const sampleRate = 44100;

        // Create offline context
        const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

        // Render each clip
        for (const clip of arrangementState.clips) {
            try {
                const startTime = (clip.startBar - 1) * (60 / arrangementState.tempo) / 4;
                let audioBuffer = null;

                // Get audio buffer (from folder or samples)
                if (clip.isFolder) {
                    audioBuffer = getAudioBuffer(clip.fileName, true);
                } else {
                    // Try to get from sample number
                    audioBuffer = getAudioBuffer(clip.fileName);
                }

                if (!audioBuffer) {
                    console.warn(`⚠️ No audio buffer for clip: ${clip.fileName}`);
                    continue;
                }

                // Calculate duration based on clip length
                const clipDuration = Math.min(clip.lengthBars * (60 / arrangementState.tempo) / 4, audioBuffer.duration);

                // Create source and play
                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineCtx.destination);
                source.start(startTime, clip.trimStart || 0, clipDuration);

                console.log(`  ▶️ Rendering clip at ${startTime.toFixed(2)}s`);
            } catch (err) {
                console.warn(`⚠️ Error rendering clip:`, err);
            }
        }

        // Render
        const renderedBuffer = await offlineCtx.startRendering();

        return { success: true, audioBuffer: renderedBuffer, duration };
    } catch (error) {
        console.error('❌ Error rendering arrangement:', error);
        return { success: false, error: error.message };
    }
}
