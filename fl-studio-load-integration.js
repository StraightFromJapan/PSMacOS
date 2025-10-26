// =============================================================================
// PROJECT LOADING INTEGRATION

async function loadProjectWithAutoSamples() {
    try {
        if (!window.electronAPI || !window.electronAPI.loadProjectFile) {
            alert('Project loading is only available in desktop app');
            return;
        }
        
        showLoadingProgress('Loading Project...', 'Opening file dialog...');
        
        // Open file dialog and load project
        const result = await window.electronAPI.loadProjectFile();
        
        if (!result.success) {
            hideLoadingProgress();
            if (result.error !== 'No file selected') {
                alert('Failed to load project: ' + result.error);
            }
            return;
        }
        
        showLoadingProgress('Loading Project...', `Loading ${result.samplesLoaded} samples...`);
        
        const projectData = result.projectData;
        const customSampleBuffers = result.customSampleBuffers;
        
        console.log(`✅ Project loaded: ${result.projectPath}`);
        console.log(`✅ Auto-loaded ${result.samplesLoaded} custom samples`);
        
        // 1. Restore arrangement state
        if (projectData.tracks) {
            // Clear existing tracks
            clearAllTracks();
            
            // Rebuild tracks from saved data
            projectData.tracks.forEach(trackData => {
                const track = createTrack();
                track.volume = trackData.volume || 1.0;
                track.pan = trackData.pan || 0;
                track.solo = trackData.solo || false;
                track.mute = trackData.mute || false;
                
                // Restore track effects
                if (trackData.effects) {
                    track.effects = trackData.effects;
                }
            });
        }
        
        // 2. Restore audio clips
        if (projectData.clips) {
            for (const clipData of projectData.clips) {
                const sampleKey = clipData.sampleKey;
                
                // Check if this is a custom sample that was auto-loaded
                if (customSampleBuffers[sampleKey]) {
                    // Decode the auto-loaded audio buffer
                    const sampleData = customSampleBuffers[sampleKey];
                    const arrayBuffer = new Uint8Array(sampleData.data).buffer;
                    
                    try {
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        
                        // Store in custom samples
                        if (!customSamples) {
                            window.customSamples = {};
                        }
                        customSamples[sampleKey] = {
                            buffer: audioBuffer,
                            name: clipData.sampleName || sampleKey,
                            originalFilePath: sampleData.originalFilePath
                        };
                        
                        console.log(`✅ Restored custom sample: ${sampleKey}`);
                    } catch (decodeError) {
                        console.error(`❌ Failed to decode ${sampleKey}:`, decodeError);
                        continue;
                    }
                }
                
                // Create audio clip on track
                createAudioClip(
                    clipData.trackIndex,
                    sampleKey,
                    clipData.startTime,
                    clipData.duration,
                    clipData.offset || 0
                );
            }
        }
        
        // 3. Restore global settings
        if (projectData.bpm) {
            setBPM(projectData.bpm);
        }
        if (projectData.masterVolume !== undefined) {
            setMasterVolume(projectData.masterVolume);
        }
        
        hideLoadingProgress();
        
        // Show success message
        showNotification(`✅ Project loaded with ${result.samplesLoaded} samples!`, 'success');
        
        console.log('✅ Project fully restored with all samples');
        
    } catch (error) {
        hideLoadingProgress();
        console.error('❌ Error loading project:', error);
        alert('Failed to load project: ' + error.message);
    }
}

/**
 * Add Load Project button to your UI
 * Place this where you have your Save button
 */
function addLoadProjectButton() {
    const toolbar = document.getElementById('arr-toolbar'); // Adjust selector
    
    const loadBtn = document.createElement('button');
    loadBtn.id = 'load-project-btn';
    loadBtn.className = 'toolbar-btn';
    loadBtn.innerHTML = '📂 Load Project';
    loadBtn.title = 'Load project with all samples automatically';
    loadBtn.onclick = loadProjectWithAutoSamples;
    
    toolbar.appendChild(loadBtn);
}

// Call this when arrangement page loads
if (window.electronAPI && window.electronAPI.loadProjectFile) {
    addLoadProjectButton();
    console.log('✅ Professional project loading enabled');
}

/**
 * Helper: Show loading progress
 */
function showLoadingProgress(title, status) {
    // Implement your loading UI here
    // Example:
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.querySelector('.loading-title').textContent = title;
        overlay.querySelector('.loading-status').textContent = status;
        overlay.style.display = 'flex';
    }
}

/**
 * Helper: Hide loading progress
 */
function hideLoadingProgress() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Helper: Show notification
 */
function showNotification(message, type = 'info') {
    // Implement your notification UI here
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message); // Replace with better UI
}

// =============================================================================
// INTEGRATION EXAMPLE
// =============================================================================
// In your existing Save Project function, use this format:
//
// async function saveProject() {
//     const projectData = {
//         version: '3.0.0',
//         timestamp: Date.now(),
//         bpm: currentBPM,
//         masterVolume: masterVolume,
//         tracks: tracks.map(t => ({
//             volume: t.volume,
//             pan: t.pan,
//             solo: t.solo,
//             mute: t.mute,
//             effects: t.effects
//         })),
//         clips: clips.map(c => ({
//             trackIndex: c.trackIndex,
//             sampleKey: c.sampleKey,
//             sampleName: c.sampleName,
//             startTime: c.startTime,
//             duration: c.duration,
//             offset: c.offset
//         }))
//     };
//     
//     // Collect custom sample audio buffers
//     const customSampleBuffers = {};
//     for (const [key, sample] of Object.entries(customSamples)) {
//         customSampleBuffers[key] = {
//             buffer: sample.buffer,
//             originalFilePath: sample.originalFilePath
//         };
//     }
//     
//     // Save with Electron API
//     const result = await window.electronAPI.saveProjectWithAudio(
//         projectData,
//         customSampleBuffers
//     );
//     
//     if (result.success) {
//         alert(`Project saved!\n${result.samplesCount} samples backed up`);
//     }
// }
