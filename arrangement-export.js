// ========================================
// ARRANGEMENT EXPORT FUNCTIONALITY
// ========================================

// Store loaded folder audio files
let arrangementFolderAudioFiles = {}; // {filename: audioBuffer}

// Export buttons are already in the File menu, no need to add them
// This function is kept for compatibility but does nothing
function initExportButton() {
    return;
    
    // Create export section
    const exportSection = document.createElement('div');
    exportSection.id = 'arr-export-section';
    exportSection.style.cssText = `
        margin-top: 20px;
        padding: 15px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border-left: 3px solid #930018;
    `;
    
    exportSection.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; color: #717d9f; margin-bottom: 10px;">📥 Export</div>
        <div style="display: flex; gap: 8px; flex-direction: column;">
            <button id="arr-export-mp3" style="
                padding: 10px;
                background: #930018;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.3s;
            ">Export as MP3</button>
            <button id="arr-export-wav" style="
                padding: 10px;
                background: #930018;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.3s;
            ">Export as WAV</button>
        </div>
        <div id="arr-export-progress" style="
            margin-top: 10px;
            text-align: center;
            color: #aaa;
            font-size: 12px;
            display: none;
        ">Exporting...</div>
    `;
}

// Main export function called from File menu
async function exportArrangementToFile(format) {
    return await exportArrangement(format);
}

// Export arrangement to audio file
async function exportArrangement(format) {
    try {
        if (arrangementState.clips.length === 0) {
            alert('No clips to export. Add some clips to the arrangement first.');
            return;
        }
        
        showExportProgress(true);
        
        // Calculate total duration based on all clips
        let maxEndTime = 0;
        arrangementState.clips.forEach(clip => {
            // Use correct property names: startBar and lengthBars
            const clipEndBar = (clip.startBar || 0) + (clip.lengthBars || clip.length || 1);
            const secondsPerBar = (60 / arrangementState.tempo) * 4; // 4 beats per bar
            const endTime = clipEndBar * secondsPerBar;
            if (endTime > maxEndTime) maxEndTime = endTime;
        });
        
        if (maxEndTime === 0) {
            alert('⚠️ Cannot determine arrangement duration! Make sure you have clips in the arrangement.');
            showExportProgress(false);
            return;
        }
        
        // Add 1 second buffer at end
        const totalDuration = maxEndTime + 1;
        const sampleRate = 44100;
        
        // Create offline context for rendering
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            2, // stereo
            Math.ceil(sampleRate * totalDuration),
            sampleRate
        );
        
        // Create master gain
        const masterGain = offlineCtx.createGain();
        masterGain.gain.value = 0.95; // Prevent clipping
        masterGain.connect(offlineCtx.destination);
        
        // Render each clip
        for (const clip of arrangementState.clips) {
            try {
                await renderClipToOfflineContext(clip, offlineCtx, masterGain, sampleRate);
            } catch (e) {
                console.error('Error rendering clip:', e);
            }
        }
        
        // Render offline
        const renderedBuffer = await offlineCtx.startRendering();
        
        // Convert to file
        if (format === 'mp3') {
            await exportToMP3(renderedBuffer, sampleRate);
        } else if (format === 'wav') {
            exportToWAV(renderedBuffer, sampleRate);
        }
        
        showExportProgress(false);
        alert('✅ Export completed! File saved to Downloads.');

    } catch (error) {
        console.error('Export error:', error);
        showExportProgress(false);
        alert('❌ Export failed: ' + error.message);
    }
}

// Render a single clip to offline context
async function renderClipToOfflineContext(clip, offlineCtx, masterGain, sampleRate) {
    const audioBuffer = await getClipAudioBuffer(clip);
    if (!audioBuffer) {
        return;
    }
    
    // Get clip timing - USE CORRECT PROPERTY NAMES
    const beatDuration = 60 / arrangementState.tempo;
    const startTime = (clip.startBar || 0) * beatDuration * 4; // 4 beats per bar
    const clipLength = clip.lengthBars || clip.length || 1;
    
    // Create buffer source
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    // Apply clip properties
    const clipGain = offlineCtx.createGain();
    clipGain.gain.value = clip.volume || 1;
    
    // Apply basic effects if any
    let targetNode = clipGain;
    
    if (clip.pan !== undefined && clip.pan !== 0) {
        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, clip.pan / 100));
        clipGain.connect(panner);
        targetNode = panner;
    }
    
    targetNode.connect(masterGain);
    source.connect(clipGain);
    
    // Calculate clip duration in seconds
    const clipBars = clip.lengthBars || clip.length || 1;
    const clipDurationSeconds = clipBars * beatDuration * 4; // 4 beats per bar
    
    // Apply stretch/trim mode
    if (clip.stretchMode === true) {
        // STRETCH MODE: Time-stretch entire sample to fit clip length
        const sampleDuration = audioBuffer.duration;
        const stretchRatio = sampleDuration / clipDurationSeconds;
        source.playbackRate.value = stretchRatio;
        source.start(startTime, 0); // Start from beginning
        source.stop(startTime + clipDurationSeconds);
    } else {
        // TRIM MODE: Play at original speed, starting from trimStart
        const trimStartSeconds = (clip.trimStart || 0) * beatDuration * 4;
        source.start(startTime, trimStartSeconds);
        source.stop(startTime + clipDurationSeconds);
    }
}

// Get audio buffer from a clip (sample or pattern)
async function getClipAudioBuffer(clip) {
    try {
        if (clip.type === 'pattern') {
            // Render pattern to audio
            const patternName = clip.data;
            if (pianoRollData && pianoRollData[patternName]) {

                return await renderPatternToBuffer(pianoRollData[patternName], patternName);
            }
        } else if (clip.type === 'sample') {
            // Determine sample source based on audioSource metadata or legacy data
            let buffer = null;
            
            if (clip.audioSource) {
                // New format with audioSource metadata
                if (clip.audioSource.type === 'custom') {
                    // Custom uploaded sample
                    const sampleKey = clip.audioSource.sampleKey;
                    buffer = sampleBuffers[sampleKey];
                } else if (clip.audioSource.type === 'folder') {
                    // Folder sample
                    const fileName = clip.audioSource.fileName;
                    buffer = folderAudioBuffers[fileName];
                } else if (clip.audioSource.type === 'standard') {
                    // Standard numbered sample
                    buffer = sampleBuffers[clip.audioSource.sampleNumber];

                }
            } else {
                // Legacy format - try to detect
                const sampleKey = clip.data;
                if (typeof sampleKey === 'string') {
                    if (sampleKey.startsWith('custom_') || sampleKey.startsWith('recording_')) {
                        buffer = sampleBuffers[sampleKey];
                    } else {
                        // Assume folder sample
                        buffer = folderAudioBuffers[sampleKey];
                    }
                } else {
                    // Numeric sample
                    buffer = sampleBuffers[sampleKey];
                }
            }
            
            return buffer;
        }
    } catch (e) {
        console.error('Error getting clip audio buffer:', e);
    }
    return null;
}

// Render pattern to audio buffer
async function renderPatternToBuffer(pattern, patternName) {
    try {
        const tempo = arrangementState.tempo || 120;
        const beatDuration = 60 / tempo;
        const stepDuration = beatDuration / 4;
        const duration = (pattern.length || 1) * beatDuration * 4;
        const sampleRate = 44100;
        
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1,
            Math.ceil(sampleRate * duration),
            sampleRate
        );
        
        const masterGain = offlineCtx.createGain();
        masterGain.connect(offlineCtx.destination);
        
        // Render each note
        if (pattern.notes && Array.isArray(pattern.notes)) {
            pattern.notes.forEach(note => {
                const time = note.col * stepDuration;
                const noteDuration = (note.length || 1) * stepDuration;
                const frequency = rowToFrequency(note.row);
                
                // Simple sine wave for now
                const osc = offlineCtx.createOscillator();
                const env = offlineCtx.createGain();
                
                osc.frequency.value = frequency;
                osc.type = 'sine';
                osc.connect(env);
                env.connect(masterGain);
                
                // ADSR-like envelope
                env.gain.setValueAtTime(0, time);
                env.gain.linearRampToValueAtTime(0.8, time + 0.01);
                env.gain.linearRampToValueAtTime(0.1, time + noteDuration - 0.05);
                env.gain.linearRampToValueAtTime(0, time + noteDuration);
                
                osc.start(time);
                osc.stop(time + noteDuration);
            });
        }
        
        return await offlineCtx.startRendering();
    } catch (e) {
        console.error('Error rendering pattern:', e);
        return null;
    }
}

// Export to WAV format
function exportToWAV(audioBuffer, sampleRate) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate_ = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    
    const channelData = [];
    for (let i = 0; i < numberOfChannels; i++) {
        channelData.push(audioBuffer.getChannelData(i));
    }
    
    const dataLength = audioBuffer.length * numberOfChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate_, true);
    view.setUint32(28, sampleRate_ * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write interleaved audio data
    let offset = 44;
    const length = audioBuffer.length;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            let sample = Math.max(-1, Math.min(1, channelData[channel][i]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }
    
    // Download
    const blob = new Blob([buffer], { type: 'audio/wav' });
    downloadBlob(blob, 'arrangement.wav');
}

// Export to MP3 format (requires MP3 encoder library)
async function exportToMP3(audioBuffer, sampleRate) {
    try {
        // Try to use a simple MP3 encoder library
        // For now, fallback to WAV if MP3 encoder not available
        if (typeof lamejs !== 'undefined') {
            // Use lamejs if available
            const channelData = audioBuffer.getChannelData(0);
            const samples = new Uint8Array(channelData.buffer);
            const mp3 = new lamejs.Mp3Encoder(
                audioBuffer.numberOfChannels,
                sampleRate,
                128
            );
            
            const maxSamples = 1152;
            let mp3Data = [];
            
            for (let i = 0; i < samples.length; i += maxSamples) {
                const samplesBatch = samples.slice(i, i + maxSamples);
                const mp3buf = mp3.encodeBuffer(samplesBatch);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }
            
            const mp3buf = mp3.flush();
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
            
            const blob = new Blob(mp3Data, { type: 'audio/mp3' });
            downloadBlob(blob, 'arrangement.mp3');
        } else {
            // Fallback to WAV
            exportToWAV(audioBuffer, sampleRate);
        }
    } catch (e) {
        exportToWAV(audioBuffer, sampleRate);
    }
}

// Download blob as file
async function downloadBlob(blob, filename) {
    // Check if running in Electron - use native save dialog
    if (window.electronAPI && window.electronAPI.saveAudioFile) {
        try {
            // Convert blob to ArrayBuffer
            const arrayBuffer = await blob.arrayBuffer();
            
            // Determine format from filename
            const format = filename.endsWith('.mp3') ? 'mp3' : 'wav';
            
            // Use Electron's native save dialog
            const result = await window.electronAPI.saveAudioFile(arrayBuffer, format);
            
            if (result.success) {
                showExportSuccessPopup(result.filePath, format);
            } else {
                if (result.error !== 'Save cancelled') {
                    alert('Export failed: ' + result.error);
                }
            }
        } catch (error) {
            // Fallback to browser download
            browserDownload(blob, filename);
        }
    } else {
        // Web mode - use browser download
        browserDownload(blob, filename);
    }
}

// Browser download fallback
function browserDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Show export success popup
function showExportSuccessPopup(filePath, format) {
    const popup = document.getElementById('export-success-popup-overlay');
    if (popup) {
        const pathDisplay = document.getElementById('export-popup-path');
        const formatDisplay = document.getElementById('export-popup-format');
        
        if (pathDisplay) pathDisplay.textContent = filePath;
        if (formatDisplay) formatDisplay.textContent = format.toUpperCase();
        
        popup.style.display = 'flex';
        
        // Auto-close after 3 seconds
        setTimeout(() => {
            popup.style.display = 'none';
        }, 3000);
    }
}

// Show/hide export progress
function showExportProgress(show) {
    const progress = document.getElementById('arr-export-progress');
    if (progress) {
        progress.style.display = show ? 'block' : 'none';
    }
}

// Helper function to convert piano roll row to frequency
function rowToFrequency(row) {
    // C4 is row 0 at 261.63 Hz
    // Each row is a semitone
    const C4 = 261.63;
    return C4 * Math.pow(2, (row) / 12);
}
