// ========================================
// FOLDER AUDIO LOADER
// Handles loading audio files from selected folders
// NOTE: Global variables are declared in folder-management.js
// ========================================

// Note: The following are declared in folder-management.js:
// - folderAudioContext
// - currentFolderPath
// - folderAudioFiles
// - folderAudioBuffers

// Initialize audio context for decoding
function initFolderAudioContext() {
    if (!folderAudioContext) {
        try {
            folderAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ Folder audio context initialized');
        } catch (e) {
            console.error('❌ Failed to create audio context:', e);
        }
    }
    return folderAudioContext;
}

// Load a single audio file from the folder
async function loadFolderAudioFile(filePath) {
    try {
        if (!window.electronAPI || !window.electronAPI.loadAudioFile) {
            console.warn('⚠️ loadAudioFile API not available');
            return null;
        }
        
        const ctx = initFolderAudioContext();
        if (!ctx) return null;
        
        // Load file as base64
        const result = await window.electronAPI.loadAudioFile(filePath);
        
        if (!result.success) {
            console.error('❌ Failed to load file:', result.error);
            return null;
        }
        
        // Decode audio data
        const arrayBuffer = base64ToArrayBuffer(result.data.split(',')[1]);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        console.log(`✅ Decoded audio file: ${filePath.split(/[\\/]/).pop()} (${audioBuffer.duration.toFixed(2)}s)`);
        
        return audioBuffer;
    } catch (error) {
        console.error('❌ Error loading audio file:', error);
        return null;
    }
}

// Load all files from a folder
async function loadAllFolderAudioFiles(folderPath, audioFiles) {
    try {
        console.log(`🎵 Loading ${audioFiles.length} audio files from folder...`);
        
        currentFolderPath = folderPath;
        let loadedCount = 0;
        
        for (const fileName of audioFiles) {
            try {
                const filePath = folderPath + '\\' + fileName; // Windows path
                const buffer = await loadFolderAudioFile(filePath);
                
                if (buffer) {
                    folderAudioBuffers[fileName] = buffer;
                    loadedCount++;
                    console.log(`✅ [${loadedCount}/${audioFiles.length}] Loaded: ${fileName}`);
                }
            } catch (err) {
                console.warn(`⚠️ Failed to load ${fileName}:`, err.message);
            }
        }
        
        console.log(`✅ Successfully loaded ${loadedCount}/${audioFiles.length} audio files`);
        return loadedCount;
    } catch (error) {
        console.error('❌ Error loading folder audio files:', error);
        return 0;
    }
}

// Get loaded audio buffer by filename
function getFolderAudioBuffer(fileName) {
    return folderAudioBuffers[fileName] || null;
}

// Convert base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Populate arrangement dropdown with folder audio files
function populateFolderAudioDropdown(audioFiles) {
    try {
        const dropdown = document.getElementById('arr-sample-select');
        if (!dropdown) {
            console.warn('⚠️ Dropdown not found');
            return;
        }
        
        // Clear and add folder files
        dropdown.innerHTML = '<option value="">-- Select Sample --</option>';
        
        audioFiles.forEach(fileName => {
            const option = document.createElement('option');
            option.value = `folder_${fileName}`;
            option.textContent = `📁 ${fileName}`;
            dropdown.appendChild(option);
        });
        
        console.log(`✅ Populated dropdown with ${audioFiles.length} folder audio files`);
    } catch (error) {
        console.error('❌ Error populating dropdown:', error);
    }
}

// Load numbered samples (1-100) from folder for PsychologicalStudio buttons
async function loadNumberedSamplesFromFolder(folderPath) {
    try {
        console.log(`🎵 Loading numbered samples from: ${folderPath}`);
        
        const ctx = initFolderAudioContext();
        if (!ctx) {
            console.error('❌ Audio context not initialized');
            return { success: false, loaded: 0 };
        }
        
        let loadedCount = 0;
        const sampleBuffers = {};
        
        // Try to load samples 1-100
        for (let i = 1; i <= 100; i++) {
            try {
                // Try different extensions
                const extensions = ['.wav', '.mp3', '.ogg', '.m4a', '.flac', '.aac'];
                let loaded = false;
                
                for (const ext of extensions) {
                    if (loaded) break;
                    
                    const fileName = i + ext;
                    const filePath = folderPath + '\\' + fileName;
                    
                    try {
                        const result = await window.electronAPI.loadAudioFile(filePath);
                        
                        if (result.success) {
                            const arrayBuffer = base64ToArrayBuffer(result.data.split(',')[1]);
                            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                            
                            sampleBuffers[i] = audioBuffer;
                            loadedCount++;
                            loaded = true;
                            console.log(`✅ Loaded sample ${i} from ${fileName}`);
                        }
                    } catch (e) {
                        // Try next extension
                    }
                }
            } catch (err) {
                // Skip this sample number
            }
        }
        
        console.log(`✅ Loaded ${loadedCount} numbered samples (1-100)`);
        
        return { success: true, loaded: loadedCount, buffers: sampleBuffers };
    } catch (error) {
        console.error('❌ Error loading numbered samples:', error);
        return { success: false, loaded: 0, error: error.message };
    }
}

console.log('✅ Folder Audio Loader initialized');
