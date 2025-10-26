// when multiple backups exist in the workspace.
window.__ARRANGEMENT_JS_INTEGRATION = window.__ARRANGEMENT_JS_INTEGRATION || {};
window.__ARRANGEMENT_JS_INTEGRATION.version = 'LFO_AUTOMATION_TRANSPLANT_2025-10-16_v1';
window.__ARRANGEMENT_JS_INTEGRATION.loadedAt = new Date().toISOString();

// Accept integration message
window.addEventListener('message', (ev) => {
    try {
        if (!ev.data) return;
        if (typeof ev.data === 'object' && ev.data.type === 'ps-integrated') {
            // Mark integrated so checkPsychStudioAccess() returns true
            window.PS_INTEGRATED = true;
            try { if (ev.data.ps_access === '1') localStorage.setItem('psychologicalStudioArrangementAccess','1'); } catch (e) {}

            // If DOM is already loaded but we didn't initialize because access was blocked, try again
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                try { __arrangementInitWrapper(); } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore malformed messages */ }
});

// ========== LOADING PROGRESS BAR ==========
function showLoadingProgress(title = 'Loading Project...', status = 'Please wait...') {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        document.getElementById('loading-title').textContent = title;
        document.getElementById('loading-status').textContent = status;
        document.getElementById('loading-progress-bar').style.width = '0%';
        document.getElementById('loading-progress-text').textContent = '0%';
        overlay.style.display = 'flex';
    }
}

function updateLoadingProgress(current, total, itemName = '') {
    const percent = Math.round((current / total) * 100);
    const progressBar = document.getElementById('loading-progress-bar');
    const progressText = document.getElementById('loading-progress-text');
    const status = document.getElementById('loading-status');
    
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressText) progressText.textContent = percent + '%';
    if (status && itemName) status.textContent = `Loading ${itemName}... (${current}/${total})`;
}

function hideLoadingProgress() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// State
const arrangementState = {
    tracks: [],
    clips: [],
    patterns: {},
    tempo: 120,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    isPlaying: false,
    currentTime: 0,
    currentBarPosition: 0, // Track position in bars (tempo-independent)
    animationId: null,
    currentBar: 1,
    lastUpdateTime: 0, // For calculating delta time
    placeMode: null, // {type: 'sample'|'pattern', data: sampleNum|patternName}
    selectedClip: null,
    scheduledSources: [], // Audio sources for cleanup
    activeClipNodes: {}, // Store audio nodes for each clip by ID {clipId: {gainNode, filterNode, etc}}
    startTime: 0, // Playback start time
    editMode: 'stretch', // 'stretch' or 'trim'
    resizingClip: null, // {clip, edge: 'left'|'right', originalStart, originalLength, originalTrimStart}
    trimStart: 0, // For trim mode - where the sample starts playing from
    loopEnabled: false, // Whether loop is enabled
    loopStart: null, // Loop start bar (null = no loop)
    loopEnd: null // Loop end bar (null = no loop)
};

// Custom Sample File Paths - Track original upload locations
let customSampleOriginalPaths = {}; // {sampleKey: originalFilePath}

// Piano Roll State
let pianoRollData = {};
let currentSampleForPopup = null;
let isPreviewingPianoRoll = false;
let pianoRollPreviewNodes = {};
let pianoRollLoopInterval = null;
let pianoRollFilterNodes = {};
let pianoRollVisualizer = null;

// ========== PERFORMANCE OPTIMIZATION ==========
// Debounce and throttle helpers for smooth performance
let renderTimelineDebounceTimer = null;
let renderAllClipsDebounceTimer = null;
let zoomDebounceTimeout = null; // Debounce waveform re-render during zoom
let lastRenderTime = 0;
const MIN_RENDER_INTERVAL = 16; // ~60fps max (16ms)

// Canvas-specific throttling (30fps for less critical animations)
let lastCanvasRenderTime = {};
const CANVAS_RENDER_INTERVAL = 33; // ~30fps for canvas animations

function throttleCanvasRender(key, renderFunc) {
    const now = Date.now();
    if (!lastCanvasRenderTime[key]) lastCanvasRenderTime[key] = 0;
    if (now - lastCanvasRenderTime[key] < CANVAS_RENDER_INTERVAL) {
        return; // Skip if too soon
    }
    lastCanvasRenderTime[key] = now;
    renderFunc();
}

function debounceRenderTimeline() {
    if (renderTimelineDebounceTimer) {
        clearTimeout(renderTimelineDebounceTimer);
    }
    renderTimelineDebounceTimer = setTimeout(() => {
        _renderTimelineImmediate();
    }, 10); // 10ms debounce
}

function debounceRenderAllClips() {
    if (renderAllClipsDebounceTimer) {
        clearTimeout(renderAllClipsDebounceTimer);
    }
    renderAllClipsDebounceTimer = setTimeout(() => {
        _renderAllClipsImmediate();
    }, 10); // 10ms debounce
}

function throttledRender(renderFunc) {
    const now = Date.now();
    if (now - lastRenderTime < MIN_RENDER_INTERVAL) {
        return; // Skip if too soon
    }
    lastRenderTime = now;
    renderFunc();
}
let pianoRollVisualizerCtx = null;
let pianoRollVisualizerAnalyzer = null;
let pianoRollVisualizerAnimationId = null;
let pianoRollVisualizerHistory = [];
const pianoRollVisualizerHistorySize = 100;
let pianoRollPreviewActiveVoices = {};
let patternPlaybackActiveLFOs = {}; // Track LFO oscillators during arrangement playback
let pianoRollZoomLevel = 1.0;
let isEditingPattern = false; // Whether we're editing an existing pattern from arrangement
let currentEditingPatternName = null; // Name of pattern being edited
let pianoRollNotes = []; // Notes for the piano roll editor
let pianoRollGridWidth = 16; // Grid width for piano roll

// Note length options
const noteLengths = [
    { value: 0.0625, display: '1/64' },
    { value: 0.125, display: '1/32' },
    { value: 0.25, display: '1/16' },
    { value: 0.5, display: '1/8' },
    { value: 1, display: '1/4' },
    { value: 2, display: '1/2' },
    { value: 4, display: '1' },
    { value: 8, display: '2' },
    { value: 16, display: '4' },
    { value: 32, display: '8' },
    { value: 64, display: '16' }
];

let pianoRollNoteLength = 1; // Default to 1/4 note

// DOM Elements
let timelineCanvas, tracksContainer, playButton, stopButton;
let sampleDropdown, patternDropdown, playheadLine;
let patternEditorPopup; // Piano roll / Pattern editor popup

// Loop selection state
let isSelectingLoop = false; // Whether user is dragging to select loop
let loopSelectionStartBar = null; // Starting bar of selection

// Effects preview playback
let previewSource = null;
let previewGainNode = null;
let previewFilterNode = null;
let previewEqNodes = {};
let previewDelayNode = null;
let previewDelayWetGain = null; // Wet gain for delay effect
let previewFeedbackNode = null;
let previewReverbNode = null;
let previewReverbMixNode = null;
let previewDryNode = null;
let previewLfoNode = null;
let previewLfoGainNode = null;
let previewLfoUpdateTimeout = null;
let previewLoopTimeout = null; // Timeout for looping preview
let previewInterval = null;

// Reverb convolver nodes for preview
let previewReverbConvolver = null;
let previewReverbWetGain = null;
let previewLastReverbDecay = null; // Track last decay to avoid recreating impulse

// LFO and Automation systems for preview
let previewLfoOscillators = []; // Array of 4 LFO oscillators
let previewLfoGains = []; // Array of 4 LFO gain nodes
let previewAutomationIntervals = []; // Array of automation update intervals
let previewLfoPitchIntervals = []; // Array of 4 pitch polling intervals
let previewBasePitchRate = 1; // Base playback rate for pitch LFO
let previewLfoFilterOffsetNodes = []; // Array of 4 filter offset nodes for LFO

// Interactive EQ Canvas
let eqCanvas = null;
let eqCtx = null;
const MAX_EQ_POINTS = 12;
let isDraggingEqBand = false;
let draggedPoint = null;
let isCreatingNewPoint = false;
let waveformAnalyzer = null;
let waveformAnimationId = null;
let waveformHistory = [];
const waveformHistorySize = 100;

// Waveform visualization for effects preview
let effectsWaveformCanvas = null;
let effectsWaveformCtx = null;
let effectsWaveformAnimationId = null;
let effectsPreviewBuffer = null; // Store the buffer for waveform drawing
let cachedWaveformImage = null; // Cache the static waveform rendering to avoid redrawing every frame
let effectsPreviewStartTime = 0; // When preview started for playhead position
let currentPreviewClip = null; // Store the clip being previewed for stretch ratio access

// Audio Context (shared from main app if coming from there)
let audioContext = null;
// NOTE: sampleBuffers, folderAudioBuffers, and other globals are declared in folder-management.js
let folderSamplesLoaded = false; // Flag to track if folder samples are currently being used
let currentSampleFolder = 'mykicks'; // Default sample folder

// Load samples from main app localStorage
function loadSamplesFromStorage() {
    try {
        // Check if there's a saved folder name
        const savedFolder = localStorage.getItem('psychologicalStudioSampleFolder');
        if (savedFolder) {
            currentSampleFolder = savedFolder;

        }
        
        // We don't need to store sample metadata
        // Just directly load from the folder when needed
        return {};
    } catch (e) {
    }
    return {};
}

// Initialize
// Helper: determine whether Arrangement was opened from PsychologicalStudio
// DISABLED - Arrangement is now publicly accessible without restrictions
function checkPsychStudioAccess() {
    // Always allow access - restriction removed
    return true;
}

function showAccessLockedOverlay() {
    // If overlay exists, do nothing
    if (document.getElementById('ps-arrangement-locked-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ps-arrangement-locked-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.color = '#fff';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';

    overlay.innerHTML = `
        <div style="max-width:720px;text-align:center;">
            <h2 style="margin-bottom:8px;">Arrangement Locked</h2>
            <p style="margin-bottom:16px;color:#ddd;">This Arrangement view may only be opened from PsychologicalStudio. Please use the "Arrangement" button inside PsychologicalStudio to access it.</p>
            <div style="display:flex;gap:8px;justify-content:center;">
                <a id="ps-open-studio" href="./PsychologicalStudio.html" style="background:#3F51B5;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;">Open PsychologicalStudio</a>
                <button id="ps-refresh-btn" style="background:#555;color:#fff;padding:10px 14px;border-radius:6px;border:none;cursor:pointer;">Retry</button>
            </div>
            <p style="margin-top:24px;color:#999;font-size:12px;">If you are the developer and want to open Arrangement directly for testing, set <code>localStorage.setItem('psychologicalStudioArrangementAccess','1')</code> in the console before reloading.</p>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ps-refresh-btn').addEventListener('click', () => {
        // Small retry: if access was granted by the opener, reload to re-check
        location.reload();
    });
}

// Wrapper to require access before running init
function requirePsychStudioAccessAndInit(initFn) {
    // RESTRICTION REMOVED - Allow direct access to arrangement.html
    // The view is now publicly accessible
    try {
        // Clear one-time localStorage token to prevent direct reuse (optional)
        // Only remove if it actually exists to avoid clearing unrelated keys
        if (localStorage.getItem('psychologicalStudioArrangementAccess') === '1') {
            localStorage.removeItem('psychologicalStudioArrangementAccess');
        }
    } catch (e) {}
    initFn();
}

// Wrap initialization so it can be triggered on DOMContentLoaded or immediately if the script is loaded after DOM ready
function __arrangementInitWrapper() {
    // Gate the full initialization behind PsychologicalStudio access (or integrated flag)
    requirePsychStudioAccessAndInit(() => {

    // Get DOM references
    timelineCanvas = document.getElementById('arrangement-timeline');
    tracksContainer = document.getElementById('arrangement-tracks');
    playButton = document.getElementById('arr-play');
    stopButton = document.getElementById('arr-stop');
    sampleDropdown = document.getElementById('arr-sample-select');
    patternDropdown = document.getElementById('arr-pattern-select');
    playheadLine = document.getElementById('playhead-line');
    patternEditorPopup = document.getElementById('pattern-popup');
    // Disable user selection across the whole page to prevent accidental text selection while dragging
    // Allow text selection in inputs/textareas/selects/contenteditable
    try {
        const style = document.createElement('style');
        style.id = 'disable-user-select-style';
        style.innerHTML = `
            * { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none !important; }
            input, textarea, select, [contenteditable="true"] { -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; user-select: text !important; }
        `;
        document.head.appendChild(style);
    } catch (e) {
    }

        // Setup event listeners
        setupEventListeners();

        // Initialize context menu and effects popup
        initContextMenu();

    // DON'T load saved data - always start fresh (but keep security login)
    // loadArrangementData();
    if (arrangementState.tracks.length === 0) {
        // Create 10 empty tracks on first load
        for (let i = 1; i <= 10; i++) {
            addTrack(`Track ${i}`);
        }
    }

    // Load samples from localStorage if available
    loadSamplesFromMainApp();

    // Initial render
    updateTrackBackgrounds();
    renderTimeline();

    // Update BPM display
    const bpmSlider = document.getElementById('arr-bpm-slider');
    const bpmValue = document.getElementById('arr-tempo-value');
    if (bpmSlider && bpmValue) {
        bpmSlider.value = arrangementState.tempo;
        bpmValue.textContent = arrangementState.tempo;
    }

    });
}

document.addEventListener('DOMContentLoaded', __arrangementInitWrapper);
// If the document is already ready (script injected after DOMContentLoaded), run immediately
if (document.readyState !== 'loading') {
    try { __arrangementInitWrapper(); } catch (e) { }
}

// Debug helper: prints and optionally displays a small overlay with runtime state
function showArrangementRuntimeDebug(showOverlay = false) {
    try {



        if (Array.isArray(arrangementState.clipPlaybackData)) {
            arrangementState.clipPlaybackData.forEach((cp, idx) => {
                try {







                } catch (e) { }
            });
        }


        if (showOverlay) {
            let ov = document.getElementById('arr-runtime-debug-overlay');
            if (!ov) {
                ov = document.createElement('div');
                ov.id = 'arr-runtime-debug-overlay';
                ov.style.position = 'fixed';
                ov.style.right = '10px';
                ov.style.bottom = '10px';
                ov.style.background = 'rgba(0,0,0,0.75)';
                ov.style.color = '#fff';
                ov.style.padding = '8px 10px';
                ov.style.borderRadius = '6px';
                ov.style.fontSize = '12px';
                ov.style.zIndex = 999999;
                document.body.appendChild(ov);
            }

            const lines = [];
            lines.push(`Tempo: ${arrangementState.tempo}`);
            lines.push(`Playing: ${arrangementState.isPlaying}`);
            lines.push(`Active nodes: ${Object.keys(arrangementState.activeClipNodes || {}).length}`);
            lines.push(`clipPlaybackData: ${(arrangementState.clipPlaybackData && arrangementState.clipPlaybackData.length) || 0}`);
            if (Array.isArray(arrangementState.clipPlaybackData)) {
                arrangementState.clipPlaybackData.forEach((cp, i) => {
                    const lfoCount = cp.lfoNodes ? cp.lfoNodes.filter(n => !!n).length : 0;
                    const activeTargets = cp.lfoTargets ? cp.lfoTargets.join(',') : '';
                    lines.push(`#${i}: src=${!!cp.source}, lfos=${lfoCount}, targets=${activeTargets}`);
                });
            }

            ov.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
        }
    } catch (e) {
    }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    // Scroll sync flags to prevent infinite loops
    let syncingScroll = false;
    let isDraggingTimeline = false;
    
    // Back button
    document.getElementById('arr-back').addEventListener('click', () => {
        // Electron: Use IPC to navigate back to studio
        if (window.electronAPI && window.electronAPI.closeArrangement) {
            window.electronAPI.closeArrangement();
            return;
        }
        
        // Fallback for iframe integration
        try {
            if (window !== window.parent) {
                window.parent.postMessage('ps-arrangement-close', '*');
                return;
            }
        } catch (e) {}
        
        // Last resort: navigate back
        window.location.href = './PsychologicalStudio.html';
    });
    
    // Play/Stop
    playButton.addEventListener('click', playArrangement);
    stopButton.addEventListener('click', stopArrangement);
    
    // BPM Slider with real-time tempo changes
    const bpmSlider = document.getElementById('arr-bpm-slider');
    const bpmValue = document.getElementById('arr-tempo-value');
    if (bpmSlider) {
        let bpmChangeTimeout = null;
        
        bpmSlider.addEventListener('input', (e) => {
            const newBpm = parseInt(e.target.value);
            const oldBpm = arrangementState.tempo;
            const wasPlaying = arrangementState.isPlaying;
            const currentBarPos = arrangementState.currentBarPosition; // Save bar position, NOT time
            
            // Update tempo immediately for visual feedback
            arrangementState.tempo = newBpm;
            bpmValue.textContent = newBpm;
            
            // If playing, we need to restart with new tempo while maintaining bar position
            if (wasPlaying) {
                // Clear any pending restart
                if (bpmChangeTimeout) {
                    clearTimeout(bpmChangeTimeout);
                }
                
                // Debounce the restart to avoid excessive restarts while dragging slider
                bpmChangeTimeout = setTimeout(() => {
                    // Stop current playback
                    stopArrangement();
                    
                    // Restore bar position (this is key - maintain musical position, not time position)
                    arrangementState.currentBarPosition = currentBarPos;
                    
                    // Calculate new time position based on bar position and new tempo
                    const beatDuration = 60 / newBpm;
                    const barDuration = beatDuration * 4;
                    arrangementState.currentTime = currentBarPos * barDuration;
                    
                    // Restart playback
                    playArrangement();
                    
                }, 50); // 50ms debounce
            } else {

            }
        });
    }
    
    // Make BPM value clickable for direct input
    if (bpmValue) {
        bpmValue.style.cursor = 'pointer';
        bpmValue.title = 'Click to type BPM (40-1000)';
        
        bpmValue.addEventListener('click', () => {
            const currentBpm = arrangementState.tempo;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '40';
            input.max = '1000';
            input.step = '1';
            input.value = currentBpm;
            input.style.width = '50px';
            input.style.textAlign = 'right';
            input.style.fontWeight = 'bold';
            input.style.fontSize = '14px';
            input.style.padding = '2px 4px';
            input.style.border = '2px solid #4CAF50';
            input.style.borderRadius = '4px';
            input.style.background = '#222';
            input.style.color = '#fff';
            
            // Replace the span with input
            const parent = bpmValue.parentNode;
            parent.replaceChild(input, bpmValue);
            input.focus();
            input.select();
            
            const applyBpmChange = () => {
                let newBpm = parseInt(input.value);
                
                // Validate and clamp
                if (isNaN(newBpm) || newBpm < 40) {
                    newBpm = 40;
                } else if (newBpm > 1000) {
                    newBpm = 1000;
                }
                
                const oldBpm = arrangementState.tempo;
                const wasPlaying = arrangementState.isPlaying;
                const currentBarPos = arrangementState.currentBarPosition;
                
                // Update tempo
                arrangementState.tempo = newBpm;
                
                // Restore the span
                parent.replaceChild(bpmValue, input);
                bpmValue.textContent = newBpm;
                
                // Update slider
                if (bpmSlider) {
                    bpmSlider.value = newBpm;
                }
                
                // If playing, restart with new tempo
                if (wasPlaying) {
                    stopArrangement();
                    arrangementState.currentBarPosition = currentBarPos;
                    const beatDuration = 60 / newBpm;
                    const barDuration = beatDuration * 4;
                    arrangementState.currentTime = currentBarPos * barDuration;
                    playArrangement();
                } else {
                    renderTimeline();
                }
            };
            
            // Apply on Enter or blur
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    applyBpmChange();
                } else if (e.key === 'Escape') {
                    // Cancel - restore original
                    parent.replaceChild(bpmValue, input);
                }
            });
            
            input.addEventListener('blur', applyBpmChange);
        });
    }
    
    // Add track
    document.getElementById('arr-add-track').addEventListener('click', () => {
        addTrack(`Track ${arrangementState.tracks.length + 1}`);
    });
    
    // Sample dropdown
    sampleDropdown.addEventListener('change', function() {
        if (this.value) {
            // Keep string values for custom/recording samples, parse numbers for regular samples
            const sampleData = isNaN(parseInt(this.value)) ? this.value : parseInt(this.value);
            arrangementState.placeMode = {type: 'sample', data: sampleData};
            patternDropdown.value = ''; // Clear other dropdown

        } else {
            // Deselected - cancel place mode
            arrangementState.placeMode = null;

        }
    });
    
    // Pattern dropdown
    patternDropdown.addEventListener('change', function() {
        if (this.value) {
            arrangementState.placeMode = {type: 'pattern', data: this.value};
            sampleDropdown.value = ''; // Clear other dropdown

        } else {
            // Deselected - cancel place mode
            arrangementState.placeMode = null;

        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Quit app: Ctrl+Q
        if (e.key === 'q' && e.ctrlKey) {
            e.preventDefault();
            if (window.electronAPI && window.electronAPI.quitApp) {
                window.electronAPI.quitApp();
            }
            return;
        }
        
        // Undo: Ctrl+Z
        if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            if (window.undoManager) {
                window.undoManager.undo();
            }
            return;
        }
        
        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.key === 'y' && e.ctrlKey) || (e.key === 'z' && e.ctrlKey && e.shiftKey)) {
            e.preventDefault();
            if (window.undoManager) {
                window.undoManager.redo();
            }
            return;
        }
        
        // Escape to cancel place mode
        if (e.key === 'Escape' && arrangementState.placeMode) {
            arrangementState.placeMode = null;
            sampleDropdown.value = '';
            patternDropdown.value = '';
        }
        
        // Ctrl+D to duplicate selected clip
        if (e.key === 'd' && e.ctrlKey && arrangementState.selectedClip) {
            e.preventDefault();
            const orig = arrangementState.selectedClip;
            
            // Find the original clip in the clips array to ensure we have current data
            const sourceClip = arrangementState.clips.find(c => c.id === orig.id);
            if (!sourceClip) {

                return;
            }
            
            // Create a new clip to the right of the selected one
            const newClip = JSON.parse(JSON.stringify(sourceClip));
            newClip.id = 'clip_' + Date.now() + '_' + Math.floor(Math.random()*10000);
            newClip.startBar = sourceClip.startBar + sourceClip.length; // Place side by side
            
            arrangementState.clips.push(newClip);
            renderAllClips();
            saveArrangement(false);
            
            // Select the new clip
            arrangementState.selectedClip = JSON.parse(JSON.stringify(newClip));
            
            // Visual feedback
            setTimeout(() => {
                const newClipEl = document.querySelector(`[data-clip-id="${newClip.id}"]`);
                if (newClipEl) {
                    newClipEl.style.outline = '3px solid #00FF00';
                    setTimeout(() => {
                        newClipEl.style.outline = 'none';
                    }, 500);
                }
            }, 50);
            
        }
        
        // Shift+Arrow Keys to move selected clip on grid (sub-beat precision)
        if (e.shiftKey && arrangementState.selectedClip && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            
            // Find the actual clip in the array
            const clip = arrangementState.clips.find(c => c.id === arrangementState.selectedClip.id);
            if (!clip) return;
            
            // Store original position for undo
            const originalStartBar = clip.startBar;
            const originalTrackIndex = clip.trackIndex;
            
            // Sub-beat movement (1/16th note = 0.25 beats = 0.0625 bars since 4 beats = 1 bar)
            const subBeatStep = 0.0625; // 1/16th note
            
            let newStartBar = clip.startBar;
            let newTrackIndex = clip.trackIndex;
            let moved = false;
            
            if (e.key === 'ArrowLeft') {
                newStartBar = Math.max(0, clip.startBar - subBeatStep);
                moved = true;
            } else if (e.key === 'ArrowRight') {
                newStartBar = clip.startBar + subBeatStep;
                moved = true;
            } else if (e.key === 'ArrowUp') {
                newTrackIndex = Math.max(0, clip.trackIndex - 1);
                moved = true;
            } else if (e.key === 'ArrowDown') {
                const maxTrack = arrangementState.tracks.length - 1;
                newTrackIndex = Math.min(maxTrack, clip.trackIndex + 1);
                moved = true;
            }
            
            if (moved && (newStartBar !== originalStartBar || newTrackIndex !== originalTrackIndex)) {
                // Update clip position
                clip.startBar = newStartBar;
                clip.trackIndex = newTrackIndex;
                
                // Update selected clip reference
                arrangementState.selectedClip = JSON.parse(JSON.stringify(clip));
                
                // Re-render and save
                renderAllClips();
                saveArrangement(false);
                
                // Visual feedback
                const clipEl = document.querySelector(`[data-clip-id="${clip.id}"]`);
                if (clipEl) {
                    clipEl.style.outline = '2px solid #FFD700';
                    setTimeout(() => {
                        clipEl.style.outline = 'none';
                    }, 150);
                }
                
                // If playing, reschedule clips
                if (arrangementState.isPlaying && audioContext) {
                    if (arrangementState.scheduledSources) {
                        arrangementState.scheduledSources.forEach(src => { try { src.stop(); } catch (e) {} });
                        arrangementState.scheduledSources = [];
                    }
                    if (arrangementState.clipPlaybackData) {
                        arrangementState.clipPlaybackData.forEach(cd => { 
                            if (cd.lfoIntervals) cd.lfoIntervals.forEach(id => clearInterval(id)); 
                            if (cd.automationIntervals) cd.automationIntervals.forEach(id => clearInterval(id)); 
                        });
                        arrangementState.clipPlaybackData = [];
                    }
                    const elapsed = audioContext.currentTime - arrangementState.startTime;
                    arrangementState.currentTime = Math.max(0, elapsed);
                    scheduleClips();
                }
            }
        }
    });
    
    // New pattern
    document.getElementById('arr-new-pattern').addEventListener('click', createNewPattern);
    
    // New sample - upload or record
    document.getElementById('arr-new-sample').addEventListener('click', handleNewSample);
    document.getElementById('arr-sample-file-input').addEventListener('change', handleSampleFileUpload);
    
    // Select custom folder
    document.getElementById('arr-select-folder').addEventListener('click', async () => {
        // Try to use Electron API if available (for desktop app)
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
            try {

                const folderPath = await window.electronAPI.selectFolder();
                
                if (folderPath) {
                    // Get folder name
                    const folderName = folderPath.split(/[\\/]/).pop();
                    
                    // Store folder preference
                    localStorage.setItem('psychologicalStudioSampleFolder', folderPath);
                    currentSampleFolder = folderName;
                    
                    // Update display
                    document.getElementById('arr-current-folder').textContent = folderName;


                    // Load list of audio files from the selected folder using Electron API

                    const folderResult = await window.electronAPI.loadFolderAudioFiles(folderPath);

                    // Extract audioFiles array from response
                    const audioFiles = (folderResult && folderResult.files) ? folderResult.files : [];


                    
                    if (audioFiles && audioFiles.length > 0) {

                        // Set flag that folder samples are loaded
                        folderSamplesLoaded = true;
                        
                        // CRITICAL: Store folder path and files for persistence!
                        currentFolderPath = folderPath;
                        currentFolderFiles = audioFiles;

                        // Save folder state for persistence
                        saveFolderState(folderPath, audioFiles);
                        
                        // Load all audio files from folder into folderAudioBuffers

                        const result = await loadAllAudioFilesFromFolder(folderPath, audioFiles, folderAudioBuffers);

                        if (result.success && result.loadedCount > 0) {

                            // Also populate the dropdown
                            updateSampleDropdown();
                            
                            // Show beautiful popup with results
                            showFolderLoadedPopup(folderName, result.loadedCount);
                        } else {
                            showFolderLoadedPopup(folderName, 0);
                        }
                    } else {
                        showFolderLoadedPopup(folderName, 0);
                    }
                }
            } catch (error) {
                // Fall back to web API
                useFallbackFolderSelection();
            }
        } else {
            // Fallback for web version or if Electron API not available
            useFallbackFolderSelection();
        }
    });
    
    // Edit mode (Trim/Stretch)
    document.getElementById('edit-mode-stretch').addEventListener('change', (e) => {
        if (e.target.checked) {
            arrangementState.editMode = 'stretch';

        }
    });
    document.getElementById('edit-mode-trim').addEventListener('change', (e) => {
        if (e.target.checked) {
            arrangementState.editMode = 'trim';

        }
    });
    
    // Save/Load/Clear - handled by File Menu dropdown now
    document.getElementById('arr-clear').addEventListener('click', clearArrangement);
    
    // NEW: File Menu
    const fileMenuBtn = document.getElementById('arr-file-menu-btn');
    const fileMenu = document.getElementById('arr-file-menu');
    
    // Toggle menu visibility
    fileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileMenu.style.display = fileMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (e.target !== fileMenuBtn && !fileMenuBtn.contains(e.target)) {
            fileMenu.style.display = 'none';
        }
    });
    
    // File menu items
    document.getElementById('arr-menu-save').addEventListener('click', () => {
        // Close menu
        fileMenu.style.display = 'none';
        
        // Stop playback
        if (arrangementState.isPlaying) {
            stopArrangement();
        }
        
        // CRITICAL FIX: Don't auto-close - Windows Electron has a bug where modal dialogs freeze the renderer
        // Just save and let the user close manually
        saveArrangement(true).catch(err => {
            console.error('❌ Save failed:', err);
        });
    });
    
    document.getElementById('arr-menu-load').addEventListener('click', () => {
        // Stop playback BEFORE loading to prevent freeze
        if (arrangementState.isPlaying) {
            stopArrangement();
        }
        loadArrangement();
        fileMenu.style.display = 'none';
    });
    
    document.getElementById('arr-menu-export').addEventListener('click', () => {
        exportArrangementToFile('mp3');
        fileMenu.style.display = 'none';
    });
    
    document.getElementById('arr-menu-export-wav').addEventListener('click', () => {
        exportArrangementToFile('wav');
        fileMenu.style.display = 'none';
    });
    
    document.getElementById('arr-menu-exit').addEventListener('click', () => {
        // Quit the entire app, killing all processes
        if (window.electronAPI && window.electronAPI.quitApp) {
            window.electronAPI.quitApp();
        } else {
            window.close();
        }
        fileMenu.style.display = 'none';
    });
    
    // Zoom on scroll (desktop)
    timelineCanvas.addEventListener('wheel', handleTimelineZoom, { passive: false });
    
    // Drag to seek (desktop)
    // Prevent context menu on timeline (we'll use right-click for loop selection)
    timelineCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    // Timeline click to seek (left-click only)
    timelineCanvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            // Left click - seek
            isDraggingTimeline = true;
            handleTimelineSeek(e);
        } else if (e.button === 2) {
            // Right click - start loop selection
            isSelectingLoop = true;
            const bar = getBeatFromMouseX(e.clientX);
            loopSelectionStartBar = bar;
            arrangementState.loopStart = bar;
            arrangementState.loopEnd = bar;
            arrangementState.loopEnabled = true;
            renderTimeline();

        }
    });
    window.addEventListener('mousemove', (e) => {
        if (isDraggingTimeline) {
            handleTimelineSeek(e);
            // Auto-scroll when dragging the playhead near edges
            autoScrollDuringDrag(e.clientX);
        } else if (isSelectingLoop) {
            // Update loop end as mouse moves
            const bar = getBeatFromMouseX(e.clientX);
            
            // Set loop start/end based on drag direction
            if (bar >= loopSelectionStartBar) {
                arrangementState.loopStart = loopSelectionStartBar;
                arrangementState.loopEnd = bar;
            } else {
                arrangementState.loopStart = bar;
                arrangementState.loopEnd = loopSelectionStartBar;
            }
            renderTimeline();
        }
    });
    window.addEventListener('mouseup', (e) => {
        if (isSelectingLoop) {
            // Finalize loop selection
            isSelectingLoop = false;
            loopSelectionStartBar = null;
            
            // If loop is just one bar, disable it
            if (arrangementState.loopStart === arrangementState.loopEnd) {
                arrangementState.loopEnabled = false;
                arrangementState.loopStart = null;
                arrangementState.loopEnd = null;
            } else {

            }
            renderTimeline();
        }
        isDraggingTimeline = false;
    });
    
    // Touch interactions (mobile)
    let touchStartDist = 0;
    let initialZoom = 1;
    let isTouchSeeking = false;
    
    timelineCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Two fingers - pinch to zoom
            touchStartDist = getTouchDistance(e.touches);
            initialZoom = arrangementState.zoom;
            e.preventDefault();
        } else if (e.touches.length === 1) {
            // One finger - seek
            isTouchSeeking = true;
            handleTimelineSeek(e.touches[0]);
        }
    }, { passive: false });
    
    timelineCanvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            const currentDist = getTouchDistance(e.touches);
            const scale = currentDist / touchStartDist;
            const newZoom = Math.max(0.25, Math.min(4, initialZoom * scale));
            arrangementState.zoom = newZoom;
            updateZoomDisplay();
            updateTrackBackgrounds();
            renderTimeline();
            renderAllClips();
            e.preventDefault();
        } else if (e.touches.length === 1 && isTouchSeeking) {
            // Touch slide to seek
            handleTimelineSeek(e.touches[0]);
            autoScrollDuringDrag(e.touches[0].clientX);
            e.preventDefault();
        }
    }, { passive: false });
    
    timelineCanvas.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            touchStartDist = 0;
        }
        if (e.touches.length === 0) {
            isTouchSeeking = false;
        }
    });
    
    // Track click (for placing clips or clones)
    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    
    // Track mousedown and mouseup positions to detect actual clicks (not drag releases)
    let mouseDownPos = null;
    tracksScroll.addEventListener('mousedown', function(e) {
        mouseDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    });
    
    tracksScroll.addEventListener('click', function(e) {
        // Prevent placing clips right after dragging or resizing
        if (arrangementState._justFinishedDragging) return;
        if (arrangementState.justFinishedResize) return;
        
        // Check if this was an actual click (mousedown and mouseup in same spot)
        // If mouse moved more than 5 pixels, it's not a click
        if (mouseDownPos) {
            const dx = Math.abs(e.clientX - mouseDownPos.x);
            const dy = Math.abs(e.clientY - mouseDownPos.y);
            if (dx > 5 || dy > 5) {
                mouseDownPos = null;
                return; // Mouse moved, not a click
            }
        }
        mouseDownPos = null;
        
        // Check if the click was on an existing clip - if so, don't place a new one
        let clickedElement = e.target;
        while (clickedElement && clickedElement !== tracksScroll) {
            if (clickedElement.classList.contains('clip')) {
                // Clicked on an existing clip, don't place anything
                return;
            }
            clickedElement = clickedElement.parentElement;
        }
        
        // If in clone place mode and a clip is selected
        if (arrangementState.placeMode && arrangementState.placeMode.type === 'clone' && arrangementState.selectedClip) {
            // Get bar position from mouse
            const rect = tracksScroll.getBoundingClientRect();
            const mouseX = e.clientX - rect.left + tracksScroll.scrollLeft;
            const barWidth = 100 * arrangementState.zoom;
            let bar = Math.max(0, mouseX / barWidth);
            
            // Snap to nearest bar line
            bar = Math.round(bar);

            // Get track index from target
            let trackIndex = 0;
            let el = e.target;
            while (el && !el.classList.contains('track-lane')) {
                el = el.parentElement;
            }
            if (el && el.dataset.trackIndex) {
                trackIndex = parseInt(el.dataset.trackIndex);
            }

            // Clone the selected clip
            const orig = arrangementState.selectedClip;
            const newClip = JSON.parse(JSON.stringify(orig));
            newClip.id = 'clip_' + Date.now() + '_' + Math.floor(Math.random()*10000);
            newClip.startBar = bar;
            newClip.trackIndex = trackIndex;

            // Wrap with undo/redo
            const clipToAdd = newClip;
            window.undoManager.execute(
                new Command(
                    'Add Clip',
                    () => {
                        arrangementState.clips.push(clipToAdd);
                        renderAllClips();
                        saveArrangement(false);
                    },
                    () => {
                        arrangementState.clips = arrangementState.clips.filter(c => c.id !== clipToAdd.id);
                        renderAllClips();
                        saveArrangement(false);
                    }
                )
            );

            // If playing and new clip is ahead of playhead, schedule it for the correct future time
            if (arrangementState.isPlaying) {
                const currentBarPos = arrangementState.currentBarPosition || 0;
                if (newClip.startBar >= currentBarPos) {
                    // Calculate time offset until playhead reaches the clip
                    const barsUntilClip = newClip.startBar - currentBarPos;
                    const beatDuration = 60 / arrangementState.tempo;
                    const barDuration = beatDuration * 4;
                    const offsetSeconds = barsUntilClip * barDuration;
                    const scheduleTime = audioContext.currentTime + offsetSeconds;
                    if (newClip.type === 'sample') {
                        scheduleSampleClip(newClip, scheduleTime, 0);
                    } else if (newClip.type === 'pattern') {
                        schedulePatternClip(newClip, scheduleTime, 0);
                    }
                }
            }

            // Optionally, stay in clone mode or exit (here: stay)
            return;
        }
        // Otherwise, default handler
        handleTrackClick(e);
    });
    
    // Zoom on tracks area (desktop)
    tracksScroll.addEventListener('wheel', (e) => {
        // Horizontal scroll or small vertical scroll = zoom
        // Large vertical scroll = scroll between tracks
        const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const isSmallVerticalScroll = Math.abs(e.deltaY) < 40;
        
        if (isHorizontalScroll || isSmallVerticalScroll || e.ctrlKey || e.metaKey) {
            // Zoom
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            
            // Calculate fit-all zoom
            let fitAllZoom = 0.05; // Lower minimum
            let maxBar = 1;
            if (arrangementState.clips.length > 0) {
                arrangementState.clips.forEach(clip => {
                    const clipEnd = (clip.startBar || 0) + (clip.lengthBars || clip.length || 1);
                    if (clipEnd > maxBar) maxBar = clipEnd;
                });
                const viewportWidth = tracksScroll.clientWidth;
                const requiredWidth = maxBar * 100;
                fitAllZoom = Math.max(0.05, (viewportWidth / requiredWidth) * 0.95);
            }
            
            let newZoom = arrangementState.zoom * delta;
            
            // Snap to fit-all when approaching minimum
            if (delta < 1 && newZoom <= fitAllZoom * 1.05) {
                newZoom = fitAllZoom;
            }
            
            newZoom = Math.max(fitAllZoom, Math.min(8, newZoom)); // Increased max to 8x
            
            // Calculate mouse position relative to tracks BEFORE zoom
            const rect = tracksScroll.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const oldScrollLeft = tracksScroll.scrollLeft;
            const oldBarWidth = 100 * arrangementState.zoom;
            
            // Calculate which bar is under the mouse cursor
            const barUnderMouse = (oldScrollLeft + mouseX) / oldBarWidth;
            
            // Apply zoom FIRST
            arrangementState.zoom = newZoom;
            updateZoomDisplay();
            
            // Calculate new scroll position
            const newBarWidth = 100 * newZoom;
            const newScrollLeft = (barUnderMouse * newBarWidth) - mouseX;
            
            // Update scroll position IMMEDIATELY
            if (Math.abs(newZoom - fitAllZoom) < 0.01) {
                tracksScroll.scrollLeft = 0;
            } else {
                tracksScroll.scrollLeft = Math.max(0, newScrollLeft);
            }
            
            // Sync timeline scroll IMMEDIATELY
            if (timelineWrapper) {
                timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
            }
            
            // Fast visual updates during zoom
            updateTrackBackgrounds();
            _renderTimelineImmediate();
            
            // Only update clip positions/sizes, not waveforms (fast)
            updateClipPositionsOnly();
            
            // Debounce full clip re-render (with waveforms) after zoom finishes
            if (zoomDebounceTimeout) clearTimeout(zoomDebounceTimeout);
            zoomDebounceTimeout = setTimeout(() => {
                renderAllClips();
                zoomDebounceTimeout = null;
            }, 150);
            
            // Re-sync scroll after rendering to ensure precision
            tracksScroll.scrollLeft = Math.max(0, newScrollLeft);
            if (timelineWrapper) {
                timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
            }
            
            // But restore scroll immediately for timeline
            tracksScroll.scrollLeft = targetScrollLeft;
            if (timelineWrapper) {
                timelineWrapper.scrollLeft = targetScrollLeft;
            }
        }
        // Otherwise allow vertical scrolling for tracks
    }, { passive: false });
    
    // Scroll sync between timeline and tracks
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    
    tracksScroll.addEventListener('scroll', () => {
        if (syncingScroll) return;
        syncingScroll = true;
        
        arrangementState.scrollX = tracksScroll.scrollLeft;
        arrangementState.scrollY = tracksScroll.scrollTop;
        timelineWrapper.scrollLeft = tracksScroll.scrollLeft; // Sync timeline horizontal scroll
        
        // Sync track headers vertical scroll
        const trackHeaders = document.getElementById('track-headers');
        trackHeaders.scrollTop = tracksScroll.scrollTop;
        
        // DON'T call renderTimeline() here - it's too heavy and causes audio glitches!
        // Timeline is already visible and updates via debounce on other events
        
        syncingScroll = false;
    });
    
    timelineWrapper.addEventListener('scroll', () => {
        if (syncingScroll) return;
        syncingScroll = true;
        
        tracksScroll.scrollLeft = timelineWrapper.scrollLeft; // Sync tracks horizontal scroll
        
        syncingScroll = false;
    });
    
    // Sync vertical scroll from track headers back to tracks
    const trackHeaders = document.getElementById('track-headers');
    trackHeaders.addEventListener('scroll', () => {
        if (syncingScroll) return;
        syncingScroll = true;
        
        tracksScroll.scrollTop = trackHeaders.scrollTop;
        
        syncingScroll = false;
    });
}

// ========== TRACK MANAGEMENT ==========

// Helper function to update playhead height based on number of tracks
function updatePlayheadHeight() {
    if (playheadLine) {
        const totalTracksHeight = arrangementState.tracks.length * 60;
        playheadLine.style.height = totalTracksHeight + 'px';
    }
}

function addTrack(name) {

    const trackIndex = arrangementState.tracks.length;
    arrangementState.tracks.push({
        name: name,
        muted: false,
        solo: false
    });
    
    // Add track header
    const trackHeaders = document.getElementById('track-headers');
    const header = document.createElement('div');
    header.className = 'track-header';
    header.dataset.trackIndex = trackIndex;
    header.innerHTML = `
        <div class="track-name">${name}</div>
        <div class="track-controls">
            <button class="track-btn track-mute-btn" title="Mute">M</button>
            <button class="track-btn track-solo-btn" title="Solo">S</button>
            <button class="track-btn track-delete-btn" title="Delete">X</button>
        </div>
    `;
    trackHeaders.appendChild(header);
    
    // Apply theme to track buttons immediately using computed styles
    const trackBtns = header.querySelectorAll('.track-btn');
    const computedAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    const computedText = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
    const computedBorder = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
    
    trackBtns.forEach(btn => {
        if (computedAccent) btn.style.backgroundColor = computedAccent;
        if (computedText) btn.style.color = computedText;
        if (computedBorder) btn.style.borderColor = computedBorder;
    });
    
    // Add track lane
    const lane = document.createElement('div');
    lane.className = 'track-lane';
    lane.dataset.trackIndex = trackIndex;
    
    // Add canvas for grid background
    const canvas = document.createElement('canvas');
    canvas.className = 'track-lane-canvas';
    canvas.width = 5000;
    canvas.height = 58; // Leave room for 2px border
    lane.appendChild(canvas);
    
    tracksContainer.appendChild(lane);
    
    // Event listeners
    const muteBtn = header.querySelector('.track-mute-btn');
    const soloBtn = header.querySelector('.track-solo-btn');
    const deleteBtn = header.querySelector('.track-delete-btn');
    
    muteBtn.addEventListener('click', () => toggleMute(trackIndex));
    soloBtn.addEventListener('click', () => toggleSolo(trackIndex));
    deleteBtn.addEventListener('click', () => deleteTrack(trackIndex));
    
    // Update button states
    updateTrackButtonStates();
    
    // Render grid on canvas
    renderTrackGrid(canvas);
    renderTimeline();
    saveArrangement(false);
    
    // Update playhead height to cover new track
    updatePlayheadHeight();

}

function deleteTrack(index) {
    if (arrangementState.tracks.length <= 1) {
        alert('Cannot delete the last track!');
        return;
    }
    
    if (!confirm(`Delete ${arrangementState.tracks[index].name}?`)) return;
    
    // Remove clips on this track
    arrangementState.clips = arrangementState.clips.filter(clip => clip.trackIndex !== index);
    
    // Remove track
    arrangementState.tracks.splice(index, 1);
    
    // Rebuild UI
    rebuildTrackList();
    renderAllClips();
    saveArrangement(false);
    
    // Update playhead height after track removal
    updatePlayheadHeight();
}

// Toggle mute on a track
function toggleMute(trackIndex) {
    const track = arrangementState.tracks[trackIndex];
    track.muted = !track.muted;
    
    // If track is being unmuted and any solos are active, it stays silent (unless it's also soloed)
    updateTrackButtonStates();
    updateActiveTrackAudio();
    saveArrangement(false);
    
}

// Toggle solo on a track
function toggleSolo(trackIndex) {
    const track = arrangementState.tracks[trackIndex];
    track.solo = !track.solo;
    
    // Professional DAW behavior:
    // - When ANY track is soloed, ONLY soloed tracks play
    // - Mute is ignored when solo is active on ANY track
    // - Multiple tracks can be soloed simultaneously
    
    updateTrackButtonStates();
    updateActiveTrackAudio();
    saveArrangement(false);
    
}

// Update visual state of mute/solo buttons and apply audio changes
function updateTrackButtonStates() {
    const trackHeaders = document.querySelectorAll('.track-header');
    const anySolo = arrangementState.tracks.some(t => t.solo);
    
    trackHeaders.forEach((header, index) => {
        const track = arrangementState.tracks[index];
        if (!track) return;
        
        const muteBtn = header.querySelector('.track-mute-btn');
        const soloBtn = header.querySelector('.track-solo-btn');
        
        // Update mute button
        if (track.muted) {
            muteBtn.style.backgroundColor = '#f44336'; // Red when muted
            muteBtn.style.opacity = '1';
        } else {
            muteBtn.style.backgroundColor = '';
            muteBtn.style.opacity = '0.7';
        }
        
        // Update solo button
        if (track.solo) {
            soloBtn.style.backgroundColor = '#FFD700'; // Gold when soloed
            soloBtn.style.color = '#000';
            soloBtn.style.opacity = '1';
        } else {
            soloBtn.style.backgroundColor = '';
            soloBtn.style.color = '';
            soloBtn.style.opacity = '0.7';
        }
        
        // Dim the entire track header if it won't be heard
        const trackWillPlay = isTrackAudible(index);
        header.style.opacity = trackWillPlay ? '1' : '0.5';
    });
}

// Determine if a track will be audible based on mute/solo state
function isTrackAudible(trackIndex) {
    const track = arrangementState.tracks[trackIndex];
    const anySolo = arrangementState.tracks.some(t => t.solo);
    
    // Professional DAW logic:
    // 1. If ANY track is soloed, ONLY soloed tracks play (mute is ignored)
    // 2. If NO tracks are soloed, muted tracks don't play
    
    if (anySolo) {
        // Solo mode: only soloed tracks play
        return track.solo;
    } else {
        // Normal mode: play unmuted tracks
        return !track.muted;
    }
}

// Update audio for currently playing tracks (if playback is active)
function updateActiveTrackAudio() {
    if (!arrangementState.isPlaying) return;
    
    // Save current position
    const currentBarPos = arrangementState.currentBarPosition;
    const wasPlaying = arrangementState.isPlaying;
    
    // Stop current playback
    stopArrangement();
    
    // Restore position
    arrangementState.currentBarPosition = currentBarPos;
    const beatDuration = 60 / arrangementState.tempo;
    const barDuration = beatDuration * 4;
    arrangementState.currentTime = currentBarPos * barDuration;
    
    // Restart playback with new mute/solo state
    if (wasPlaying) {
        playArrangement();
    }
}

function rebuildTrackList() {
    const trackHeaders = document.getElementById('track-headers');
    trackHeaders.innerHTML = '';
    tracksContainer.innerHTML = '';
    
    arrangementState.tracks.forEach((track, index) => {
        const header = document.createElement('div');
        header.className = 'track-header';
        header.dataset.trackIndex = index;
        header.innerHTML = `
            <div class="track-name">${track.name}</div>
            <div class="track-controls">
                <button class="track-btn track-mute-btn" title="Mute">M</button>
                <button class="track-btn track-solo-btn" title="Solo">S</button>
                <button class="track-btn track-delete-btn" title="Delete">X</button>
            </div>
        `;
        trackHeaders.appendChild(header);
        
        // Apply theme to track buttons immediately using computed styles
        const trackBtns = header.querySelectorAll('.track-btn');
        const computedAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        const computedText = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
        const computedBorder = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
        
        trackBtns.forEach(btn => {
            if (computedAccent) btn.style.backgroundColor = computedAccent;
            if (computedText) btn.style.color = computedText;
            if (computedBorder) btn.style.borderColor = computedBorder;
        });
        
        const lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.dataset.trackIndex = index;
        
        // Add canvas for grid background
        const canvas = document.createElement('canvas');
        canvas.className = 'track-lane-canvas';
        canvas.width = 5000;
        canvas.height = 58; // Leave room for 2px border
        lane.appendChild(canvas);
        
        tracksContainer.appendChild(lane);
        
        // Render grid on canvas
        renderTrackGrid(canvas);
        
        // Event listeners
        const muteBtn = header.querySelector('.track-mute-btn');
        const soloBtn = header.querySelector('.track-solo-btn');
        const deleteBtn = header.querySelector('.track-delete-btn');
        
        muteBtn.addEventListener('click', () => toggleMute(index));
        soloBtn.addEventListener('click', () => toggleSolo(index));
        deleteBtn.addEventListener('click', () => deleteTrack(index));
    });
    
    // Update button states
    updateTrackButtonStates();
    
    // Update playhead height after rebuilding tracks
    updatePlayheadHeight();
}

// ========== TIMELINE RENDERING ==========
// Optimized wrapper - debounces frequent calls
function renderTimeline() {
    debounceRenderTimeline();
}

// Actual rendering function (called by debounced wrapper)
function _renderTimelineImmediate() {
    const ctx = timelineCanvas.getContext('2d');
    
    const zoom = arrangementState.zoom;
    const numBars = getVisibleBarCount(); // Dynamic bar count based on clips
    const barWidth = Math.round(100 * zoom);
    
    // CRITICAL: Limit canvas width to prevent quality loss
    // Calculate max bars we can render at current zoom without exceeding canvas limits
    const dpr = window.devicePixelRatio || 1;
    const MAX_CANVAS_WIDTH = 32767; // Browser limit
    const maxBarsAtZoom = Math.floor(MAX_CANVAS_WIDTH / (barWidth * dpr));
    const actualNumBars = Math.min(numBars, maxBarsAtZoom);
    
    const totalWidth = actualNumBars * barWidth;
    
    // Set CSS width for layout
    timelineCanvas.style.width = totalWidth + 'px';
    timelineCanvas.style.height = '40px';
    
    // Set canvas resolution - no scaling down, maintain quality
    timelineCanvas.width = totalWidth * dpr;
    timelineCanvas.height = 40 * dpr;
    
    // Scale context to match DPR
    ctx.scale(dpr, dpr);
    
    const width = totalWidth;
    const height = 40;
    
    // Get current theme colors
    const theme = getCurrentTheme();
    
    ctx.fillStyle = theme.timelineBg;
    ctx.fillRect(0, 0, width, height);
    
    const beatWidth = barWidth / 4;
    const stepWidth = beatWidth / 4;
    
    // Draw bar lines
    ctx.strokeStyle = theme.barLine;
    ctx.lineWidth = 2;
    
    // FIXED: Keep font size constant regardless of zoom - professional DAW style
    const fontSize = 14; // Always 14px base size
    ctx.font = `bold ${fontSize}px Arial`;
    
    for (let i = 0; i < actualNumBars; i++) {
        // Calculate bar position in display pixels
        const barX = i * barWidth;
        
        if (barX >= width) break;
        
        // Bar line (thick)
        ctx.beginPath();
        ctx.moveTo(barX, 0);
        ctx.lineTo(barX, height);
        ctx.stroke();
        
        // Adaptive bar number display based on zoom level
        const minBeatWidth = 40; // Full beat notation (1.1, 1.2)
        const minBarWidth = 20; // Every bar number
        const minBar4Width = 8; // Every 4th bar
        const minBar8Width = 4; // Every 8th bar
        const minBar16Width = 2; // Every 16th bar
        
        const barNum = i + 1;
        
        if (beatWidth > minBeatWidth) {
            // Show full beat notation (1.1, 1.2, etc.)
            for (let beat = 0; beat < 4; beat++) {
                const beatX = barX + beat * beatWidth;
                const beatNum = beat + 1;
                
                // Draw bar number in accent color, beat number in white
                const barText = `${barNum}`;
                const beatText = `.${beatNum}`;
                
                // Measure text widths
                ctx.fillStyle = theme.accent; // Theme accent for bar number
                ctx.fillText(barText, beatX + 5, 22);
                const barTextWidth = ctx.measureText(barText).width;
                
                ctx.fillStyle = theme.text; // Theme text color for beat number
                ctx.fillText(beatText, beatX + 5 + barTextWidth, 22);
            }
        } else if (barWidth > minBarWidth) {
            // Every bar number - centered
            ctx.fillStyle = theme.accent;
            const barText = `${barNum}`;
            const textWidth = ctx.measureText(barText).width;
            const centerX = barX + (barWidth - textWidth) / 2;
            ctx.fillText(barText, centerX, 22);
        } else if (barWidth > minBar4Width && barNum % 4 === 1) {
            // Every 4th bar (1, 5, 9, 13...)
            ctx.fillStyle = theme.accent;
            const barText = `${barNum}`;
            const textWidth = ctx.measureText(barText).width;
            const centerX = barX + (barWidth - textWidth) / 2;
            ctx.fillText(barText, centerX, 22);
        } else if (barWidth > minBar8Width && barNum % 8 === 1) {
            // Every 8th bar (1, 9, 17, 25...)
            ctx.fillStyle = theme.accent;
            const barText = `${barNum}`;
            const textWidth = ctx.measureText(barText).width;
            const centerX = barX + (barWidth - textWidth) / 2;
            ctx.fillText(barText, centerX, 22);
        } else if (barWidth > minBar16Width && barNum % 16 === 1) {
            // Every 16th bar (1, 17, 33, 49...)
            ctx.fillStyle = theme.accent;
            const barText = `${barNum}`;
            const textWidth = ctx.measureText(barText).width;
            const centerX = barX + (barWidth - textWidth) / 2;
            ctx.fillText(barText, centerX, 22);
        }
        
        // Draw beat subdivisions within each bar
        ctx.strokeStyle = theme.beatLine;
        ctx.lineWidth = 1;
        for (let beat = 1; beat < 4; beat++) {
            const beatX = barX + beat * beatWidth;
            if (beatX < width) {
                ctx.beginPath();
                ctx.moveTo(beatX, height * 0.3);
                ctx.lineTo(beatX, height);
                ctx.stroke();
            }
        }
        
        // Draw step subdivisions (lighter) - only if zoomed in enough
        if (stepWidth > 2) {
            ctx.strokeStyle = theme.stepLine;
            ctx.lineWidth = 0.5;
            for (let step = 1; step < 16; step++) {
                if (step % 4 === 0) continue; // Skip beat lines
                const stepX = barX + step * stepWidth;
                if (stepX < width) {
                    ctx.beginPath();
                    ctx.moveTo(stepX, height * 0.6);
                    ctx.lineTo(stepX, height);
                    ctx.stroke();
                }
            }
        }
        
        ctx.strokeStyle = theme.barLine;
        ctx.lineWidth = 2;
    }
    
    // Draw loop region if enabled
    if (arrangementState.loopEnabled && arrangementState.loopStart !== null && arrangementState.loopEnd !== null) {
        const loopStartX = (arrangementState.loopStart - 1) * barWidth;
        const loopEndX = arrangementState.loopEnd * barWidth;
        const loopWidth = loopEndX - loopStartX;
        
        // Semi-transparent overlay with theme accent color
        const accentRgb = hexToRgb(theme.accent);
        ctx.fillStyle = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.2)`;
        ctx.fillRect(loopStartX, 0, loopWidth, height);
        
        // Loop region borders
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(loopStartX, 0);
        ctx.lineTo(loopStartX, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(loopEndX, 0);
        ctx.lineTo(loopEndX, height);
        ctx.stroke();
        
        // Loop markers at top
        ctx.fillStyle = theme.accent;
        const markerSize = 8 * dpr;
        // Start marker (down arrow)
        ctx.beginPath();
        ctx.moveTo(loopStartX, 0);
        ctx.lineTo(loopStartX - markerSize / 2, markerSize);
        ctx.lineTo(loopStartX + markerSize / 2, markerSize);
        ctx.closePath();
        ctx.fill();
        // End marker (down arrow)
        ctx.beginPath();
        ctx.moveTo(loopEndX, 0);
        ctx.lineTo(loopEndX - markerSize / 2, markerSize);
        ctx.lineTo(loopEndX + markerSize / 2, markerSize);
        ctx.closePath();
        ctx.fill();
        
        // Loop label
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = theme.text;
        const loopText = `LOOP: ${arrangementState.loopStart}-${arrangementState.loopEnd}`;
        const textWidth = ctx.measureText(loopText).width;
        const textX = loopStartX + (loopWidth - textWidth) / 2;
        ctx.fillText(loopText, textX, height - 8 * dpr);
    }
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// Helper function to calculate visible bar count (always 50 bars more than the last clip)
function getVisibleBarCount() {
    const BUFFER_BARS = 50; // Always show 50 extra bars beyond last clip
    
    if (arrangementState.clips.length === 0) {
        return BUFFER_BARS; // No clips, just show the buffer
    }
    
    // Find the last clip end position
    let maxBar = 0;
    arrangementState.clips.forEach(clip => {
        const clipEnd = clip.startBar + clip.length;
        maxBar = Math.max(maxBar, clipEnd);
    });
    
    // Return the last bar position plus buffer
    return Math.ceil(maxBar) + BUFFER_BARS;
}

// Helper function to get bar number from mouse X position with sub-beat precision
function getBarFromMouseX(clientX, offsetX) {
    if (!timelineCanvas) {
        return 0;
    }
    
    // If offsetX is provided (from event.offsetX), use it directly
    // offsetX gives position relative to the element, accounting for scroll
    if (offsetX !== undefined && offsetX !== null) {
        const barWidth = 100 * arrangementState.zoom;
        const bar = offsetX / barWidth;
        // Clamp to minimum of 0 (start of timeline)
        return Math.max(0, Math.min(bar, 1000)); // Max 1000 bars
    }
    
    // Fallback to clientX method
    const rect = timelineCanvas.getBoundingClientRect();
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    const scrollX = timelineWrapper ? timelineWrapper.scrollLeft : arrangementState.scrollX;
    
    const x = clientX - rect.left + scrollX;
    const barWidth = 100 * arrangementState.zoom;
    const bar = x / barWidth;
    
    // Clamp to minimum of 0 (start of timeline)
    return Math.max(0, Math.min(bar, 1000)); // Max 1000 bars
}

// Helper function for snapped bar position (used when placing clips)
function getSnappedBarFromMouseX(clientX, offsetX) {
    if (!timelineCanvas) {
        return 0;
    }
    
    // If offsetX is provided, use it directly
    if (offsetX !== undefined && offsetX !== null) {
        const barWidth = 100 * arrangementState.zoom;
        const beatWidth = barWidth / 4;
        const stepWidth = beatWidth / 4; // 1/16th note precision
        
        // Snap to nearest 1/16th step
        const steps = Math.round(offsetX / stepWidth);
        const snappedX = steps * stepWidth;
        const bar = snappedX / barWidth;
        
        return Math.max(0, bar);
    }
    
    // Fallback to clientX method
    const rect = timelineCanvas.getBoundingClientRect();
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    const scrollX = timelineWrapper ? timelineWrapper.scrollLeft : arrangementState.scrollX;
    
    const x = clientX - rect.left + scrollX;
    const barWidth = 100 * arrangementState.zoom;
    const beatWidth = barWidth / 4;
    const stepWidth = beatWidth / 4; // 1/16th note precision
    
    // Snap to nearest 1/16th step
    const steps = Math.round(x / stepWidth);
    const snappedX = steps * stepWidth;
    const bar = snappedX / barWidth;
    
    return Math.max(0, bar);
}

// Helper function to get beat-precise position (for loop selection)
function getBeatFromMouseX(clientX) {
    if (!timelineCanvas) {
        return 1;
    }
    const rect = timelineCanvas.getBoundingClientRect();
    const x = clientX - rect.left + arrangementState.scrollX;
    const barWidth = 100 * arrangementState.zoom;
    const beatWidth = barWidth / 4;
    
    // Snap to nearest beat (quarter note)
    const beats = Math.round(x / beatWidth);
    const bar = Math.floor(beats / 4) + 1; // Convert to bar number (1-indexed)
    
    return Math.max(1, bar);
}

function handleTimelineSeek(e) {
    if (!timelineCanvas) {
        return;
    }
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const offsetX = e.offsetX !== undefined ? e.offsetX : null;
    
    let barPosition = getBarFromMouseX(clientX, offsetX);
    
    // Ensure barPosition is always >= 0 (beginning of timeline)
    barPosition = Math.max(0, barPosition);
    
    // Update playhead position with sub-beat precision
    const beatDuration = 60 / arrangementState.tempo;
    const barDuration = beatDuration * 4;
    
    // Update BOTH time and bar position
    arrangementState.currentTime = barPosition * barDuration;
    arrangementState.currentBarPosition = barPosition; // Set bar position for tempo-independent tracking
    arrangementState.currentBar = Math.floor(barPosition) + 1;
    
    document.getElementById('arr-current-bar').textContent = arrangementState.currentBar;
    renderTimeline();
    
    // Update playhead visual position immediately (even when stopped)
    const barWidth = 100 * arrangementState.zoom;
    const pixelPosition = barPosition * barWidth;
    playheadLine.style.left = pixelPosition + 'px';
    
    // Update playhead height to match all tracks
    const totalTracksHeight = arrangementState.tracks.length * 60;
    playheadLine.style.height = totalTracksHeight + 'px';
    
    // If playing, update start time without stopping (seamless seek)
    if (arrangementState.isPlaying && audioContext) {
        // Ensure audio context is running
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(err => {});
        }
        
        // Recalculate start time to match new bar position
        arrangementState.startTime = audioContext.currentTime - (barPosition * barDuration);
        
        // Stop all currently playing sources
        if (arrangementState.scheduledSources) {
            arrangementState.scheduledSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {}
            });
            arrangementState.scheduledSources = [];
        }
        
        // Clear active clip nodes
        arrangementState.activeClipNodes = {};
        
        // Clear LFO and Automation intervals
        if (arrangementState.clipPlaybackData) {
            arrangementState.clipPlaybackData.forEach(clipData => {
                if (clipData.lfoIntervals) {
                    clipData.lfoIntervals.forEach(id => clearInterval(id));
                }
                if (clipData.automationIntervals) {
                    clipData.automationIntervals.forEach(id => clearInterval(id));
                }
            });
            arrangementState.clipPlaybackData = [];
        }
        
        // Reschedule clips from new position WITHOUT stopping/restarting playback
        scheduleClips();
    }
}

// Throttle zoom rendering for smooth performance
let zoomRenderTimeout = null;
let clipRenderTimeout = null;

function handleTimelineZoom(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent scroll event from propagating
    
    // Zoom in/out based on scroll direction
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    
    // Calculate minimum zoom level to show all clips horizontally (fit-all view)
    let fitAllZoom = 0.1; // Default minimum
    let maxBar = 1; // Default if no clips
    
    if (arrangementState.clips.length > 0) {
        const tracksScroll = document.getElementById('arrangement-tracks-scroll');
        if (tracksScroll) {
            // Find rightmost clip edge
            arrangementState.clips.forEach(clip => {
                const clipEnd = (clip.startBar || 0) + (clip.lengthBars || clip.length || 1);
                if (clipEnd > maxBar) maxBar = clipEnd;
            });
            
            // Add 50 bars buffer (matching getVisibleBarCount)
            const totalBars = Math.ceil(maxBar) + 50;
            
            // Calculate zoom level needed to fit all bars in viewport
            const viewportWidth = tracksScroll.clientWidth;
            const requiredWidth = totalBars * 100; // 100px per bar at 1x zoom
            fitAllZoom = Math.max(0.05, (viewportWidth / requiredWidth) * 0.95); // Lower minimum to 0.05
        }
    }
    
    let newZoom = arrangementState.zoom * delta;
    
    // If zooming out and approaching minimum, snap to fit-all view
    if (delta < 1 && newZoom <= fitAllZoom * 1.05) {
        newZoom = fitAllZoom;
    }
    
    // Clamp zoom between fit-all and max zoom (allow lower minimum)
    newZoom = Math.max(fitAllZoom, Math.min(8, newZoom)); // Increased max zoom to 8x
    
    // Calculate mouse position in arrangement space BEFORE zoom
    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    const tracksRect = tracksScroll.getBoundingClientRect();
    const mouseX = e.clientX - tracksRect.left; // CRITICAL: Use tracks scroll area, not timeline!
    const oldScrollLeft = tracksScroll.scrollLeft;
    const oldBarWidth = 100 * arrangementState.zoom;
    
    // Calculate which bar is under the mouse cursor
    const barUnderMouse = (oldScrollLeft + mouseX) / oldBarWidth;
    
    // Apply zoom FIRST
    arrangementState.zoom = newZoom;
    updateZoomDisplay();
    
    // Calculate new scroll position to keep bar under mouse
    const newBarWidth = 100 * newZoom;
    const newScrollLeft = (barUnderMouse * newBarWidth) - mouseX;
    
    // Update scroll position IMMEDIATELY
    if (Math.abs(newZoom - fitAllZoom) < 0.01) {
        tracksScroll.scrollLeft = 0;
    } else {
        tracksScroll.scrollLeft = Math.max(0, newScrollLeft);
    }
    
    // Sync timeline scroll IMMEDIATELY
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    if (timelineWrapper) {
        timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
    }
    
    // Fast visual updates during zoom - MINIMAL work
    // Skip track backgrounds update during zoom (causes lag)
    _renderTimelineImmediate(); // Bar numbers - always instant
    
    // Only update clip transforms (position/scale) using CSS, no re-rendering
    updateClipTransformsOnly();
    
    // Debounce full clip re-render (with waveforms) after zoom finishes
    if (zoomDebounceTimeout) clearTimeout(zoomDebounceTimeout);
    zoomDebounceTimeout = setTimeout(() => {
        renderAllClips();
        zoomDebounceTimeout = null;
    }, 150);
    
    // Re-sync scroll after rendering to ensure precision
    tracksScroll.scrollLeft = Math.max(0, newScrollLeft);
    if (timelineWrapper) {
        timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
    }
}function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function updateZoomDisplay() {
    const zoomDisplay = document.getElementById('arr-zoom-display');
    if (zoomDisplay) {
        const percentage = Math.round(arrangementState.zoom * 100);
        zoomDisplay.textContent = `${percentage}%`;
    }
}

// Auto-scroll tracks/timeline when pointer is near left/right edges during drag
function autoScrollDuringDrag(clientX) {
    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    if (!tracksScroll || !timelineWrapper) return;

    const rect = tracksScroll.getBoundingClientRect();
    const edgeMargin = 40;
    // Use clientWidth to compute right edge relative to left so we don't depend on rect.right
    const leftEdge = rect.left + edgeMargin; // start scrolling when 40px from left
    const rightEdge = rect.left + tracksScroll.clientWidth - edgeMargin; // start scrolling when 40px from right
    // Compute distance from edges and derive a proportional, capped speed so scrolling feels smooth
    // Increase speeds for more responsive scrolling during direct drag events
    const maxSpeed = 140; // max px per event (was 40)
    const minSpeed = 6;   // min px per event when pointer is just inside threshold (was 3)

    if (clientX < leftEdge) {
        const dist = Math.max(0, leftEdge - clientX);
        const speed = Math.min(maxSpeed, Math.max(minSpeed, Math.ceil(dist / 3)));
        tracksScroll.scrollLeft = Math.max(0, tracksScroll.scrollLeft - speed);
        timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
        arrangementState.scrollX = tracksScroll.scrollLeft;
        renderTimeline();
        // Avoid renderAllClips here while a clip is actively being dragged; re-render is done on drop
        if (!arrangementState.draggingClipId) renderAllClips();
    } else if (clientX > rightEdge) {
        const dist = Math.max(0, clientX - rightEdge);
        const speed = Math.min(maxSpeed, Math.max(minSpeed, Math.ceil(dist / 3)));
        tracksScroll.scrollLeft = Math.min(tracksScroll.scrollWidth - tracksScroll.clientWidth, tracksScroll.scrollLeft + speed);
        timelineWrapper.scrollLeft = tracksScroll.scrollLeft;
        arrangementState.scrollX = tracksScroll.scrollLeft;
        renderTimeline();
        if (!arrangementState.draggingClipId) renderAllClips();
    }
}

// Smooth auto-scroll using requestAnimationFrame while dragging
function startAutoScrollLoop() {
    if (arrangementState._autoScrollRunning) return;
    arrangementState._autoScrollRunning = true;
    arrangementState._autoScrollLastTime = performance.now();
    arrangementState._autoScrollRAF = requestAnimationFrame(autoScrollLoop);
}

function stopAutoScrollLoop() {
    if (!arrangementState._autoScrollRunning) return;
    arrangementState._autoScrollRunning = false;
    if (arrangementState._autoScrollRAF) {
        cancelAnimationFrame(arrangementState._autoScrollRAF);
        arrangementState._autoScrollRAF = null;
    }
    arrangementState._autoScrollPointerX = null;
    arrangementState._autoScrollPointerY = null;
}

function autoScrollLoop(now) {
    if (!arrangementState._autoScrollRunning) return;
    const last = arrangementState._autoScrollLastTime || now;
    const dt = Math.max(1, now - last);
    arrangementState._autoScrollLastTime = now;

    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
    if (!tracksScroll || !timelineWrapper) {
        stopAutoScrollLoop();
        return;
    }

    const rect = tracksScroll.getBoundingClientRect();
    const edgeMargin = 40;
    const leftEdge = rect.left + edgeMargin;
    const rightEdge = rect.left + tracksScroll.clientWidth - edgeMargin;
    const pxPointer = arrangementState._autoScrollPointerX;
    const pyPointer = arrangementState._autoScrollPointerY;

    // Horizontal auto-scroll
    if (pxPointer != null) {
        // Increase speeds and tighten normalization for snappier scrolling
        const maxSpeed = 900; // px per second
        const minSpeed = 40;  // px per second

        let scrollDelta = 0;
        if (pxPointer < leftEdge) {
            const dist = Math.max(0, leftEdge - pxPointer);
            const t = Math.min(1, dist / 120); // normalize over 120px (was 200)
            const speed = Math.round(minSpeed + (maxSpeed - minSpeed) * (t * t)); // quadratic ease
            scrollDelta = -Math.round(speed * (dt / 1000));
        } else if (pxPointer > rightEdge) {
            const dist = Math.max(0, pxPointer - rightEdge);
            const t = Math.min(1, dist / 120);
            const speed = Math.round(minSpeed + (maxSpeed - minSpeed) * (t * t));
            scrollDelta = Math.round(speed * (dt / 1000));
        }

        if (scrollDelta !== 0) {
            const newLeft = Math.max(0, Math.min(tracksScroll.scrollWidth - tracksScroll.clientWidth, tracksScroll.scrollLeft + scrollDelta));
            if (newLeft !== tracksScroll.scrollLeft) {
                tracksScroll.scrollLeft = newLeft;
                timelineWrapper.scrollLeft = newLeft;
                arrangementState.scrollX = newLeft;
                // only re-render timeline while dragging; clips are re-rendered on drop
                renderTimeline();
            }
        }
    }

    // Vertical auto-scroll (scroll tracks vertically when pointer near top/bottom)
    if (pyPointer != null) {
    const topEdge = rect.top + 40;
    const bottomEdge = rect.top + tracksScroll.clientHeight - 40;
    // make vertical scroll faster so dragging to bottom moves the viewport promptly
    const maxVSpeed = 700; // px per second
    const minVSpeed = 30; // px per second

        let vDelta = 0;
        if (pyPointer < topEdge) {
            const dist = Math.max(0, topEdge - pyPointer);
            const t = Math.min(1, dist / 120);
            const speed = Math.round(minVSpeed + (maxVSpeed - minVSpeed) * (t * t));
            vDelta = -Math.round(speed * (dt / 1000));
        } else if (pyPointer > bottomEdge) {
            const dist = Math.max(0, pyPointer - bottomEdge);
            const t = Math.min(1, dist / 120);
            const speed = Math.round(minVSpeed + (maxVSpeed - minVSpeed) * (t * t));
            vDelta = Math.round(speed * (dt / 1000));
        }

        if (vDelta !== 0) {
            const newTop = Math.max(0, Math.min(tracksScroll.scrollHeight - tracksScroll.clientHeight, tracksScroll.scrollTop + vDelta));
            if (newTop !== tracksScroll.scrollTop) {
                tracksScroll.scrollTop = newTop;
                arrangementState.scrollY = newTop;
                // we don't re-render clips here; visual transform keeps drag smooth
            }
        }
    }

    arrangementState._autoScrollRAF = requestAnimationFrame(autoScrollLoop);
}

// ========== CLIP MANAGEMENT ==========
async function handleTrackClick(e) {
    if (!arrangementState.placeMode) return;
    
    // Don't place a clip if we just finished resizing
    if (arrangementState.justFinishedResize) return;
    
    const target = e.target.closest('.track-lane');
    if (!target) return;
    
    const trackIndex = parseInt(target.dataset.trackIndex);
    
    // Calculate bar position from track click
    let x;
    
    // Calculate x from clientX using the tracks scroll container as stable reference
    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    const tracksRect = tracksScroll ? tracksScroll.getBoundingClientRect() : target.getBoundingClientRect();
    const scrollLeft = tracksScroll ? tracksScroll.scrollLeft : arrangementState.scrollX;
    x = e.clientX - tracksRect.left + scrollLeft;
    
    const barWidth = 100 * arrangementState.zoom;
    
    // Snap to nearest bar line when placing new clips
    const bar = Math.max(0, Math.round(x / barWidth));
    
    
    let clipLength = 1; // Default to 1 bar
    let audioBuffer = null;
    let isFromFolder = false;
    
    // For samples, calculate actual length based on sample duration at 120 BPM reference
    if (arrangementState.placeMode.type === 'sample') {
        const sampleKey = arrangementState.placeMode.data;
        
        // Determine if this is from folder, custom upload, or numbered sample
        // Folder files: strings that DON'T start with "custom_" or "recording_"
        // Custom samples: strings that start with "custom_" or "recording_"
        // Standard samples: numbers
        const isCustomSample = typeof sampleKey === 'string' && (sampleKey.startsWith('custom_') || sampleKey.startsWith('recording_'));
        isFromFolder = typeof sampleKey === 'string' && !isCustomSample;
        
        if (isFromFolder) {
            // Get from folder buffers - WAIT for it if not loaded yet
            audioBuffer = getAudioBuffer(sampleKey, true);

            // CRITICAL: If buffer not yet available, wait for it (up to 5 seconds)
            if (!audioBuffer) {

                const maxWaitTime = 5000; // 5 seconds
                const startWait = Date.now();
                
                while (!audioBuffer && (Date.now() - startWait) < maxWaitTime) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    audioBuffer = getAudioBuffer(sampleKey, true);
                }
                
                if (audioBuffer) {

                } else {
                }
            }
        } else if (isCustomSample) {
            // Custom uploaded or recorded sample - get from sampleBuffers
            audioBuffer = sampleBuffers[sampleKey];

            if (!audioBuffer) {
            }
        } else {
            // Standard numbered sample - try to load if not already loaded
            if (!sampleBuffers[sampleKey]) {

                await loadSampleBuffer(sampleKey);
            }
            audioBuffer = sampleBuffers[sampleKey];
        }
        
        // Calculate clip length in bars at reference tempo (120 BPM)
        if (audioBuffer) {
            const sampleDuration = audioBuffer.duration; // in seconds
            const referenceBeatDuration = 60 / 120; // 120 BPM reference
            const referenceBarDuration = referenceBeatDuration * 4; // 4 beats per bar
            const exactBars = sampleDuration / referenceBarDuration;
            
            // Only round up if we're more than 90% into the next bar
            if (exactBars - Math.floor(exactBars) > 0.9) {
                clipLength = Math.ceil(exactBars);
            } else {
                clipLength = Math.max(1, Math.floor(exactBars));
            }
            
        } else {
        }
    } else if (arrangementState.placeMode.type === 'pattern') {
        // Patterns have predefined length
        const pattern = arrangementState.patterns[arrangementState.placeMode.data];
        clipLength = pattern ? pattern.length : 4;
    }
    
    // Check for collision with existing clips
    const hasCollision = arrangementState.clips.some(existingClip => {
        if (existingClip.trackIndex !== trackIndex) return false;
        
        const existingStart = existingClip.startBar;
        const existingEnd = existingClip.startBar + existingClip.length;
        const newStart = bar;
        const newEnd = bar + clipLength;
        
        // Check if ranges overlap
        return (newStart < existingEnd && newEnd > existingStart);
    });
    
    if (hasCollision) {

        return; // Don't place the clip
    }
    
    const clip = {
        id: Date.now(),
        trackIndex: trackIndex,
        startBar: bar,
        type: arrangementState.placeMode.type,
        data: arrangementState.placeMode.data,
        isFromFolder: isFromFolder, // ← NEW: Track if this is from a folder
        length: clipLength,
        originalLength: clipLength, // Store the original length for stretch calculations
        stretchedLength: clipLength, // Track the stretched size (used when trimming stretched clips)
        trimStart: 0, // For trim mode - which bar to start playing from
        stretchMode: false // Whether this clip has been stretched (false = trim mode)
    };
    
    // Wrap with undo/redo
    window.undoManager.execute(
        new Command(
            'Add Clip',
            () => {
                arrangementState.clips.push(clip);
                renderClip(clip);
                saveArrangement(false);
            },
            () => {
                arrangementState.clips = arrangementState.clips.filter(c => c.id !== clip.id);
                renderAllClips();
                saveArrangement(false);
            }
        )
    );
    
    // Update grid to accommodate new clip
    updateTrackBackgrounds();
    renderTimeline();

    // If currently playing, schedule this new clip if it should be playing
    if (arrangementState.isPlaying) {
        // Calculate precise current position
        const elapsedTime = audioContext.currentTime - arrangementState.startTime;
        const secondsPerBar = 60 / arrangementState.tempo * 4;
        const currentBarPrecise = elapsedTime / secondsPerBar;
        
        const clipEndBar = clip.startBar + clip.length;
        
        // If the clip overlaps with current playback position
        if (clip.startBar <= currentBarPrecise && currentBarPrecise < clipEndBar) {
            // Calculate how far into the clip we should be
            const barsIntoClip = currentBarPrecise - clip.startBar;
            const offsetIntoClip = barsIntoClip * secondsPerBar;
            
            // Schedule from current time with offset
            if (clip.type === 'sample') {
                scheduleClipWithOffset(clip, audioContext.currentTime, offsetIntoClip);
            }
        } else if (clip.startBar > currentBarPrecise) {
            // Clip is ahead of playhead, calculate exact time until it should play
            const barsUntilClip = clip.startBar - currentBarPrecise;
            const timeUntilClip = barsUntilClip * secondsPerBar;
            const startTime = audioContext.currentTime + timeUntilClip;
            
            if (clip.type === 'sample') {
                scheduleSampleClip(clip, startTime);
            }
        }
    }
    
    // DON'T reset place mode - allow multiple placements
    // User can deselect dropdown or press Escape to exit
}

function renderClip(clip) {
    const lane = tracksContainer.querySelector(`[data-track-index="${clip.trackIndex}"]`);
    if (!lane) return;
    
    const barWidth = 100 * arrangementState.zoom;
    const clipEl = document.createElement('div');
    clipEl.className = `clip ${clip.type}`;
    clipEl.dataset.clipId = clip.id;
    clipEl.style.left = (clip.startBar * barWidth + 2) + 'px';
    clipEl.style.width = (clip.length * barWidth - 2) + 'px';
    
    // Set z-index based on track position (higher track = higher z-index = on top)
    // This ensures clips on lower tracks appear below clips on higher tracks
    clipEl.style.zIndex = clip.trackIndex;
    
    // Apply custom color if set
    if (clip.customColor) {
        clipEl.style.background = clip.customColor;
    }
    
    if (clip.type === 'sample') {
        renderSampleClip(clipEl, clip);
    } else if (clip.type === 'pattern') {
        renderPatternClip(clipEl, clip);
    }
    
    // Context menu on right-click (desktop) and long-press (mobile)
    let longPressTimer = null;
    
    // FEATURE [4]: Click on clip to select it and copy its settings
    clipEl.addEventListener('click', (e) => {
        // Don't trigger if we're resizing
        if (arrangementState.resizingClip) return;

        // If delete mode is active, delete the clip
        const deleteRadio = document.getElementById('edit-mode-delete');
        if (deleteRadio && deleteRadio.checked) {
            deleteClip(clip.id);
            e.stopPropagation(); // Prevent track click handler from firing
            return; // Exit without setting placeMode
        }

        // Deep clone the clip (including effects)
        arrangementState.selectedClip = JSON.parse(JSON.stringify(clip));

        // Enter clone place mode
        arrangementState.placeMode = { type: 'clone', data: null };

        // Select this clip's type and value in the dropdowns
        if (clip.type === 'sample') {
            const sampleSelect = document.getElementById('arr-sample-select');
            sampleSelect.value = clip.data;

        } else if (clip.type === 'pattern') {
            const patternSelect = document.getElementById('arr-pattern-select');
            patternSelect.value = clip.data;

        }

        // Visual feedback
        document.querySelectorAll('.clip').forEach(c => c.style.outline = 'none');
        clipEl.style.outline = '3px solid #FFD700';
        setTimeout(() => {
            clipEl.style.outline = 'none';
        }, 1000);
        
        // Prevent placing a clone immediately on this same clip
        e.stopPropagation();
    });
    
    // Context menu on right-click (desktop). We intentionally suppress touch-initiated contextmenus
    // so long-press on mobile doesn't open the menu and interfere with dragging.
    clipEl._lastPointerType = null;
    clipEl.addEventListener('contextmenu', (e) => {
        // If the last interaction was touch, ignore contextmenu (prevents long-press menu on mobile)
        const lastType = clipEl._lastPointerType || e.pointerType || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents ? 'touch' : null);
        if (lastType === 'touch') {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        showContextMenu(clip, e.clientX, e.clientY);
    });
    
    // Resize/Trim on mousedown near edges
    clipEl.addEventListener('mousedown', (e) => {
        const rect = clipEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const edgeThreshold = 10; // 10px from edge
        
        if (x <= edgeThreshold && arrangementState.editMode === 'trim') {
            // Left edge - trim start
            startClipResize(clip, 'left', e);
            e.stopPropagation();
        } else if (x >= rect.width - edgeThreshold) {
            // Right edge - stretch or trim end
            startClipResize(clip, 'right', e);
            e.stopPropagation();
        }
    });
    
    // Change cursor near edges
    clipEl.addEventListener('mousemove', (e) => {
        const rect = clipEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const edgeThreshold = 10;
        
        if (x <= edgeThreshold && arrangementState.editMode === 'trim') {
            clipEl.style.cursor = 'w-resize';
        } else if (x >= rect.width - edgeThreshold) {
            clipEl.style.cursor = 'e-resize';
        } else {
            clipEl.style.cursor = 'default';
        }
    });

    // ---- Drag-to-move clip (click & drag) ----
    // We'll ignore drags when starting near the edges (reserved for resize)
    let isDraggingClip = false;
    let dragStartX = 0;
    let originalStartBar = 0;

    const beginDrag = (clientX) => {
        const rect = clipEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const edgeThreshold = 10;
        // If initiating near an edge, treat as resize (don't start move)
        if (x <= edgeThreshold || x >= rect.width - edgeThreshold) return false;

        isDraggingClip = true;
        dragStartX = clientX;
        originalStartBar = clip.startBar;
        document.body.style.cursor = 'grabbing';
        // Bring clip to front while dragging
        clipEl.style.zIndex = 1000;
        return true;
    };

    const onDragMove = (clientX) => {
        if (!isDraggingClip) return;
        const deltaX = clientX - dragStartX;
        const barWidth = 100 * arrangementState.zoom;
        const deltaBars = deltaX / barWidth;
        let newStart = originalStartBar + deltaBars;
        // Prevent negative start
        newStart = Math.max(0, newStart);

        // Snap to nearest SUB-BEAT (1/16th note) when dragging
        const beatWidth = barWidth / 4; // Beat = 1/4 bar
        const subBeatWidth = beatWidth / 4; // Sub-beat = 1/16th note
        const snappedPx = Math.round((newStart * barWidth) / subBeatWidth) * subBeatWidth;
        const snappedBars = snappedPx / barWidth;

        // Allow clips to overlap freely
        clip.startBar = snappedBars;
        // Move DOM element visually
        clipEl.style.left = (clip.startBar * barWidth) + 'px';
    };

    const endDrag = () => {
        if (!isDraggingClip) return;
        isDraggingClip = false;
        document.body.style.cursor = 'default';
        clipEl.style.zIndex = '';
        saveArrangement(false);
        renderAllClips();
    };

    // Pointer events for robust dragging (mouse + touch + pen)
    // Use document-level listeners so dragging continues reliably even if the element moves visually.
    clipEl.style.touchAction = 'none'; // Disable default touch gestures while interacting with clips
    clipEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || arrangementState.resizingClip) return;

        const rect = clipEl.getBoundingClientRect();
        const xInEl = e.clientX - rect.left;
        const edgeThreshold = 10;
        if (xInEl <= edgeThreshold || xInEl >= rect.width - edgeThreshold) {
            return; // startResize will handle this
        }

        e.preventDefault();

        // Pointer capture to keep receiving pointer events
        try { clipEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

        const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
        let dragStarted = false;
        const dragThreshold = 6; // px
        originalStartBar = clip.startBar;
        const originalTrackIndex = clip.trackIndex;
        let currentTranslateY = 0;
    // Calculate grab offset in bars (arrangement coordinates) so it's stable when scrollLeft changes
    const barWidth = 100 * arrangementState.zoom;
    const tracksScroll = document.getElementById('arrangement-tracks-scroll');
    const startScrollLeft = tracksScroll ? tracksScroll.scrollLeft : arrangementState.scrollX;
    // Use the tracks scroll container as the stable reference for arrangement X coordinates
    const tracksRectForGrab = tracksScroll ? tracksScroll.getBoundingClientRect() : clipEl.parentElement.getBoundingClientRect();
    const startArrangementX = startX - tracksRectForGrab.left + startScrollLeft; // px in arrangement coords
    const grabOffsetBars = (startArrangementX / barWidth) - clip.startBar; // in bars

        // Long-press timer for touch to open context menu (only if no drag occurs)
        let longPressTimer = null;
        if (e.pointerType === 'touch') {
            longPressTimer = setTimeout(() => {
                // show context menu if user hasn't moved enough to start drag
                if (!dragStarted) {
                    showContextMenu(clip, startX, startY);
                }
            }, 500);
        }

        document.body.style.cursor = 'grabbing';
        clipEl.style.zIndex = 1000;

        const onDocPointerMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

                if (!dragStarted) {
                        if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
                            dragStarted = true;
                            // Prevent scrolling while dragging
                            ev.preventDefault();
                            // Mark global dragging state so auto-scroll doesn't re-render clips
                            arrangementState.draggingClipId = clip.id;
                            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                            // Start smooth RAF-driven auto-scroll and set pointer X/Y
                            arrangementState._autoScrollPointerX = ev.clientX;
                            arrangementState._autoScrollPointerY = ev.clientY;
                            startAutoScrollLoop();
                    } else {
                        return; // don't start drag until threshold passed
                    }
                }
            
            // Prevent scrolling while dragging
            ev.preventDefault();
            // Determine target lane under pointer first (so we can use it to compute lane rect)
            let targetLaneEl = null;
            try {
                const els = document.elementsFromPoint(ev.clientX, ev.clientY);
                for (const el of els) {
                    if (el && el.classList && el.classList.contains('track-lane')) { targetLaneEl = el; break; }
                }
            } catch (err) { /* ignore */ }

            // Horizontal: compute new start bar using pointer position relative to lane + grab offset (bars)
            const barWidth = 100 * arrangementState.zoom;
            const tracksScroll = document.getElementById('arrangement-tracks-scroll');
            const tracksRect = tracksScroll ? tracksScroll.getBoundingClientRect() : clipEl.parentElement.getBoundingClientRect();
            const scrollLeft = tracksScroll ? tracksScroll.scrollLeft : arrangementState.scrollX;
            // Compute pointer X in arrangement coordinates using the stable tracks container rect
            const xInArrangement = ev.clientX - tracksRect.left + scrollLeft;
            // Use grabOffsetBars (computed at pointerdown) so changes to scrollLeft don't offset the grabbed point
            let newStart = (xInArrangement / barWidth) - grabOffsetBars;
            newStart = Math.max(0, newStart);
            
            // Apply snapping based on Shift key state
            let snappedBars;
            if (ev.shiftKey) {
                // Shift held: free movement (no snapping)
                snappedBars = newStart;
            } else {
                // Snap to sub-beat lines (1/16th note = 1/4 beat)
                const beatWidth = barWidth / 4;
                const subBeatWidth = beatWidth / 4; // 1/16th note
                const snapToSubBeat = Math.round((newStart * barWidth) / subBeatWidth) * subBeatWidth;
                snappedBars = snapToSubBeat / barWidth;
            }

            const targetTrackIndex = targetLaneEl ? parseInt(targetLaneEl.dataset.trackIndex) : originalTrackIndex;

            // Allow clips to overlap freely
            // Update logical X position live
            clip.startBar = snappedBars;
            clipEl.style.left = (clip.startBar * barWidth) + 'px';
            // Visual vertical move using transform (no reparenting while dragging)
            currentTranslateY = dy;
            clipEl.style.transform = `translateY(${currentTranslateY}px)`;
            clipEl.dataset._targetTrack = targetTrackIndex;
            clipEl.style.opacity = '';

            // Ensure the dragged clip stays visible inside the tracks scroll viewport
            try {
                const tracksScrollEl = document.getElementById('arrangement-tracks-scroll');
                if (tracksScrollEl) {
                    const tracksRect = tracksScrollEl.getBoundingClientRect();
                    const clipRectVis = clipEl.getBoundingClientRect();
                    const edgeMargin = 20; // keep a small margin from the edges
                                    // Don't perform an immediate large jump here; rely on RAF-driven smooth auto-scroll
                                    // to keep the grid moving smoothly. We still keep this block in case of tiny
                                    // out-of-view corrections in future, but for now do nothing here.
                }
            } catch (err) { /* ignore visibility adjust errors */ }
            // Update RAF auto-scroll pointer X/Y so the loop can scroll smoothly
            arrangementState._autoScrollPointerX = ev.clientX;
            arrangementState._autoScrollPointerY = ev.clientY;
        };

        const onDocPointerUp = (ev) => {
            if (ev.pointerId !== pointerId) return;
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

            // If drag started and we have a target track, finalize move
            const targetTrackIndex = clipEl.dataset._targetTrack ? parseInt(clipEl.dataset._targetTrack) : originalTrackIndex;
            if (dragStarted) {
                // Set flag to prevent track click handler from placing a clip
                arrangementState._justFinishedDragging = true;
                setTimeout(() => { arrangementState._justFinishedDragging = false; }, 100);
                
                // Remove visual transform
                clipEl.style.transform = '';
                
                // Store final position
                const finalStartBar = clip.startBar;
                const finalTrackIndex = targetTrackIndex;
                
                // Check if position or track actually changed
                if (finalStartBar !== originalStartBar || finalTrackIndex !== originalTrackIndex) {
                    window.undoManager.execute(
                        new Command(
                            'Move Clip',
                            () => {
                                clip.startBar = finalStartBar;
                                clip.trackIndex = finalTrackIndex;
                                saveArrangement(false);
                                renderAllClips();
                            },
                            () => {
                                clip.startBar = originalStartBar;
                                clip.trackIndex = originalTrackIndex;
                                saveArrangement(false);
                                renderAllClips();
                            }
                        )
                    );
                } else {
                    // Allow track change without collision check
                    if (targetTrackIndex !== originalTrackIndex) {
                        clip.trackIndex = targetTrackIndex;
                    }

                    // Commit changes
                    saveArrangement(false);
                    renderAllClips();
                }

                // Re-schedule audio if currently playing
                if (arrangementState.isPlaying && audioContext) {
                    // Stop all currently scheduled audio sources
                    arrangementState.scheduledSources.forEach(source => {
                        try {
                            source.stop();
                        } catch (e) {}
                    });
                    arrangementState.scheduledSources = [];
                    arrangementState.scheduledClipIds.clear();
                    
                    // Re-schedule clips from current position
                    scheduleClips();
                }
            } else {
                // No drag started -> pointerup without movement. For touch, this should not open the menu
                // (we used long-press to open menu). For mouse, allow click handlers elsewhere to run.
            }

            document.body.style.cursor = 'default';
            clipEl.style.zIndex = '';
            clipEl.style.opacity = '';
            try { clipEl.releasePointerCapture(pointerId); } catch (err) {}
            // Clear global dragging state
            arrangementState.draggingClipId = null;
            // Stop RAF-driven auto-scroll
            stopAutoScrollLoop();

            // Remove listeners
            document.removeEventListener('pointermove', onDocPointerMove);
            document.removeEventListener('pointerup', onDocPointerUp);
            document.removeEventListener('pointercancel', onDocPointerUp);
        };

        document.addEventListener('pointermove', onDocPointerMove, { passive: false });
        document.addEventListener('pointerup', onDocPointerUp);
        document.addEventListener('pointercancel', onDocPointerUp);
    });
    
    lane.appendChild(clipEl);
}

function startClipResize(clip, edge, startEvent) {
    arrangementState.resizingClip = {
        clip: clip,
        edge: edge,
        startX: startEvent.clientX,
        originalStart: clip.startBar,
        originalLength: clip.length,
        originalTrimStart: clip.trimStart || 0,
        originalTrimEnd: clip.trimEnd || 0
    };
    
    document.body.style.cursor = edge === 'left' ? 'w-resize' : 'e-resize';
    
    // Throttle waveform updates during resize
    let lastWaveformUpdate = 0;
    const WAVEFORM_UPDATE_INTERVAL = 50; // Update waveform every 50ms
    
    const handleMouseMove = (e) => {
        if (!arrangementState.resizingClip) return;
        
        const deltaX = e.clientX - arrangementState.resizingClip.startX;
        const barWidth = 100 * arrangementState.zoom;
        const deltaBars = deltaX / barWidth;
        
        const resizing = arrangementState.resizingClip;
        
        if (resizing.edge === 'left') {
            if (arrangementState.editMode === 'trim') {
                // TRIM LEFT
                const newStartBar = Math.max(0, resizing.originalStart + deltaBars);
                const positionChange = newStartBar - resizing.originalStart;
                
                // Clamp: Can't trim beyond the available length
                const maxLength = resizing.clip.stretchMode ? resizing.clip.stretchedLength : resizing.clip.originalLength;
                const maxTrimStart = maxLength - 0.25; // Keep at least 0.25 bars visible
                const clampedTrimStart = Math.min(resizing.originalTrimStart + positionChange, maxTrimStart);
                const actualPositionChange = clampedTrimStart - resizing.originalTrimStart;
                
                // Calculate new length and clamp it
                const newLength = resizing.originalLength - actualPositionChange;
                const clampedLength = Math.min(newLength, maxLength);
                
                // If length is at max, prevent further position changes (stop the clip from moving)
                if (clampedLength >= maxLength && actualPositionChange < 0) {
                    // Dragging left but already at max length - don't move the clip
                    resizing.clip.startBar = resizing.originalStart;
                    resizing.clip.length = maxLength;
                    resizing.clip.trimStart = 0;
                } else {
                    resizing.clip.startBar = resizing.originalStart + actualPositionChange;
                    resizing.clip.length = Math.max(0.25, clampedLength);
                    resizing.clip.trimStart = Math.max(0, clampedTrimStart);
                }
                // stretchMode, originalLength, and stretchedLength stay unchanged
                
            } else {
                // STRETCH LEFT: Time-stretch the audio to fit new length
                const newStart = Math.max(0, resizing.originalStart + deltaBars);
                const startChange = newStart - resizing.originalStart;
                
                resizing.clip.startBar = newStart;
                resizing.clip.length = Math.max(0.25, resizing.originalLength - startChange);
                
                // originalLength should NEVER change after initial clip creation
                // Don't overwrite it during resize operations
                
                // Update stretchedLength when actively stretching
                if (Math.abs(resizing.clip.length - resizing.clip.originalLength) > 0.01) {
                    resizing.clip.stretchMode = true;
                    resizing.clip.stretchedLength = resizing.clip.length;
                } else if (!resizing.clip.stretchedLength || resizing.clip.stretchedLength === resizing.clip.originalLength) {
                    // Only reset if there was no previous stretch
                    resizing.clip.stretchMode = false;
                    resizing.clip.stretchedLength = resizing.clip.originalLength;
                }
                
            }
        } else if (resizing.edge === 'right') {
            if (arrangementState.editMode === 'stretch') {
                // STRETCH RIGHT: Time-stretch to fit new length
                resizing.clip.length = Math.max(0.25, resizing.originalLength + deltaBars);
                
                // originalLength should NEVER change after initial clip creation
                // Don't overwrite it during resize operations
                
                // Update stretchedLength when actively stretching
                if (Math.abs(resizing.clip.length - resizing.clip.originalLength) > 0.01) {
                    resizing.clip.stretchMode = true;
                    resizing.clip.stretchedLength = resizing.clip.length;
                } else if (!resizing.clip.stretchedLength || resizing.clip.stretchedLength === resizing.clip.originalLength) {
                    // Only reset if there was no previous stretch
                    resizing.clip.stretchMode = false;
                    resizing.clip.stretchedLength = resizing.clip.originalLength;
                }
                
            } else {
                // TRIM RIGHT
                const newLength = Math.max(0.25, resizing.originalLength + deltaBars);
                
                // Clamp: Can't expand beyond the available length (originalLength or stretchedLength)
                const maxLength = resizing.clip.stretchMode ? resizing.clip.stretchedLength : resizing.clip.originalLength;
                const availableLength = maxLength - resizing.clip.trimStart;
                
                resizing.clip.length = Math.min(newLength, availableLength);
                // stretchMode, originalLength, and stretchedLength stay unchanged
                
            }
        }
        
        // Update DOM position/size immediately for responsive feel
        const clipEl = tracksContainer.querySelector(`[data-clip-id="${resizing.clip.id}"]`);
        if (clipEl) {
            const barWidth = 100 * arrangementState.zoom;
            clipEl.style.left = (resizing.clip.startBar * barWidth + 2) + 'px';
            clipEl.style.width = (resizing.clip.length * barWidth - 2) + 'px';
            
            // Throttled waveform update for trim mode so you can see what you're trimming
            const now = Date.now();
            if (arrangementState.editMode === 'trim' && now - lastWaveformUpdate > WAVEFORM_UPDATE_INTERVAL) {
                lastWaveformUpdate = now;
                
                // Only re-render this specific clip's waveform
                const canvas = clipEl.querySelector('canvas');
                if (canvas && resizing.clip.type === 'sample') {
                    let buffer = null;
                    if (resizing.clip.isFromFolder && folderAudioBuffers[resizing.clip.data]) {
                        buffer = folderAudioBuffers[resizing.clip.data];
                    } else if (sampleBuffers[resizing.clip.data]) {
                        buffer = sampleBuffers[resizing.clip.data];
                    }
                    
                    if (buffer) {
                        // Update canvas size to match clip
                        const clipWidth = resizing.clip.length * barWidth - 4;
                        canvas.width = clipWidth;
                        drawWaveform(canvas, buffer, resizing.clip);
                    }
                }
            }
        }
    };
    
    const handleMouseUp = () => {
        document.body.style.cursor = 'default';
        const resizedClip = arrangementState.resizingClip ? arrangementState.resizingClip.clip : null;
        
        // Store original and final values for undo/redo
        if (resizedClip && arrangementState.resizingClip) {
            const originalStart = arrangementState.resizingClip.originalStart;
            const originalLength = arrangementState.resizingClip.originalLength;
            const originalTrimStart = arrangementState.resizingClip.originalTrimStart;
            const originalTrimEnd = arrangementState.resizingClip.originalTrimEnd;
            
            const finalStart = resizedClip.startBar;
            const finalLength = resizedClip.length;
            const finalTrimStart = resizedClip.trimStart || 0;
            const finalTrimEnd = resizedClip.trimEnd || 0;
            const finalStretchMode = resizedClip.stretchMode;
            
            // Check if anything actually changed
            if (originalStart !== finalStart || originalLength !== finalLength || 
                originalTrimStart !== finalTrimStart || originalTrimEnd !== finalTrimEnd) {
                
                window.undoManager.execute(
                    new Command(
                        'Resize Clip',
                        () => {
                            resizedClip.startBar = finalStart;
                            resizedClip.length = finalLength;
                            resizedClip.trimStart = finalTrimStart;
                            resizedClip.trimEnd = finalTrimEnd;
                            resizedClip.stretchMode = finalStretchMode;
                            renderAllClips();
                            saveArrangement(false);
                        },
                        () => {
                            resizedClip.startBar = originalStart;
                            resizedClip.length = originalLength;
                            resizedClip.trimStart = originalTrimStart;
                            resizedClip.trimEnd = originalTrimEnd;
                            renderAllClips();
                            saveArrangement(false);
                        }
                    )
                );
            }
        }
        
        arrangementState.resizingClip = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Prevent click event from firing after resize
        arrangementState.justFinishedResize = true;
        setTimeout(() => {
            arrangementState.justFinishedResize = false;
        }, 100);
        
        // Re-render the clip if it's currently playing
        if (resizedClip && arrangementState.isPlaying && audioContext) {
            // Stop all currently scheduled audio sources
            arrangementState.scheduledSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {}
            });
            arrangementState.scheduledSources = [];
            arrangementState.scheduledClipIds.clear();
            
            // Re-schedule clips from current position
            scheduleClips();
        }
        
        // Redraw all clips to update waveforms with correct trim/stretch state
        renderAllClips();
        if (resizedClip) {
            saveArrangement(false);
        }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function renderSampleClip(clipEl, clip) {
    // Create canvas for waveform
    const canvas = document.createElement('canvas');
    const clipWidth = clip.length * 100 * arrangementState.zoom - 4;
    
    // CRITICAL FIX: Limit canvas size to prevent blank white clips at high zoom
    // Use CSS scaling instead of massive canvas dimensions
    const MAX_CANVAS_WIDTH = 4096; // Browser limit, prevents white clips
    const actualCanvasWidth = Math.min(clipWidth, MAX_CANVAS_WIDTH);
    
    canvas.width = actualCanvasWidth;
    canvas.height = 50;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    
    // Add label
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.top = '5px';
    label.style.left = '5px';
    label.style.fontSize = '10px';
    label.style.fontWeight = 'bold';
    label.style.color = 'white';
    label.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    label.style.zIndex = '1';
    
    // Display proper label based on sample type
    if (typeof clip.data === 'string') {
        if (clip.data.startsWith('custom_')) {
            label.textContent = `Custom ${clip.data.replace('custom_', '')}`;
        } else if (clip.data.startsWith('recording_')) {
            label.textContent = `Recording ${clip.data.replace('recording_', '')}`;
        } else {
            // Folder sample or other string-based sample
            label.textContent = clip.data;
        }
    } else {
        label.textContent = `Sample ${clip.data}`;
    }
    
    clipEl.appendChild(canvas);
    clipEl.appendChild(label);
    
    // Draw waveform if sample is loaded (NEW: Check both sampleBuffers and folderAudioBuffers)
    let audioBuffer = null;
    
    if (clip.isFromFolder && folderAudioBuffers[clip.data]) {
        // Folder sample
        audioBuffer = folderAudioBuffers[clip.data];
        drawWaveform(canvas, audioBuffer, clip);
    } else if (sampleBuffers[clip.data]) {
        // Standard or custom sample
        audioBuffer = sampleBuffers[clip.data];
        drawWaveform(canvas, audioBuffer, clip);
    } else if (typeof clip.data === 'number') {
        // Numbered sample - load if not already loaded
        loadSampleBuffer(clip.data).then(() => {
            if (sampleBuffers[clip.data]) {
                drawWaveform(canvas, sampleBuffers[clip.data], clip);
            }
        });
    }
}

function drawWaveform(canvas, audioBuffer, clip) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get audio data (use left channel)
    const fullData = audioBuffer.getChannelData(0);
    
    // Calculate which portion of the audio to display based on mode
    const trimStart = clip.trimStart || 0;
    const sampleRate = audioBuffer.sampleRate;
    const referenceBarsPerSecond = 120 / 60 / 4; // 0.5 bars per second at 120 BPM
    
    let startSample, endSample, actualSamples;
    
    if (clip.stretchMode === true) {
        // STRETCH MODE: Use stretchedLength to calculate the ratio
        const originalBars = clip.originalLength || clip.length;
        const stretchedBars = clip.stretchedLength || clip.originalLength || clip.length;
        const originalDurationSeconds = originalBars / referenceBarsPerSecond;
        const totalSamples = Math.floor(originalDurationSeconds * sampleRate);
        
        // The stretch ratio based on stretchedLength (before trim)
        const stretchRatio = stretchedBars / originalBars;
        
        // trimStart is in stretched bar units
        const trimStartProportion = trimStart / stretchedBars;
        const trimStartSamples = Math.floor(trimStartProportion * totalSamples);
        
        // clip.length is the current visible length (after trim)
        const clipLengthProportion = clip.length / stretchedBars;
        const clipLengthInOriginalSamples = Math.floor(clipLengthProportion * totalSamples);
        
        startSample = Math.min(trimStartSamples, totalSamples);
        endSample = Math.min(startSample + clipLengthInOriginalSamples, totalSamples);
        actualSamples = endSample - startSample;
        
    } else {
        // TRIM MODE (no stretch): Show samples at original density
        const originalBars = clip.originalLength || clip.length;
        const originalDurationSeconds = originalBars / referenceBarsPerSecond;
        const totalSamples = Math.floor(originalDurationSeconds * sampleRate);
        
        // trimStart is in bars - convert to samples at ORIGINAL scale
        const trimStartSamples = Math.floor((trimStart / originalBars) * totalSamples);
        
        // clip.length is how many bars we're showing - convert to samples at ORIGINAL scale
        const clipLengthSamples = Math.floor((clip.length / originalBars) * totalSamples);
        
        startSample = Math.min(trimStartSamples, totalSamples);
        endSample = Math.min(trimStartSamples + clipLengthSamples, totalSamples);
        actualSamples = endSample - startSample;
        
    }
    
    // IMPROVED: Use higher resolution sampling for better quality
    // Calculate samples per pixel - we'll scan ALL samples in each pixel range
    const samplesPerPixel = actualSamples / width;
    const amp = height / 2;
    
    // Draw waveform with proper peak detection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(0, amp);
    
    // For each pixel, find the TRUE min/max by scanning all samples in that pixel's range
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        
        // Calculate the exact sample range for this pixel
        const pixelStartSample = startSample + Math.floor(i * samplesPerPixel);
        const pixelEndSample = startSample + Math.floor((i + 1) * samplesPerPixel);
        
        // Scan ALL samples in this pixel's range to find true peaks
        for (let sampleIndex = pixelStartSample; sampleIndex < pixelEndSample && sampleIndex < endSample; sampleIndex++) {
            const datum = fullData[sampleIndex];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        
        // Use absolute values for better spike visibility
        const absMax = Math.max(Math.abs(min), Math.abs(max));
        
        // Draw from center outward (symmetrical waveform)
        const yTop = amp - (absMax * amp);
        const yBottom = amp + (absMax * amp);
        
        // Draw vertical line for this pixel
        ctx.fillRect(i, yTop, 1, yBottom - yTop);
    }
    
    ctx.stroke();
}

function renderPatternClip(clipEl, clip) {
    // Create canvas for piano roll visualization
    const canvas = document.createElement('canvas');
    const clipWidth = clip.length * 100 * arrangementState.zoom - 4;
    canvas.width = clipWidth;
    canvas.height = 50;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    
    // Add label
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.top = '5px';
    label.style.left = '5px';
    label.style.fontSize = '10px';
    label.style.fontWeight = 'bold';
    label.style.color = 'white';
    label.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    label.style.zIndex = '1';
    label.textContent = clip.data;
    
    clipEl.appendChild(canvas);
    clipEl.appendChild(label);
    
    // Draw piano roll
    const pattern = arrangementState.patterns[clip.data];
    if (pattern && pattern.notes) {
        drawPianoRoll(canvas, pattern, clip);
    }
}

function drawPianoRoll(canvas, pattern, clip) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas - Use transparent background to allow custom clip colors to show through
    // If clip has custom color, make canvas transparent; otherwise use default dark background
    if (clip.customColor) {
        ctx.clearRect(0, 0, width, height);
        // Add semi-transparent overlay for better note visibility
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
    } else {
        // Default dark background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
    }
    
    // Calculate pattern dimensions
    const patternLengthBars = pattern.length || 1;
    const patternSteps = patternLengthBars * 16; // 16 steps per bar
    const clipSteps = clip.length * 16;
    const stepWidth = width / clipSteps;
    
    // Define note range for display (wider range for better visualization)
    const noteNames = ['C6', 'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5',
                       'C5', 'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4',
                       'C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3'];
    const noteHeight = height / noteNames.length;
    
    // Draw subtle alternating piano key background (white/black key colors)
    for (let i = 0; i < noteNames.length; i++) {
        const noteName = noteNames[i];
        const isBlackKey = noteName.includes('#');
        const y = i * noteHeight;
        
        // Darker shade for black keys, lighter for white keys (very subtle)
        ctx.fillStyle = isBlackKey ? 'rgba(10, 10, 10, 0.5)' : 'rgba(25, 25, 25, 0.3)';
        ctx.fillRect(0, y, width, noteHeight);
    }
    
    // Draw subtle grid lines (horizontal - for notes)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= noteNames.length; i++) {
        const y = i * noteHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Draw subtle vertical grid lines (every 4 steps - quarter note)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i <= clipSteps; i += 4) {
        const x = i * stepWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Stronger vertical lines for bar markers (every 16 steps)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= clipSteps; i += 16) {
        const x = i * stepWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Calculate how many times to repeat the pattern
    const repetitions = Math.ceil(clip.length / patternLengthBars);
    
    // Draw each repetition of notes
    for (let rep = 0; rep < repetitions; rep++) {
        const repOffsetSteps = rep * patternSteps;
        
        pattern.notes.forEach(note => {
            const noteIndex = noteNames.indexOf(note.note);
            if (noteIndex === -1) return; // Skip notes outside our range
            
            const globalStep = repOffsetSteps + note.step;
            
            // Only draw if within clip bounds
            if (globalStep >= clipSteps) return;
            
            const x = globalStep * stepWidth;
            const y = noteIndex * noteHeight;
            
            // Colorful note blocks with gradient
            // Use orange/gold color scheme
            const gradient = ctx.createLinearGradient(x, y, x, y + noteHeight);
            gradient.addColorStop(0, 'rgba(255, 180, 50, 0.95)'); // Bright orange-gold
            gradient.addColorStop(0.5, 'rgba(255, 150, 30, 0.9)'); // Mid orange
            gradient.addColorStop(1, 'rgba(230, 120, 20, 0.85)'); // Darker orange
            
            ctx.fillStyle = gradient;
            
            // Draw note rectangle with slight padding
            const notePadding = 0.5;
            ctx.fillRect(
                x + notePadding, 
                y + notePadding, 
                stepWidth - (notePadding * 2), 
                noteHeight - (notePadding * 2)
            );
            
            // Add bright border
            ctx.strokeStyle = 'rgba(255, 220, 100, 0.8)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(
                x + notePadding, 
                y + notePadding, 
                stepWidth - (notePadding * 2), 
                noteHeight - (notePadding * 2)
            );
            
            // Add subtle highlight on top edge for 3D effect
            ctx.strokeStyle = 'rgba(255, 255, 200, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + notePadding, y + notePadding + 1);
            ctx.lineTo(x + stepWidth - notePadding, y + notePadding + 1);
            ctx.stroke();
        });
    }
}

// Fast clip position update during zoom (no waveform re-render)
// Ultra-fast zoom: Just update CSS transforms, no canvas redraws
function updateClipTransformsOnly() {
    const barWidth = 100 * arrangementState.zoom;
    
    arrangementState.clips.forEach(clip => {
        const clipEl = tracksContainer.querySelector(`[data-clip-id="${clip.id}"]`);
        if (clipEl) {
            // Ultra-fast: Just update position and width via CSS
            clipEl.style.left = (clip.startBar * barWidth + 2) + 'px';
            clipEl.style.width = (clip.length * barWidth - 2) + 'px';
        }
    });
}

function updateClipPositionsOnly() {
    const barWidth = 100 * arrangementState.zoom;
    
    arrangementState.clips.forEach(clip => {
        const clipEl = tracksContainer.querySelector(`[data-clip-id="${clip.id}"]`);
        if (clipEl) {
            // Update position and size only - keep existing canvas/content
            clipEl.style.left = (clip.startBar * barWidth + 2) + 'px';
            clipEl.style.width = (clip.length * barWidth - 2) + 'px';
            
            // Update canvas width if exists
            const canvas = clipEl.querySelector('canvas');
            if (canvas) {
                const clipWidth = clip.length * barWidth - 4;
                canvas.width = clipWidth;
                canvas.style.width = '100%';
            }
        }
    });
}

// Optimized wrapper - debounces frequent calls
function renderAllClips() {
    debounceRenderAllClips();
}

// Actual rendering function (called by debounced wrapper)
function _renderAllClipsImmediate() {
    // Clear all clips from DOM
    tracksContainer.querySelectorAll('.clip').forEach(el => el.remove());
    
    // Re-render all clips
    arrangementState.clips.forEach(clip => renderClip(clip));
    
    // Update grid to accommodate any new clip lengths
    updateTrackBackgrounds();
    renderTimeline();
}

function deleteClip(clipId) {
    // Find and store the clip before deleting
    const clipToDelete = arrangementState.clips.find(c => c.id === clipId);
    if (!clipToDelete) return;
    
    // Store the clip data for undo
    const deletedClip = JSON.parse(JSON.stringify(clipToDelete));
    
    window.undoManager.execute(
        new Command(
            'Delete Clip',
            () => {
                arrangementState.clips = arrangementState.clips.filter(c => c.id !== clipId);
                const clipEl = tracksContainer.querySelector(`[data-clip-id="${clipId}"]`);
                if (clipEl) clipEl.remove();
                saveArrangement(false);
                updateTrackBackgrounds();
                renderTimeline();
            },
            () => {
                arrangementState.clips.push(deletedClip);
                renderAllClips();
                saveArrangement(false);
            }
        )
    );
}

// ========== NEW SAMPLE ==========
function handleNewSample() {
    // Show beautiful dialog instead of alert/confirm
    showNewSampleDialog();
}

function handleSampleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Initialize audio context if needed
    if (!audioContext) {
        initAudioContext();
    }
    
    if (!audioContext) {
        alert('Could not initialize audio. Please try again.');
        return;
    }
    
    // IMPORTANT: Get the full file path (Electron provides this)
    const filePath = file.path;
    
    // Validate and store the original file path
    if (filePath) {

    } else {
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target.result;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Use the actual filename as the key (with "custom_" prefix for identification)
            const fileName = file.name; // Keep full filename with extension
            const sampleKey = `custom_${fileName}`;
            
            // If already exists, add timestamp to make unique
            let finalKey = sampleKey;
            if (sampleBuffers[finalKey]) {
                finalKey = `custom_${Date.now()}_${fileName}`;
            }
            
            // Add to sampleBuffers
            sampleBuffers[finalKey] = audioBuffer;
            
            // IMPORTANT: Remember the original file path (for later copying)
            if (filePath) {
                customSampleOriginalPaths[finalKey] = filePath;

            }

            // AUTO-SELECT the newly uploaded sample (no need to rebuild whole dropdown)
            const sampleSelect = document.getElementById('arr-sample-select');
            
            // Add to dropdown if not exists
            if (!Array.from(sampleSelect.options).some(opt => opt.value === finalKey)) {
                const option = document.createElement('option');
                option.value = finalKey;
                option.textContent = fileName; // Show filename without "custom_" prefix
                sampleSelect.appendChild(option);
            }
            
            sampleSelect.value = finalKey;
            
            // Activate place mode for the sample
            arrangementState.placeMode = {type: 'sample', data: finalKey};
            patternDropdown.value = ''; // Clear pattern dropdown

            // Removed alert: just save and close
            if (typeof stopPianoRollPreview === 'function') stopPianoRollPreview();
            if (patternEditorPopup) patternEditorPopup.classList.remove('active');
        } catch (error) {
            alert('Error loading audio file. Please try a different file.');
        }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset input
    event.target.value = '';
}

let mediaRecorder = null;
let recordedChunks = [];

function startRecording() {
    // Initialize audio context if needed
    if (!audioContext) {
        initAudioContext();
    }
    
    if (!audioContext) {
        alert('Could not initialize audio. Please try again.');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                
                try {
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Find next available recording number
                    let recordNum = 1;
                    while (sampleBuffers[`recording_${recordNum}`]) {
                        recordNum++;
                    }
                    
                    const sampleKey = `recording_${recordNum}`;
                    
                    // Add to sampleBuffers
                    sampleBuffers[sampleKey] = audioBuffer;
                    
                    // Update dropdown
                    updateSampleDropdown();
                    
                    // AUTO-SELECT the newly recorded sample
                    const sampleSelect = document.getElementById('arr-sample-select');
                    sampleSelect.value = sampleKey;
                    
                    // Activate place mode for the recording
                    arrangementState.placeMode = {type: 'sample', data: sampleKey};
                    patternDropdown.value = ''; // Clear pattern dropdown

                    // Show success message without alert

                } catch (error) {
                    alert('Error processing recording. Please try again.');
                }
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();

            // Show stop button with proper timing
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    const stopRecording = confirm('Recording in progress... Click OK to stop.');
                    if (stopRecording) {
                        mediaRecorder.stop();

                    }
                }
            }, 100);
        })
        .catch(error => {
            alert('Could not access microphone. Please check permissions.');
        });
}

/**
 * Load samples from a selected folder
 */
function loadSamplesFromFolder(files) {
    return new Promise(async (resolve) => {
        if (!audioContext) {
            initAudioContext();
        }
        
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
        let loadedCount = 0;
        let processedCount = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = file.name.toLowerCase();
            
            // Check if file is audio
            const isAudio = audioExtensions.some(ext => fileName.endsWith(ext));
            if (!isAudio) {
                processedCount++;
                continue;
            }
            
            // Read and load audio file
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Create sample key from file name
                    const sampleName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
                    const sampleKey = `folder_${Date.now()}_${loadedCount}`;
                    
                    // Add to sampleBuffers
                    sampleBuffers[sampleKey] = audioBuffer;
                    loadedCount++;

                } catch (error) {
                }
                
                processedCount++;
                if (processedCount === files.length) {
                    // Update dropdown after all files processed
                    updateSampleDropdown();

                    resolve(loadedCount);
                }
            };
            
            reader.readAsArrayBuffer(file);
        }
    });
}

function updateSampleDropdown() {
    const dropdown = document.getElementById('arr-sample-select');
    
    // Clear existing options except the first one
    dropdown.innerHTML = '<option value="">-- Select Sample --</option>';



    // Add folder samples FIRST and ONLY if folder is loaded
    if (folderSamplesLoaded && folderAudioBuffers && Object.keys(folderAudioBuffers).length > 0) {
        
        Object.keys(folderAudioBuffers).forEach(fileName => {
            const option = document.createElement('option');
            option.value = fileName;
            option.textContent = `📁 ${fileName}`;
            dropdown.appendChild(option);
        });
    } else {

        // Show numbered samples 1-100 only if NOT using folder samples
        for (let i = 1; i <= 100; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Sample ${i}`;
            dropdown.appendChild(option);
        }
    }
    
    // Add custom uploaded samples
    Object.keys(sampleBuffers).forEach(key => {
        if (key.startsWith('custom_')) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `Custom ${key.replace('custom_', '')}`;
            dropdown.appendChild(option);
        }
    });
    
    // Add recorded samples
    Object.keys(sampleBuffers).forEach(key => {
        if (key.startsWith('recording_')) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `Recording ${key.replace('recording_', '')}`;
            dropdown.appendChild(option);
        }
    });
}

// ========== PATTERN EDITOR ==========
// Save pattern as MIDI file
async function savePatternAsMIDI(data) {
    // Get pattern name from input or generate default
    const patternNameInput = document.getElementById('pattern-name-input');
    let patternName = patternNameInput && patternNameInput.value.trim() ? patternNameInput.value.trim() : null;
    
    // If no name provided, generate default name
    if (!patternName) {
        patternName = `Pattern ${Object.keys(arrangementState.patterns).length + 1}`;
    }
    
    arrangementState.patterns[patternName] = {
        notes: JSON.parse(JSON.stringify(data.notes)),
        soundSource: data.soundSource,
        soundDesign: data.soundDesign ? JSON.parse(JSON.stringify(data.soundDesign)) : undefined,
        gridWidth: data.gridWidth,
        length: Math.ceil(data.gridWidth / 16),
        effects: data.effects ? JSON.parse(JSON.stringify(data.effects)) : undefined,
        lfos: data.lfos ? JSON.parse(JSON.stringify(data.lfos)) : undefined  // SAVE LFOs!
    };

    updatePatternDropdown();
    // Auto-select and activate place mode for pattern
    const patternDropdown = document.getElementById('arr-pattern-select');
    patternDropdown.value = patternName;
    arrangementState.placeMode = {type: 'pattern', data: patternName};
    sampleDropdown.value = '';
    // Removed alert: just save and close
    if (typeof stopPianoRollPreview === 'function') stopPianoRollPreview();
    if (patternEditorPopup) patternEditorPopup.classList.remove('active');
}

// Dynamically load Tonejs/Midi library
function loadTonejsMidiLibrary() {
    return new Promise((resolve, reject) => {
        if (window.Tone && window.Tone.Midi) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/build/Midi.min.js';
        script.onload = () => {
            window.Tone = window.Tone || {};
            window.Tone.Midi = window.Midi;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Save pattern as audio sample file
async function savePatternAsSample(data) {
    // Render pattern to audio and save as a new sample in sampleBuffers
    const sampleRate = 44100;
    // FIXED: Use reference tempo (120 BPM) for consistent pattern length regardless of current tempo
    // This ensures a 1-bar pattern always takes 1 bar on the grid, no matter what BPM it was created at
    const referenceTempo = 120; // Always use 120 BPM as reference for grid alignment
    const beatDuration = 60 / referenceTempo;
    const stepDuration = beatDuration / 4; // 16th note at 120 BPM
    // Find the end time of the last note
    let lastNoteEnd = 0;
    data.notes.forEach(note => {
        const noteEnd = (note.col * stepDuration) + ((note.length || 1) * stepDuration);
        if (noteEnd > lastNoteEnd) lastNoteEnd = noteEnd;
    });
    // Ensure exported duration covers the full grid width (use gridWidth as minimum).
    const gridDuration = (data.gridWidth || 16) * stepDuration;
    const duration = Math.max(gridDuration, lastNoteEnd);
    // OfflineAudioContext expects an integer frame count for the length parameter
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(sampleRate * duration), sampleRate);
    // Determine effects (try to use pattern-level effects if available)
    let effects = null;
    try {
        if (typeof currentSampleForPopup === 'string' && arrangementState.patterns && arrangementState.patterns[currentSampleForPopup] && arrangementState.patterns[currentSampleForPopup].effects) {
            effects = JSON.parse(JSON.stringify(arrangementState.patterns[currentSampleForPopup].effects));
        } else if (data.effects) {
            effects = JSON.parse(JSON.stringify(data.effects));
        }
    } catch (e) {
        effects = data.effects || null;
    }

    // Create a master gain and connect to destination
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 2.0; // Increased to match preview/playback volume
    masterGain.connect(offlineCtx.destination);

    // Normalize LFOs in effects if present
    if (effects && (!effects.lfos || !Array.isArray(effects.lfos))) {
        effects.lfos = [
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 }
        ];
    }

    // Render each note. If soundDesign (synth) exists, render dual oscillators with ADSR + LFOs
    data.notes.forEach(note => {
        const time = note.col * stepDuration;
        const noteDuration = (note.length || 1) * stepDuration;

        const frequency = rowToFrequency(note.row);

        // Prefer soundDesign (synth) rendering
        const sd = (data && data.soundDesign) ? data.soundDesign : null;
        if (sd) {
            try {
                // Ensure all properties exist with defaults
                const soundDesign = {
                    masterVolume: sd.masterVolume || 70,
                    osc1: { 
                        wave: sd.osc1?.wave || 'sine', 
                        detune: sd.osc1?.detune || 0, 
                        level: sd.osc1?.level || 50,
                        octave: sd.osc1?.octave || 0,
                        phase: sd.osc1?.phase || 0,
                        pan: sd.osc1?.pan || 0
                    },
                    osc2: { 
                        wave: sd.osc2?.wave || 'sawtooth', 
                        detune: sd.osc2?.detune || 0, 
                        level: sd.osc2?.level || 50,
                        octave: sd.osc2?.octave || 0,
                        phase: sd.osc2?.phase || 0,
                        pan: sd.osc2?.pan || 0
                    },
                    unison: sd.unison || { voices: 1, detune: 10, pan: 50 },
                    filter: { 
                        type: sd.filter?.type || 'lowpass', 
                        cutoff: sd.filter?.cutoff || 2000, 
                        resonance: sd.filter?.resonance || 0,
                        envAmount: sd.filter?.envAmount || 0
                    },
                    envelope: { 
                        attack: sd.envelope?.attack || 10, 
                        decay: sd.envelope?.decay || 100, 
                        sustain: sd.envelope?.sustain || 70, 
                        release: sd.envelope?.release || 200 
                    }
                };

                // Apply octave shifts
                const osc1OctaveShift = Math.pow(2, soundDesign.osc1.octave);
                const osc2OctaveShift = Math.pow(2, soundDesign.osc2.octave);

                // Calculate final frequency with speed/pitch/effects similar to live playback
                let finalFreq = frequency;
                if (effects && effects.speed) finalFreq *= effects.speed;
                if (effects && effects.pitch && effects.pitch !== 0) finalFreq *= Math.pow(2, effects.pitch / 12);

                const osc1Frequency = finalFreq * osc1OctaveShift;
                const osc2Frequency = finalFreq * osc2OctaveShift;

                // Check if unison is enabled (when voices > 1)
                const unisonVoices = soundDesign.unison.voices > 1 ? soundDesign.unison.voices : 1;
                const unisonDetune = soundDesign.unison.detune || 10;
                const unisonPan = (soundDesign.unison.pan || 50) / 100;

                // Create oscillators (with unison support)
                const osc1Array = [];
                const osc2Array = [];
                const osc1GainArray = [];
                const osc2GainArray = [];

                // Helper function to create oscillator with phase offset
                function createOscillatorWithPhase(context, waveType, frequency, phase) {
                    const osc = context.createOscillator();
                    
                    if (phase !== 0) {
                        // Create custom PeriodicWave with phase offset
                        const phaseRadians = (phase / 360) * Math.PI * 2;
                        const size = 4096;
                        const real = new Float32Array(size);
                        const imag = new Float32Array(size);
                        
                        // Generate harmonics for different wave types with phase offset
                        if (waveType === 'sine') {
                            real[1] = Math.cos(phaseRadians);
                            imag[1] = Math.sin(phaseRadians);
                        } else if (waveType === 'square') {
                            for (let n = 1; n < size; n += 2) {
                                real[n] = (4 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                                imag[n] = (4 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                            }
                        } else if (waveType === 'sawtooth' || waveType === 'custom') {
                            for (let n = 1; n < size; n++) {
                                real[n] = -(2 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                                imag[n] = -(2 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                            }
                        } else if (waveType === 'triangle') {
                            for (let n = 1; n < size; n += 2) {
                                const sign = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
                                real[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.cos(n * phaseRadians);
                                imag[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.sin(n * phaseRadians);
                            }
                        }
                        
                        const wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
                        osc.setPeriodicWave(wave);
                    } else {
                        osc.type = waveType === 'custom' ? 'sawtooth' : waveType;
                    }
                    
                    osc.frequency.value = frequency;
                    return osc;
                }

                // Create unison voices
                for (let v = 0; v < unisonVoices; v++) {
                    const voiceDetune = unisonVoices > 1 
                        ? ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                        : 0;

                    const osc1Phase = soundDesign.osc1.phase || 0;
                    const osc2Phase = soundDesign.osc2.phase || 0;

                    const osc1 = createOscillatorWithPhase(offlineCtx, soundDesign.osc1.wave, osc1Frequency, osc1Phase);
                    const osc2 = createOscillatorWithPhase(offlineCtx, soundDesign.osc2.wave, osc2Frequency, osc2Phase);

                    osc1.detune.value = soundDesign.osc1.detune + voiceDetune;
                    osc2.detune.value = soundDesign.osc2.detune + voiceDetune;

                    const g1 = offlineCtx.createGain();
                    const g2 = offlineCtx.createGain();

                    // Apply stereo width for unison
                    if (unisonVoices > 1 && unisonPan > 0) {
                        const panPosition = ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonPan;
                        const panner = offlineCtx.createStereoPanner();
                        panner.pan.value = Math.max(-1, Math.min(1, panPosition));

                        osc1.connect(g1);
                        osc2.connect(g2);
                        g1.connect(panner);
                        g2.connect(panner);
                        g1.panner = panner;
                        g2.panner = panner;
                    } else {
                        osc1.connect(g1);
                        osc2.connect(g2);
                    }

                    osc1Array.push(osc1);
                    osc2Array.push(osc2);
                    osc1GainArray.push(g1);
                    osc2GainArray.push(g2);
                }

                // Master gains for osc1 and osc2
                const osc1MasterGain = offlineCtx.createGain();
                const osc2MasterGain = offlineCtx.createGain();

                // Connect all voice gains to master gains
                osc1GainArray.forEach(gain => {
                    if (gain.panner) {
                        gain.panner.connect(osc1MasterGain);
                    } else {
                        gain.connect(osc1MasterGain);
                    }
                });
                osc2GainArray.forEach(gain => {
                    if (gain.panner) {
                        gain.panner.connect(osc2MasterGain);
                    } else {
                        gain.connect(osc2MasterGain);
                    }
                });

                // Set voice levels
                const voiceLevelScale = 1 / Math.sqrt(unisonVoices);
                osc1GainArray.forEach(gain => {
                    gain.gain.value = voiceLevelScale;
                });
                osc2GainArray.forEach(gain => {
                    gain.gain.value = voiceLevelScale;
                });

                // Get volume multiplier from effects (same as preview playback)
                const volumeMultiplier = effects && effects.volume ? effects.volume / 100 : 1;

                // Set master oscillator levels with proper gain staging
                const masterVolume = soundDesign.masterVolume / 100;
                const osc1Level = soundDesign.osc1.level / 100;
                const osc2Level = soundDesign.osc2.level / 100;
                const totalLevel = osc1Level + osc2Level;
                const normalizationFactor = totalLevel > 0 ? 1 / Math.max(totalLevel, 1) : 1;

                osc1MasterGain.gain.value = osc1Level * normalizationFactor * masterVolume * volumeMultiplier;
                osc2MasterGain.gain.value = osc2Level * normalizationFactor * masterVolume * volumeMultiplier;

                // Create filter
                const filter = offlineCtx.createBiquadFilter();
                filter.type = soundDesign.filter.type;
                const baseCutoff = Math.max(20, soundDesign.filter.cutoff);
                filter.frequency.value = baseCutoff;
                filter.Q.value = soundDesign.filter.resonance / 10;

                // Create envelope
                const env = offlineCtx.createGain();

                // Connect graph
                osc1MasterGain.connect(filter);
                osc2MasterGain.connect(filter);
                filter.connect(env);
                env.connect(masterGain);

                // ADSR envelope - Use exponential ramps to prevent clicks
                const now = time;
                const attack = Math.max(0.001, soundDesign.envelope.attack / 1000);
                const decay = Math.max(0.001, soundDesign.envelope.decay / 1000);
                const sustainLevel = soundDesign.envelope.sustain / 100;
                const release = Math.max(0.01, soundDesign.envelope.release / 1000);

                const minValue = 0.0001;
                env.gain.setValueAtTime(minValue, now);
                env.gain.exponentialRampToValueAtTime(1, now + attack);
                const sustainValue = Math.max(minValue, sustainLevel);
                env.gain.exponentialRampToValueAtTime(sustainValue, now + attack + decay);
                env.gain.setValueAtTime(sustainValue, now + noteDuration);
                env.gain.exponentialRampToValueAtTime(minValue, now + noteDuration + release);

                // Apply Filter Envelope if amount is set
                const filterEnvAmount = soundDesign.filter.envAmount || 0;
                if (filterEnvAmount !== 0) {
                    const filterEnvRange = Math.abs(filterEnvAmount) / 100 * 10000;
                    const filterTargetCutoff = filterEnvAmount > 0 
                        ? Math.min(20000, baseCutoff + filterEnvRange)
                        : Math.max(20, baseCutoff - filterEnvRange);

                    filter.frequency.setValueAtTime(filterTargetCutoff, now);
                    filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + attack);
                    filter.frequency.setValueAtTime(baseCutoff, now + attack + decay);
                    filter.frequency.setValueAtTime(baseCutoff, now + noteDuration);
                    filter.frequency.exponentialRampToValueAtTime(baseCutoff * 0.5, now + noteDuration + release);
                }

                // Pitch envelope (optional pitchMod in soundDesign)
                if (sd.envelope && sd.envelope.pitchMod && sd.envelope.pitchMod.enabled && sd.envelope.pitchMod.amount) {
                    const pitchAmount = sd.envelope.pitchMod.amount || 0;
                    const maxDetune = pitchAmount * 100;

                    osc1Array.forEach((osc, idx) => {
                        const voiceDetune = unisonVoices > 1 
                            ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                            : 0;
                        const base1 = soundDesign.osc1.detune + voiceDetune;
                        osc.detune.setValueAtTime(base1 + maxDetune, now);
                        osc.detune.linearRampToValueAtTime(base1, now + attack);
                    });

                    osc2Array.forEach((osc, idx) => {
                        const voiceDetune = unisonVoices > 1 
                            ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                            : 0;
                        const base2 = soundDesign.osc2.detune + voiceDetune;
                        osc.detune.setValueAtTime(base2 + maxDetune, now);
                        osc.detune.linearRampToValueAtTime(base2, now + attack);
                    });
                }

                // Apply LFOs from pattern data (piano roll LFOs)
                if (data && data.lfos && Array.isArray(data.lfos)) {
                    data.lfos.forEach((lfo, idx) => {
                        try {
                            const depth = Number(lfo.depth) || 0;
                            if (!lfo || lfo.target === 'none' || depth === 0) return;

                            // Connect LFO to target AudioParam (pattern-specific targets)
                            switch (lfo.target) {
                                case 'osc1-detune':
                                    osc1Array.forEach(osc => {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 1200; // ±12 semitones
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(osc.detune);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release);
                                    });
                                    break;
                                case 'osc2-detune':
                                    osc2Array.forEach(osc => {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 1200; // ±12 semitones
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(osc.detune);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release);
                                    });
                                    break;
                                case 'filter-cutoff':
                                    {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 2000; // Hz
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(filter.frequency);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release);
                                    }
                                    break;
                                case 'filter-resonance':
                                    {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 30; // Q value
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(filter.Q);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release);
                                    }
                                    break;
                                case 'env-attack':
                                case 'env-decay':
                                case 'env-sustain':
                                case 'env-release':
                                    // Envelope LFOs not easily applied in offline context

                                    lfoOsc.disconnect();
                                    break;
                                default:
                                    lfoOsc.disconnect();
                            }

                            lfoOsc.start(now);
                            lfoOsc.stop(now + noteDuration + release + 0.1);
                        } catch (e) {
                        }
                    });
                }
                
                // Also apply clip-level LFOs (if effects present) for backward compatibility
                if (effects && effects.lfos && Array.isArray(effects.lfos)) {
                    effects.lfos.forEach((lfo, idx) => {
                        try {
                            const depth = Number(lfo.depth) || 0;
                            if (!lfo || lfo.target === 'none' || depth === 0) return;

                            const lfoOsc = offlineCtx.createOscillator();
                            const lfoGain = offlineCtx.createGain();
                            lfoOsc.type = lfo.waveform || 'sine';
                            lfoOsc.frequency.value = Number(lfo.rate) || 1;

                            // Connect LFO to target AudioParam
                            switch (lfo.target) {
                                case 'volume':
                                    // depth is percent of current envelope amplitude; scale to reasonable value
                                    lfoGain.gain.value = (depth / 100) * 0.5; // ±50%
                                    lfoOsc.connect(lfoGain);
                                    lfoGain.connect(env.gain);
                                    break;
                                case 'filter':
                                    lfoGain.gain.value = (depth / 100) * 2000; // Hz
                                    lfoOsc.connect(lfoGain);
                                    lfoGain.connect(filter.frequency);
                                    break;
                                case 'pitch':
                                    // detune in cents - apply to all unison voices
                                    osc1Array.forEach(osc => {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 1200; // cents
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(osc.detune);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release + 0.1);
                                    });
                                    osc2Array.forEach(osc => {
                                        const lfoOsc = offlineCtx.createOscillator();
                                        const lfoGain = offlineCtx.createGain();
                                        lfoOsc.type = lfo.waveform || 'sine';
                                        lfoOsc.frequency.value = Number(lfo.rate) || 1;
                                        lfoGain.gain.value = (depth / 100) * 1200; // cents
                                        lfoOsc.connect(lfoGain);
                                        lfoGain.connect(osc.detune);
                                        lfoOsc.start(now);
                                        lfoOsc.stop(now + noteDuration + release + 0.1);
                                    });
                                    break;
                                case 'delay-time':
                                case 'delay-feedback':
                                case 'pan':
                                default:
                                    // Not supported in offline synth rendering currently
                                    lfoOsc.disconnect();
                                    break;
                            }

                            lfoOsc.start(now);
                            lfoOsc.stop(now + noteDuration + release + 0.1);
                        } catch (e) {
                        }
                    });
                }

                // Apply PWM (Pulse Width Modulation) if enabled
                if (sd.pwm && sd.pwm.enabled && sd.pwm.rate > 0 && sd.pwm.depth > 0) {
                    const pwmRate = sd.pwm.rate; // Hz
                    const pwmDepth = sd.pwm.depth / 100; // 0-1 range
                    const stopAt = now + noteDuration + release + 0.05;
                    
                    // Create PWM LFO for each oscillator array
                    osc1Array.forEach((osc, idx) => {
                        const pwmLFO = offlineCtx.createOscillator();
                        const pwmGain = offlineCtx.createGain();
                        
                        pwmLFO.frequency.value = pwmRate;
                        pwmLFO.type = 'sine'; // Smooth PWM modulation
                        pwmGain.gain.value = pwmDepth * 50; // Scale to reasonable detune amount
                        
                        pwmLFO.connect(pwmGain);
                        pwmGain.connect(osc.detune);
                        
                        pwmLFO.start(now);
                        pwmLFO.stop(stopAt);
                    });
                    
                    osc2Array.forEach((osc, idx) => {
                        const pwmLFO = offlineCtx.createOscillator();
                        const pwmGain = offlineCtx.createGain();
                        
                        pwmLFO.frequency.value = pwmRate;
                        pwmLFO.type = 'sine';
                        pwmGain.gain.value = pwmDepth * 50;
                        
                        pwmLFO.connect(pwmGain);
                        pwmGain.connect(osc.detune);
                        
                        pwmLFO.start(now);
                        pwmLFO.stop(stopAt);
                    });
                }

                // Start all oscillators and schedule stop
                osc1Array.forEach(osc => osc.start(now));
                osc2Array.forEach(osc => osc.start(now));
                const stopAt = now + noteDuration + release + 0.05;
                osc1Array.forEach(osc => osc.stop(stopAt));
                osc2Array.forEach(osc => osc.stop(stopAt));
            } catch (e) {
            }
        } else {
            // Legacy simple sine oscillator fallback
            const osc = offlineCtx.createOscillator();
            const g = offlineCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency;
            g.connect(masterGain);
            osc.connect(g);
            osc.start(time);
            osc.stop(time + noteDuration);
        }
    });
// Convert piano roll row to frequency (C0-B6)
function rowToFrequency(row) {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(row / 12);
    const noteIndex = row % 12;
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    const noteName = noteNames[noteIndex];
    const baseFreq = noteFrequencies[noteName];
    return baseFreq * Math.pow(2, octave);
}
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Get pattern name from input or generate default
    const patternNameInput = document.getElementById('pattern-name-input');
    let baseName = patternNameInput && patternNameInput.value.trim() ? patternNameInput.value.trim() : null;
    
    // If no name provided, use default naming
    if (!baseName) {
        baseName = 'Custom Sample';
    }
    
    // Find next available number for this name
    let customNum = 101;
    let sampleKey = `custom_${baseName}`;
    
    // If key already exists, append a number
    if (sampleBuffers[sampleKey]) {
        customNum = 1;
        while (sampleBuffers[`custom_${baseName}_${customNum}`]) {
            customNum++;
        }
        sampleKey = `custom_${baseName}_${customNum}`;
    }
    
    sampleBuffers[sampleKey] = renderedBuffer;
    updateSampleDropdown();
    // Calculate bar length for the sample using reference tempo (120 BPM)
    // This ensures the sample fits correctly on the grid regardless of current BPM
    const barDuration = beatDuration * 4;
    const sampleBarLength = duration / barDuration;
    // Auto-select and activate place mode for sample, with default clip length
    const sampleSelect = document.getElementById('arr-sample-select');
    sampleSelect.value = sampleKey;
    arrangementState.placeMode = {type: 'sample', data: sampleKey, length: sampleBarLength};
    patternDropdown.value = '';
    // Removed alert: just save and close
    if (typeof stopPianoRollPreview === 'function') stopPianoRollPreview();
    if (patternEditorPopup) patternEditorPopup.classList.remove('active');
}
// Update pattern dropdown UI
function updatePatternDropdown() {
    const patternDropdown = document.getElementById('arr-pattern-select');
    patternDropdown.innerHTML = '<option value="">-- Select Pattern --</option>';
    Object.keys(arrangementState.patterns).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        patternDropdown.appendChild(option);
    });
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer) {
    // Basic WAV encoding for mono
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * numChannels * 2, true);
    // PCM samples
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = buffer.getChannelData(ch)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
function createNewPattern() {
    const popup = document.getElementById('pattern-popup');
    const nameInput = document.getElementById('pattern-name-input');
    
    const patternName = `Pattern ${Object.keys(arrangementState.patterns).length + 1}`;
    nameInput.value = patternName;
    currentSampleForPopup = patternName;
    
    // Always start with a fresh empty pattern, even if pianoRollData already exists
    pianoRollData[patternName] = {
        notes: [],
        soundSource: "synth",
        gridWidth: 16,
        gridHeight: 84, // 7 octaves * 12 notes
        scrollX: 0,
        scrollY: 0,
        soundDesign: {
            masterVolume: 70,
            osc1: { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
            osc2: { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
            filter: { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 },
            envelope: { attack: 10, decay: 100, sustain: 70, release: 200 },
            unison: { voices: 1, detune: 10, pan: 50 },
            pwm: { enabled: false, rate: 0.5, depth: 50 }
        }
    };
    
    initPianoRoll();
    initPianoRollVisualizer();
    initSoundDesignControls();
    popup.classList.add('active');
    
    // Scroll to top when opening
    setTimeout(() => {
        const scrollable = document.getElementById('piano-roll-scrollable');
        if (scrollable) {
            scrollable.scrollTop = 0;
            scrollable.scrollLeft = 0;

        }
    }, 50);
    
    // Save Pattern button
    // For new patterns: hide "Save Pattern" button (use "Save as MIDI" instead)
    const saveBtnEl = document.getElementById('pattern-save-btn');
    const saveMidiBtnEl = document.getElementById('pattern-save-midi-btn');
    const saveSampleBtnEl = document.getElementById('pattern-save-sample-btn');
    if (saveBtnEl) saveBtnEl.style.display = 'none'; // Hide for new patterns
    if (saveMidiBtnEl) saveMidiBtnEl.style.display = '';
    if (saveSampleBtnEl) saveSampleBtnEl.style.display = '';
    if (saveBtnEl) saveBtnEl.textContent = 'Save Pattern';

    // Replace nodes to remove any previous listeners, then attach fresh handlers
    if (saveBtnEl) {
        const newSave = saveBtnEl.cloneNode(true);
        saveBtnEl.parentNode.replaceChild(newSave, saveBtnEl);
        newSave.addEventListener('click', () => {
            const name = nameInput.value.trim() || patternName;
            const data = pianoRollData[currentSampleForPopup];
            arrangementState.patterns[name] = {
                notes: JSON.parse(JSON.stringify(data.notes)),
                soundSource: data.soundSource,
                soundDesign: data.soundDesign ? JSON.parse(JSON.stringify(data.soundDesign)) : undefined,
                gridWidth: data.gridWidth,
                length: Math.ceil(data.gridWidth / 16),
                effects: (arrangementState.patterns[name] && arrangementState.patterns[name].effects)
                    ? JSON.parse(JSON.stringify(arrangementState.patterns[name].effects))
                    : (data.effects ? JSON.parse(JSON.stringify(data.effects)) : undefined),
                lfos: data.lfos ? JSON.parse(JSON.stringify(data.lfos)) : undefined  // SAVE LFOs!
            };
            popup.classList.remove('active');
            stopPianoRollPreview();
            const patternDropdown = document.getElementById('arr-pattern-select');
            const existingOption = patternDropdown.querySelector(`option[value="${name}"]`);
            if (!existingOption) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                patternDropdown.appendChild(option);
            }
            patternDropdown.value = name;
            arrangementState.placeMode = {type: 'pattern', data: name};
            sampleDropdown.value = '';

            if (isEditingPattern && currentEditingPatternName) {
                arrangementState.clips.forEach(clip => {
                    if (clip.type === 'pattern' && clip.data === currentEditingPatternName) {
                        clip.length = Math.ceil(data.gridWidth / 16);
                    }
                });
                renderTimeline();
            }
            isEditingPattern = false;
            currentEditingPatternName = null;

        });
    }

    // Save as MIDI button
    if (saveMidiBtnEl) {
        const newMidi = saveMidiBtnEl.cloneNode(true);
        saveMidiBtnEl.parentNode.replaceChild(newMidi, saveMidiBtnEl);
        newMidi.addEventListener('click', () => {
            const data = pianoRollData[currentSampleForPopup];
            savePatternAsMIDI(data);
        });
    }

    // Save as Sample button
    if (saveSampleBtnEl) {
        const newSample = saveSampleBtnEl.cloneNode(true);
        saveSampleBtnEl.parentNode.replaceChild(newSample, saveSampleBtnEl);
        newSample.addEventListener('click', () => {
            const data = pianoRollData[currentSampleForPopup];
            savePatternAsSample(data);
        });
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('pattern-cancel-btn');
    if (cancelBtn) {
        const newCancel = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        newCancel.addEventListener('click', () => {
            popup.classList.remove('active');
            stopPianoRollPreview();
            // Clear editing state
            isEditingPattern = false;
            currentEditingPatternName = null;

        });
    }
    
    // Close button (×) in header
    const closeBtn = document.getElementById('pattern-popup-close-btn');
    if (closeBtn) {
        const newClose = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newClose.addEventListener('click', () => {
            popup.classList.remove('active');
            stopPianoRollPreview();
            // Clear editing state
            isEditingPattern = false;
            currentEditingPatternName = null;
        });
    }
}

function initPianoRoll() {
    if (!currentSampleForPopup) return;
    
    const pianoKeys = document.getElementById('piano-keys');
    const pianoRollGrid = document.getElementById('piano-roll-grid');
    const pianoRollBarNumbers = document.getElementById('piano-roll-bar-numbers');
    const pianoRollScrollable = document.getElementById('piano-roll-scrollable');
    const soundSourceSelect = document.getElementById('piano-roll-sound-source');
    const gridSizeDecreaseBtn = document.getElementById('piano-roll-grid-decrease');
    const gridSizeIncreaseBtn = document.getElementById('piano-roll-grid-increase');
    const gridSizeDisplay = document.getElementById('piano-roll-grid-display');
    const noteLengthDecreaseBtn = document.getElementById('piano-roll-note-decrease');
    const noteLengthIncreaseBtn = document.getElementById('piano-roll-note-increase');
    const noteLengthDisplay = document.getElementById('piano-roll-note-display');
    
    // Clear existing content
    pianoKeys.innerHTML = "";
    pianoRollBarNumbers.innerHTML = "";
    pianoRollGrid.innerHTML = "";
    
    const data = pianoRollData[currentSampleForPopup];
    
    // Set grid display
    gridSizeDisplay.textContent = data.gridWidth;
    
    // Create bar/beat labels
    const stepsPerBeat = 4;
    const totalBeats = Math.ceil(data.gridWidth / stepsPerBeat);
    for (let beatIdx = 0; beatIdx < totalBeats; beatIdx++) {
        const barNumber = Math.floor(beatIdx / 4) + 1;
        const beatNumber = (beatIdx % 4) + 1;
        const beatDiv = document.createElement("div");
        beatDiv.className = "piano-roll-bar-number";
        if (beatNumber === 1) beatDiv.classList.add("bar-start");
        
        const cellWidth = 20 * pianoRollZoomLevel;
        beatDiv.style.width = `${stepsPerBeat * cellWidth}px`;
        
        const span = document.createElement("span");
        span.textContent = `${barNumber}.${beatNumber}`;
        beatDiv.appendChild(span);
        pianoRollBarNumbers.appendChild(beatDiv);
    }
    
    // Create piano keys (7 octaves)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octaves = 7;
    for (let octave = octaves - 1; octave >= 0; octave--) {
        for (let i = 11; i >= 0; i--) {
            const key = document.createElement("div");
            key.className = `piano-key ${noteNames[i].includes("#") ? "black" : "white"}`;
            key.textContent = noteNames[i] + octave;
            key.dataset.note = noteNames[i];
            key.dataset.octave = octave;
            
            key.addEventListener("click", function() {
                // Initialize audio context if needed
                if (!audioContext) {
                    initAudioContext();
                }
                
                if (audioContext && audioContext.state === "suspended") {
                    audioContext.resume().then(() => playPianoKey(noteNames[i], octave));
                } else if (audioContext) {
                    playPianoKey(noteNames[i], octave);
                }
            });
            
            pianoKeys.appendChild(key);
        }
    }
    
    // Set grid template columns
    pianoRollGrid.style.gridTemplateColumns = `repeat(${data.gridWidth}, ${20 * pianoRollZoomLevel}px)`;
    
    // Create grid cells
    const fragment = document.createDocumentFragment();
    
    // Create ALL grid cells first (background grid)
    for (let row = data.gridHeight - 1; row >= 0; row--) {
        for (let col = 0; col < data.gridWidth; col++) {
            const cell = document.createElement("div");
            cell.className = "piano-roll-cell";
            
            // Mark beat boundaries (every 4 steps = 1 beat)
            if (col % 4 === 0) cell.classList.add("beat-start");
            
            // Mark bar boundaries (every 16 steps = 1 bar = 4 beats)
            if (col % 16 === 0) cell.classList.add("bar-start");
            if ((col + 1) % 16 === 0) cell.classList.add("bar-end");
            
            cell.dataset.row = row;
            cell.dataset.col = col;
            
            fragment.appendChild(cell);
        }
    }
    
    pianoRollGrid.appendChild(fragment);
    
    // Now render notes as overlays with exact fractional widths
    data.notes.forEach(note => {
        const noteOverlay = document.createElement("div");
        noteOverlay.className = "piano-roll-note-overlay";
        noteOverlay.style.position = "absolute";
        
        // Calculate exact pixel position and width
        const cellWidth = 20 * pianoRollZoomLevel;
        const cellHeight = 20;
        const startX = note.col * cellWidth;
        const width = (note.length || 1) * cellWidth;
        const topPosition = (data.gridHeight - 1 - note.row) * cellHeight;
        
        noteOverlay.style.left = startX + "px";
        noteOverlay.style.top = topPosition + "px";
        noteOverlay.style.width = width + "px";
        noteOverlay.style.height = cellHeight + "px";
        noteOverlay.style.background = "#DC143C";
        noteOverlay.style.border = "1px solid #B22222";
        noteOverlay.style.borderRadius = "2px";
        noteOverlay.style.pointerEvents = "auto"; // Enable clicks on overlays
        noteOverlay.style.zIndex = "10";
        noteOverlay.style.boxShadow = "0 0 4px rgba(220, 20, 60, 0.6)";
        
        noteOverlay.dataset.row = note.row;
        noteOverlay.dataset.col = note.col;
        noteOverlay.dataset.length = note.length;
        
        pianoRollGrid.appendChild(noteOverlay);
    });
    
    // Event delegation for cell clicks and note resizing (only add once)
    if (!pianoRollGrid.hasAttribute('data-listener-added')) {
        pianoRollGrid.setAttribute('data-listener-added', 'true');
        
        let isResizingNote = false;
        let isDraggingNote = false;
        let wasResizingOrDragging = false; // Track if last mousedown started a resize/drag
        let resizingNoteData = null; // {note, originalLength, startCol}
        let draggingNoteData = null; // {note, startRow, startCol, startX, startY}
        
        // Delete mode checkbox
        const deleteModeCheckbox = document.getElementById('piano-roll-delete-mode');
        
        // Mousedown: Check if clicking on right edge (resize), left edge (move/select), or empty cell
        pianoRollGrid.addEventListener("mousedown", function(e) {
            // Always grab the latest piano roll data for the currently open popup.
            const data = pianoRollData[currentSampleForPopup];
            if (!data) return;
            // Allow clicks on cells OR note overlays
            const isCell = e.target.classList.contains("piano-roll-cell");
            const isOverlay = e.target.classList.contains("piano-roll-note-overlay");
            
            if (!isCell && !isOverlay) return;
            
            // Get row/col from either cell or overlay
            let row, col;
            if (isOverlay) {
                row = parseInt(e.target.dataset.row);
                col = parseInt(e.target.dataset.col);
            } else {
                row = parseInt(e.target.dataset.row);
                col = parseInt(e.target.dataset.col);
            }
            
            // DELETE MODE: Just remove notes on click
            if (deleteModeCheckbox && deleteModeCheckbox.checked) {
                const noteIndex = data.notes.findIndex(n => n.row === row && col >= n.col && col < n.col + (n.length || 1));
                if (noteIndex !== -1) {
                    data.notes.splice(noteIndex, 1);
                    initPianoRoll();
                    
                    // Update preview if playing
                    if (isPreviewingPianoRoll) {
                        restartPianoRollPreview();
                    }
                }
                e.preventDefault();
                e.stopPropagation();
                return; // Don't do any other actions in delete mode
            }
            
            const cellRect = e.target.getBoundingClientRect();
            const mouseX = e.clientX - cellRect.left;
            const mouseY = e.clientY - cellRect.top;
            const cellWidth = 20 * pianoRollZoomLevel;
            const edgeThreshold = 8; // pixels from edge to trigger action
            
            // Find if this position is part of a note (check against exact note bounds)
            const note = data.notes.find(n => {
                if (n.row !== row) return false;
                // Check if mouse is within the note's span
                const noteStartCol = n.col;
                const noteEndCol = n.col + (n.length || 1);
                return col >= Math.floor(noteStartCol) && col < Math.ceil(noteEndCol);
            });
            
            // For resize detection, check if we're near the right edge of the NOTE (not cell)
            if (note) {
                const noteEndX = (note.col + (note.length || 1)) * cellWidth;
                const noteStartX = note.col * cellWidth;
                const mouseAbsX = col * cellWidth + mouseX;
                
                // Check if near right edge of NOTE
                if (mouseAbsX >= noteEndX - edgeThreshold && mouseAbsX <= noteEndX + edgeThreshold) {
                    // Start resizing note from right edge
                    isResizingNote = true;
                    wasResizingOrDragging = true; // Mark that we started an action
                    resizingNoteData = {
                        note: note,
                        originalLength: note.length || 1,
                        startCol: note.col,
                        startX: e.clientX
                    };
                    e.preventDefault();
                    e.stopPropagation();
                    return; // Don't trigger click
                }
                // Check if near left edge of NOTE
                else if (mouseAbsX >= noteStartX - edgeThreshold && mouseAbsX <= noteStartX + edgeThreshold) {
                    // Select this note's length for future placement
                    pianoRollNoteLength = note.length || 1;
                    
                    // Update note length display
                    let displayText = note.length + ' steps';
                    const matchingLength = noteLengths.find(nl => nl.value === note.length);
                    if (matchingLength) {
                        displayText = matchingLength.display;
                    } else {
                        // For fine-tuned lengths
                        displayText = note.length.toFixed(2) + ' st';
                    }
                    
                    const noteLengthDisplay = document.getElementById('piano-roll-note-display');
                    if (noteLengthDisplay) {
                        noteLengthDisplay.textContent = displayText;
                    }
                    
                    // Start dragging note for moving
                    isDraggingNote = true;
                    wasResizingOrDragging = true; // Mark that we started an action
                    draggingNoteData = {
                        note: note,
                        originalRow: note.row, // Store ORIGINAL position from note data
                        originalCol: note.col,
                        startRow: row,
                        startCol: col,
                        startX: e.clientX,
                        startY: e.clientY
                    };
                    e.preventDefault();
                    e.stopPropagation();
                    return; // Don't trigger click
                }
            }
        });
        
        // Mousemove: Update note length while resizing, move note while dragging, or show cursor
        pianoRollGrid.addEventListener("mousemove", function(e) {
            // Always grab the latest piano roll data for the currently open popup.
            const data = pianoRollData[currentSampleForPopup];
            if (!data) return;
            // When actively resizing/dragging, process mousemove regardless of target
            if (isResizingNote && resizingNoteData) {
                // Currently resizing - UPDATE OVERLAY DIRECTLY, DON'T RE-RENDER!
                const cellWidthPx = 20 * pianoRollZoomLevel;
                const deltaX = e.clientX - resizingNoteData.startX;
                const deltaCols = deltaX / cellWidthPx;
                
                // Calculate new length with FREE-FORM dragging (no snapping at all!)
                let newLength = resizingNoteData.originalLength + deltaCols;
                
                // Only clamp to minimum and grid bounds
                newLength = Math.max(0.01, Math.min(data.gridWidth - resizingNoteData.note.col, newLength));
                
                // Update note length in data
                resizingNoteData.note.length = newLength;
                
                // Find and update the overlay directly (DON'T re-render entire grid!)
                const overlays = pianoRollGrid.querySelectorAll('.piano-roll-note-overlay');
                overlays.forEach(overlay => {
                    if (parseInt(overlay.dataset.row) === resizingNoteData.note.row && 
                        parseInt(overlay.dataset.col) === resizingNoteData.note.col) {
                        overlay.style.width = (newLength * cellWidthPx) + 'px';
                        overlay.dataset.length = newLength;
                    }
                });
                
                return; // Don't process cursor changes while resizing
            } else if (isDraggingNote && draggingNoteData) {
                // Currently dragging/moving note - SMOOTH pixel-based movement with grid snap!
                const cellWidthPx = 20 * pianoRollZoomLevel;
                const cellHeightPx = 20;
                
                const deltaX = e.clientX - draggingNoteData.startX;
                const deltaY = e.clientY - draggingNoteData.startY;
                
                // Convert pixel delta to cell delta (smooth, NO rounding yet)
                const deltaCol = deltaX / cellWidthPx;
                const deltaRow = -deltaY / cellHeightPx; // Negative because rows go bottom to top
                
                // Calculate new position (smooth floating point)
                let newCol = draggingNoteData.originalCol + deltaCol;
                let newRow = draggingNoteData.originalRow + deltaRow;
                
                // Smart snap: Only snap if within 0.2 cells of grid line
                const snapThreshold = 0.2;
                const colFraction = newCol - Math.floor(newCol);
                const rowFraction = newRow - Math.floor(newRow);
                
                if (colFraction < snapThreshold) {
                    newCol = Math.floor(newCol);
                } else if (colFraction > (1 - snapThreshold)) {
                    newCol = Math.ceil(newCol);
                }
                
                if (rowFraction < snapThreshold) {
                    newRow = Math.floor(newRow);
                } else if (rowFraction > (1 - snapThreshold)) {
                    newRow = Math.ceil(newRow);
                }
                
                // Clamp to grid bounds
                newCol = Math.max(0, Math.min(data.gridWidth - draggingNoteData.note.length, newCol));
                newRow = Math.max(0, Math.min(data.gridHeight - 1, newRow));
                
                // Update note position in data
                draggingNoteData.note.col = newCol;
                draggingNoteData.note.row = newRow;
                
                // Find and update the overlay directly with EXACT pixel position
                const overlays = pianoRollGrid.querySelectorAll('.piano-roll-note-overlay');
                overlays.forEach(overlay => {
                    const overlayOriginalRow = parseInt(overlay.dataset.originalRow || overlay.dataset.row);
                    const overlayOriginalCol = parseInt(overlay.dataset.originalCol || overlay.dataset.col);
                    
                    if (overlayOriginalRow === draggingNoteData.originalRow && 
                        overlayOriginalCol === draggingNoteData.originalCol) {
                        // Update position with exact pixels (smooth movement!)
                        overlay.style.left = (newCol * cellWidthPx) + 'px';
                        overlay.style.top = ((data.gridHeight - 1 - newRow) * cellHeightPx) + 'px';
                        overlay.dataset.row = Math.round(newRow);
                        overlay.dataset.col = Math.round(newCol);
                        // Store original position for tracking
                        overlay.dataset.originalRow = draggingNoteData.originalRow;
                        overlay.dataset.originalCol = draggingNoteData.originalCol;
                    }
                });
                
                return; // Don't process cursor changes while dragging
            }
            
            // For cursor detection, check both cells and overlays
            const isCell = e.target.classList.contains("piano-roll-cell");
            const isOverlay = e.target.classList.contains("piano-roll-note-overlay");
            
            if (!isCell && !isOverlay) {
                pianoRollGrid.style.cursor = 'default';
                return;
            }
            
            let row, col, cellRect, mouseX;
            const cellWidth = 20 * pianoRollZoomLevel;
            const edgeThreshold = 8;
            
            if (isOverlay) {
                // Mouse is over an overlay
                row = parseInt(e.target.dataset.row);
                col = parseInt(e.target.dataset.col);
                const noteLength = parseFloat(e.target.dataset.length) || 1;
                
                cellRect = e.target.getBoundingClientRect();
                mouseX = e.clientX - cellRect.left;
                
                // Check if near right edge of overlay (resize)
                if (mouseX >= cellRect.width - edgeThreshold) {
                    pianoRollGrid.style.cursor = 'ew-resize';
                    return;
                }
                // Check if near left edge of overlay (move)
                else if (mouseX <= edgeThreshold) {
                    pianoRollGrid.style.cursor = 'move';
                    return;
                }
                else {
                    pianoRollGrid.style.cursor = 'pointer';
                    return;
                }
            } else {
                // Mouse is over a cell
                row = parseInt(e.target.dataset.row);
                col = parseInt(e.target.dataset.col);
                cellRect = e.target.getBoundingClientRect();
                mouseX = e.clientX - cellRect.left;
                
                // Check if this cell is part of a note
                const note = data.notes.find(n => {
                    if (n.row !== row) return false;
                    const noteStartCol = n.col;
                    const noteEndCol = n.col + (n.length || 1);
                    return col >= Math.floor(noteStartCol) && col < Math.ceil(noteEndCol);
                });
                
                if (note) {
                    const noteEndX = (note.col + (note.length || 1)) * cellWidth;
                    const noteStartX = note.col * cellWidth;
                    const mouseAbsX = col * cellWidth + mouseX;
                    
                    // Check if near right edge of NOTE
                    if (mouseAbsX >= noteEndX - edgeThreshold && mouseAbsX <= noteEndX + edgeThreshold) {
                        pianoRollGrid.style.cursor = 'ew-resize';
                        return;
                    }
                    // Check if near left edge of NOTE
                    else if (mouseAbsX >= noteStartX - edgeThreshold && mouseAbsX <= noteStartX + edgeThreshold) {
                        pianoRollGrid.style.cursor = 'move';
                        return;
                    }
                }
                
                // Default cursor
                pianoRollGrid.style.cursor = 'pointer';
            }
        });
        
        // Mouseup: Finalize resize or drag
        window.addEventListener("mouseup", function(e) {
            if (isResizingNote) {
                isResizingNote = false;
                
                // Keep exact length, NO ROUNDING!
                if (resizingNoteData && resizingNoteData.note) {
                    // Just clamp to minimum, keep the exact decimal value
                    resizingNoteData.note.length = Math.max(0.01, resizingNoteData.note.length);
                    initPianoRoll(); // Final re-render
                    
                    // Update preview if playing
                    if (isPreviewingPianoRoll) {
                        restartPianoRollPreview();
                    }
                }
                
                resizingNoteData = null;
            } else if (isDraggingNote) {
                isDraggingNote = false;
                
                // Round position to nearest grid cell on release
                if (draggingNoteData && draggingNoteData.note) {
                    draggingNoteData.note.col = Math.round(draggingNoteData.note.col);
                    draggingNoteData.note.row = Math.round(draggingNoteData.note.row);
                    
                    initPianoRoll(); // Final re-render with rounded position
                    
                    // Update preview if playing
                    if (isPreviewingPianoRoll) {
                        restartPianoRollPreview();
                    }
                }
                
                draggingNoteData = null;
            }
        });
        
        // Click: Delete note when clicking on it, or add note when clicking empty cell
        pianoRollGrid.addEventListener("click", function(e) {
            // Always grab the latest piano roll data for the currently open popup.
            const data = pianoRollData[currentSampleForPopup];
            if (!data) return;
            // Skip if in delete mode (already handled in mousedown)
            if (deleteModeCheckbox && deleteModeCheckbox.checked) return;
            
            // Skip if we were resizing or dragging (not a simple click)
            if (wasResizingOrDragging) {
                wasResizingOrDragging = false;
                return;
            }
            
            const isCell = e.target.classList.contains("piano-roll-cell");
            const isOverlay = e.target.classList.contains("piano-roll-note-overlay");
            
            if (isOverlay) {
                // Clicked on a note overlay - DELETE the note
                const row = parseInt(e.target.dataset.row);
                const col = parseInt(e.target.dataset.col);
                
                // Find and remove the note
                const noteIndex = data.notes.findIndex(n => n.row === row && n.col === col);
                if (noteIndex !== -1) {
                    data.notes.splice(noteIndex, 1);
                    initPianoRoll();
                    
                    // Update preview if playing
                    if (isPreviewingPianoRoll) {
                        restartPianoRollPreview();
                    }
                }
            } else if (isCell) {
                // Clicked on empty cell - ADD a note
                const row = parseInt(e.target.dataset.row);
                const col = parseInt(e.target.dataset.col);
                togglePianoRollCell(row, col);
            }
        });
    }
    
    // Sound source selector
    soundSourceSelect.value = data.soundSource;
    soundSourceSelect.addEventListener("change", function() {
        data.soundSource = this.value;
        
        // Show/hide sound design controls
        const sdPanel = document.getElementById('sound-design-controls');
        if (data.soundSource === 'synth') {
            sdPanel.style.display = 'block';
            // Draw ADSR canvas when panel becomes visible
            setTimeout(() => {
                drawADSRCanvas();
            }, 50);
        } else {
            sdPanel.style.display = 'none';
        }
    });
    
    // Trigger the change event to set initial visibility
    soundSourceSelect.dispatchEvent(new Event('change'));
    
    // Grid size controls
    gridSizeDecreaseBtn.onclick = () => {
        if (data.gridWidth > 4) {
            data.gridWidth /= 2;
            initPianoRoll(); // Recreate grid
            // Restart preview if currently playing to update loop length
            if (isPreviewingPianoRoll) {
                restartPianoRollPreview();
            }
        }
    };
    
    gridSizeIncreaseBtn.onclick = () => {
        if (data.gridWidth < 128) {
            data.gridWidth *= 2;
            initPianoRoll(); // Recreate grid
            // Restart preview if currently playing to update loop length
            if (isPreviewingPianoRoll) {
                restartPianoRollPreview();
            }
        }
    };
    
    // Note length controls
    const currentNoteLength = noteLengths.find(nl => nl.value === pianoRollNoteLength);
    if (currentNoteLength) {
        noteLengthDisplay.textContent = currentNoteLength.display;
    }
    
    noteLengthDecreaseBtn.onclick = () => {
        const currentIndex = noteLengths.findIndex(nl => nl.value === pianoRollNoteLength);
        if (currentIndex > 0) {
            pianoRollNoteLength = noteLengths[currentIndex - 1].value;
            noteLengthDisplay.textContent = noteLengths[currentIndex - 1].display;
        }
    };
    
    noteLengthIncreaseBtn.onclick = () => {
        const currentIndex = noteLengths.findIndex(nl => nl.value === pianoRollNoteLength);
        if (currentIndex < noteLengths.length - 1) {
            pianoRollNoteLength = noteLengths[currentIndex + 1].value;
            noteLengthDisplay.textContent = noteLengths[currentIndex + 1].display;
        }
    };
    
    // Preview/Stop/Clear controls
    document.getElementById('piano-roll-preview-btn').onclick = previewPianoRoll;
    document.getElementById('piano-roll-stop-btn').onclick = stopPianoRollPreview;
    document.getElementById('piano-roll-clear-btn').onclick = clearPianoRoll;
    
    // Sync horizontal scroll between bar numbers and grid
    // Remove old scroll listener if exists
    if (pianoRollScrollable._scrollSyncHandler) {
        pianoRollScrollable.removeEventListener('scroll', pianoRollScrollable._scrollSyncHandler);
    }
    
    // Calculate and apply scrollbar width offset
    const scrollbarWidth = pianoRollScrollable.offsetWidth - pianoRollScrollable.clientWidth;
    pianoRollBarNumbers.style.paddingRight = scrollbarWidth + 'px';
    
    // Create new scroll handler
    pianoRollScrollable._scrollSyncHandler = function() {
        pianoRollBarNumbers.scrollLeft = pianoRollScrollable.scrollLeft;
    };
    
    // Add scroll listener
    pianoRollScrollable.addEventListener('scroll', pianoRollScrollable._scrollSyncHandler);
}

function togglePianoRollCell(row, col) {
    const data = pianoRollData[currentSampleForPopup];
    if (!data) return;
    
    // Find existing note at this position
    const existingNoteIndex = data.notes.findIndex(n => n.row === row && n.col === col);
    
    if (existingNoteIndex >= 0) {
        // Remove note
        data.notes.splice(existingNoteIndex, 1);
    } else {
        // Add note with current length
        const length = pianoRollNoteLength || 1;
        data.notes.push({ row, col, length, velocity: 100 });
    }
    
    // Re-render grid to show updated notes
    initPianoRoll();
}

function clearPianoRoll() {
    const data = pianoRollData[currentSampleForPopup];
    if (!data) return;
    
    data.notes = [];
    
    // Re-render grid
    initPianoRoll();
}

function previewPianoRoll() {
    if (isPreviewingPianoRoll) return;
    
    // Initialize audio context if needed
    if (!audioContext) {
        initAudioContext();
    }
    
    const data = pianoRollData[currentSampleForPopup];
    if (!data || data.notes.length === 0) {
        alert('No notes to preview!');
        return;
    }
    
    isPreviewingPianoRoll = true;
    startPianoRollVisualizerAnimation();
    
    const tempo = arrangementState.tempo;
    const beatDuration = 60 / tempo;
    const stepDuration = beatDuration / 4; // 16th note duration
    
    let currentStep = 0;
    const maxSteps = data.gridWidth;
    
    pianoRollLoopInterval = setInterval(() => {
        // Find notes at current step
        const notesAtStep = data.notes.filter(n => n.col === currentStep);
        
        notesAtStep.forEach(note => {
            const noteDuration = (note.length || 1) * stepDuration;
            playPianoNoteForPreview(note.row, audioContext.currentTime, noteDuration);
        });
        
        currentStep++;
        if (currentStep >= maxSteps) {
            currentStep = 0; // Loop
        }
    }, stepDuration * 1000);
}

function stopPianoRollPreview() {
    isPreviewingPianoRoll = false;
    
    if (pianoRollLoopInterval) {
        clearInterval(pianoRollLoopInterval);
        pianoRollLoopInterval = null;
    }
    
    // Stop all active notes
    Object.values(pianoRollPreviewActiveVoices).forEach(voice => {
        if (voice && voice.source) {
            try {
                voice.source.stop();
            } catch (e) {}
        }
    });
    pianoRollPreviewActiveVoices = {};
    
    stopPianoRollVisualizerAnimation();
}

function restartPianoRollPreview() {
    // Only restart if already previewing
    if (!isPreviewingPianoRoll) return;
    
    // Stop current preview
    stopPianoRollPreview();
    
    // Small delay to let audio clean up
    setTimeout(() => {
        previewPianoRoll();
    }, 50);
}

function playPianoKey(noteName, octave) {
    // Initialize audio context if needed
    if (!audioContext) {
        initAudioContext();
    }
    if (!audioContext) return;
    
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    
    const baseFreq = noteFrequencies[noteName];
    const frequency = baseFreq * Math.pow(2, octave);
    
    const data = pianoRollData[currentSampleForPopup];
    const soundSource = data ? data.soundSource : 'synth';
    
    if (soundSource === 'sample') {
        // Play sample at pitch
        playPianoSample(frequency, 0.3);
    } else {
        // Play synth note
        playSynthNote(frequency, 0.3);
    }
}

function playPianoNoteForPreview(row, time, duration) {
    if (!audioContext) return;
    
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(row / 12);
    const noteIndex = row % 12;
    const noteName = noteNames[noteIndex];
    
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    
    const baseFreq = noteFrequencies[noteName];
    const frequency = baseFreq * Math.pow(2, octave);
    
    const data = pianoRollData[currentSampleForPopup];
    const soundSource = data ? data.soundSource : 'synth';
    
    if (soundSource === 'sample') {
        playPianoSample(frequency, duration, time);
    } else {
        playSynthNote(frequency, duration, time);
    }
}

function playPianoSample(frequency, duration, startTime = null) {
    // Simple sample playback at pitch
    if (!audioContext) {
        return;
    }
    if (startTime === null) {
        startTime = audioContext.currentTime;
    }
    
    // Patch: Use correct sample for pattern note
    let sampleNum = 1;
    if (effects && effects.sampleNum !== undefined) {
        sampleNum = effects.sampleNum;
    } else if (effects && effects.sample && typeof effects.sample === 'number') {
        sampleNum = effects.sample;
    }
    if (!sampleBuffers[sampleNum]) return;

    const source = audioContext.createBufferSource();
    source.buffer = sampleBuffers[sampleNum];
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5;
    
    // Pitch shift
    const basePitch = 440; // A4
    let playbackRate = frequency / basePitch;
    
    // Apply tempo multiplier so preview matches current BPM
    const tempoMultiplier = arrangementState.tempo / 120;
    playbackRate *= tempoMultiplier;
    
    source.playbackRate.value = playbackRate;
    
    source.connect(gainNode);
    
    if (pianoRollVisualizerAnalyzer) {
        gainNode.connect(pianoRollVisualizerAnalyzer);
    }
    
    gainNode.connect(audioContext.destination);
    
    source.start(startTime);
    source.stop(startTime + duration);
}

function playSynthNote(frequency, duration, startTime = null) {
    if (!audioContext) {
        return;
    }
    if (startTime === null) {
        startTime = audioContext.currentTime;
    }
    
    const data = pianoRollData[currentSampleForPopup];
    const sd = data && data.soundDesign ? data.soundDesign : {
        masterVolume: 70,
        osc1: { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0 },
        osc2: { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0 },
        unison: { enabled: false, voices: 3, detune: 20, width: 70 },
        filter: { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 },
        envelope: { attack: 10, decay: 100, sustain: 70, release: 200 }
    };
    
    // Ensure all properties exist with defaults
    if (!sd.masterVolume) sd.masterVolume = 70;
    if (!sd.osc1) sd.osc1 = { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0 };
    if (!sd.osc2) sd.osc2 = { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0 };
    if (!sd.unison) sd.unison = { enabled: false, voices: 3, detune: 20, width: 70 };
    if (!sd.filter) sd.filter = { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 };
    if (!sd.envelope) sd.envelope = { attack: 10, decay: 100, sustain: 70, release: 200 };
    
    // Apply octave shifts
    const osc1OctaveShift = Math.pow(2, sd.osc1.octave || 0);
    const osc2OctaveShift = Math.pow(2, sd.osc2.octave || 0);
    
    // Apply tempo multiplier to frequency so preview matches current BPM
    const tempoMultiplier = arrangementState.tempo / 120;
    const baseFrequency = frequency * tempoMultiplier;
    const osc1Frequency = baseFrequency * osc1OctaveShift;
    const osc2Frequency = baseFrequency * osc2OctaveShift;
    
    // Check if unison is enabled (when voices > 1)
    const unisonVoices = sd.unison && sd.unison.voices > 1 ? sd.unison.voices : 1;
    const unisonDetune = sd.unison ? (sd.unison.detune || 10) : 0;
    const unisonPan = sd.unison ? (sd.unison.pan || 50) / 100 : 0;
    
    // Create oscillators (with unison support)
    const osc1Array = [];
    const osc2Array = [];
    const osc1GainArray = [];
    const osc2GainArray = [];
    
    // Helper function to create oscillator with phase offset
    function createOscillatorWithPhase(context, waveType, frequency, phase) {
        const osc = context.createOscillator();
        
        if (phase !== 0) {
            // Create custom PeriodicWave with phase offset
            const phaseRadians = (phase / 360) * Math.PI * 2;
            const size = 4096;
            const real = new Float32Array(size);
            const imag = new Float32Array(size);
            
            // Generate harmonics for different wave types with phase offset
            if (waveType === 'sine') {
                real[1] = Math.cos(phaseRadians);
                imag[1] = Math.sin(phaseRadians);
            } else if (waveType === 'square') {
                for (let n = 1; n < size; n += 2) {
                    real[n] = (4 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                    imag[n] = (4 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                }
            } else if (waveType === 'sawtooth' || waveType === 'custom') {
                for (let n = 1; n < size; n++) {
                    real[n] = -(2 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                    imag[n] = -(2 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                }
            } else if (waveType === 'triangle') {
                for (let n = 1; n < size; n += 2) {
                    const sign = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
                    real[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.cos(n * phaseRadians);
                    imag[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.sin(n * phaseRadians);
                }
            }
            
            const wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
            osc.setPeriodicWave(wave);
        } else {
            osc.type = waveType === 'custom' ? 'sawtooth' : waveType;
        }
        
        osc.frequency.value = frequency;
        return osc;
    }
    
    // Create unison voices
    for (let v = 0; v < unisonVoices; v++) {
        // Calculate detune spread
        const voiceDetune = unisonVoices > 1 
            ? ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
            : 0;
        
        // Create oscillators for this voice with phase offset
        const osc1Phase = sd.osc1.phase || 0;
        const osc2Phase = sd.osc2.phase || 0;
        
        const osc1 = createOscillatorWithPhase(audioContext, sd.osc1.wave, osc1Frequency, osc1Phase);
        const osc2 = createOscillatorWithPhase(audioContext, sd.osc2.wave, osc2Frequency, osc2Phase);
        
        osc1.detune.value = (sd.osc1.detune || 0) + voiceDetune;
        osc2.detune.value = (sd.osc2.detune || 0) + voiceDetune;
        
        // Create gain nodes for this voice
        const osc1Gain = audioContext.createGain();
        const osc2Gain = audioContext.createGain();
        
        // Apply stereo width for unison (pan voices across stereo field)
        if (unisonVoices > 1 && unisonPan > 0) {
            const panPosition = ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonPan; // -1 to 1
            const panner = audioContext.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, panPosition)); // Clamp to valid range
            
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
            osc1Gain.connect(panner);
            osc2Gain.connect(panner);
            
            // Store panner reference
            osc1Gain.panner = panner;
            osc2Gain.panner = panner;
        } else {
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
        }
        
        osc1Array.push(osc1);
        osc2Array.push(osc2);
        osc1GainArray.push(osc1Gain);
        osc2GainArray.push(osc2Gain);
    }
    
    // Master gains for osc1 and osc2 (sums all unison voices)
    const osc1MasterGain = audioContext.createGain();
    const osc2MasterGain = audioContext.createGain();
    
    // Connect all voice gains to master gains
    osc1GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc1MasterGain);
        } else {
            gain.connect(osc1MasterGain);
        }
    });
    osc2GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc2MasterGain);
        } else {
            gain.connect(osc2MasterGain);
        }
    });
    
    // Set voice levels (divide by voice count to maintain same loudness)
    const voiceLevelScale = 1 / Math.sqrt(unisonVoices); // Use sqrt for perceived loudness
    osc1GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    osc2GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    
    // Set master oscillator levels with proper gain staging
    const masterVolume = (sd.masterVolume !== undefined ? sd.masterVolume : 70) / 100;
    const osc1Level = (sd.osc1.level || 0) / 100;
    const osc2Level = (sd.osc2.level || 0) / 100;
    
    // Calculate total level to prevent clipping
    const totalLevel = osc1Level + osc2Level;
    const normalizationFactor = totalLevel > 0 ? 1 / Math.max(totalLevel, 1) : 1;
    
    // Apply normalized levels with master volume
    osc1MasterGain.gain.value = osc1Level * normalizationFactor * masterVolume;
    osc2MasterGain.gain.value = osc2Level * normalizationFactor * masterVolume;
    
    // Create filter with envelope support
    const filter = audioContext.createBiquadFilter();
    filter.type = sd.filter.type || 'lowpass';
    const baseCutoff = Math.max(20, sd.filter.cutoff || 2000);
    filter.frequency.value = baseCutoff;
    filter.Q.value = (sd.filter.resonance || 0) / 10;
    
    // Create envelope
    const env = audioContext.createGain();
    
    // Connect audio graph
    osc1MasterGain.connect(filter);
    osc2MasterGain.connect(filter);
    filter.connect(env);
    
    if (pianoRollVisualizerAnalyzer) {
        env.connect(pianoRollVisualizerAnalyzer);
    }
    
    env.connect(audioContext.destination);
    
    // ADSR Envelope - Use exponential ramps to prevent clicks
    const now = Math.max(startTime, audioContext.currentTime);
    const attack = Math.max(0.001, (sd.envelope.attack || 0) / 1000); // Minimum 1ms to prevent clicks
    const decay = Math.max(0.001, (sd.envelope.decay || 0) / 1000);
    const sustain = (sd.envelope.sustain || 0) / 100;
    const release = Math.max(0.01, (sd.envelope.release || 0) / 1000); // Minimum 10ms for smooth release
    
    // Start from a very small value instead of 0 to enable exponential ramps
    const minValue = 0.0001;
    env.gain.setValueAtTime(minValue, now);
    
    // Attack: exponential rise for smooth start (prevents clicks)
    env.gain.exponentialRampToValueAtTime(1, now + attack);
    
    // Decay: exponential fall to sustain level
    const sustainValue = Math.max(minValue, sustain); // Ensure sustain isn't 0 for exponential
    env.gain.exponentialRampToValueAtTime(sustainValue, now + attack + decay);
    
    // Hold at sustain level
    env.gain.setValueAtTime(sustainValue, now + duration);
    
    // Release: exponential decay to silence (prevents clicks)
    env.gain.exponentialRampToValueAtTime(minValue, now + duration + release);
    
    // Apply Filter Envelope if amount is set
    const filterEnvAmount = sd.filter.envAmount || 0;
    if (filterEnvAmount !== 0) {
        const filterEnvRange = Math.abs(filterEnvAmount) / 100 * 10000; // Max 10kHz modulation
        const filterTargetCutoff = filterEnvAmount > 0 
            ? Math.min(20000, baseCutoff + filterEnvRange)
            : Math.max(20, baseCutoff - filterEnvRange);
        
        // Filter envelope follows amplitude envelope
        filter.frequency.setValueAtTime(filterTargetCutoff, now);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + attack);
        filter.frequency.setValueAtTime(baseCutoff, now + attack + decay);
        filter.frequency.setValueAtTime(baseCutoff, now + duration);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff * 0.5, now + duration + release);
    }
    
    // Apply Envelope → Pitch Modulation (if enabled in sound design)
    if (sd.envelope.pitchMod && sd.envelope.pitchMod.enabled && sd.envelope.pitchMod.amount !== 0) {
        const pitchAmount = sd.envelope.pitchMod.amount; // semitones
        const maxDetune = pitchAmount * 100; // cents (100 cents = 1 semitone)

        // Pitch starts high and bends down during attack phase
        const osc1BaseDetune = sd.osc1.detune || 0;
        const osc2BaseDetune = sd.osc2.detune || 0;
        
        // Apply pitch modulation to all unison voices
        osc1Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            osc.detune.setValueAtTime(osc1BaseDetune + voiceDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime(osc1BaseDetune + voiceDetune, now + attack);
        });
        
        osc2Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            osc.detune.setValueAtTime(osc2BaseDetune + voiceDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime(osc2BaseDetune + voiceDetune, now + attack);
        });
    }
    
    // Calculate stop time for oscillators (needed by PWM and other cleanup)
    const stopAt = now + duration + release;
    
    // Apply PWM (Pulse Width Modulation) if enabled
    if (sd.pwm && sd.pwm.enabled && sd.pwm.rate > 0 && sd.pwm.depth > 0) {
        const pwmRate = sd.pwm.rate; // Hz
        const pwmDepth = sd.pwm.depth / 100; // 0-1 range
        
        // Create PWM LFO for each oscillator array
        osc1Array.forEach((osc, idx) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.frequency.value = pwmRate;
            pwmLFO.type = 'sine'; // Smooth PWM modulation
            pwmGain.gain.value = pwmDepth * 50; // Scale to reasonable detune amount
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(stopAt);
            
            // Store for cleanup
            if (!osc.pwmLFO) osc.pwmLFO = [];
            osc.pwmLFO.push(pwmLFO);
        });
        
        osc2Array.forEach((osc, idx) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.frequency.value = pwmRate;
            pwmLFO.type = 'sine';
            pwmGain.gain.value = pwmDepth * 50;
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(stopAt);
            
            if (!osc.pwmLFO) osc.pwmLFO = [];
            osc.pwmLFO.push(pwmLFO);
        });
    }
    
    // Apply LFOs from piano roll data if available
    if (data && data.lfos) {
        // Use first oscillator from arrays for LFO compatibility
        applyLFOsToPatternNote(null, osc1MasterGain, osc2MasterGain, env, osc1Array[0], osc2Array[0], frequency, now, duration, data.lfos, filter);
    }
    
    // Start all oscillators
    osc1Array.forEach(osc => osc.start(now));
    osc2Array.forEach(osc => osc.start(now));
    
    // Stop all oscillators
    osc1Array.forEach(osc => osc.stop(stopAt));
    osc2Array.forEach(osc => osc.stop(stopAt));
    
    // Store voices for potential manipulation
    const voiceId = Date.now() + Math.random();
    pianoRollPreviewActiveVoices[voiceId] = {
        osc1: osc1Array[0], // Store first osc for compatibility
        osc2: osc2Array[0],
        osc1Array, // Store all voices
        osc2Array,
        g1: osc1MasterGain, 
        g2: osc2MasterGain,
        filter, env,
        source: osc1Array[0] // For compatibility with cleanup
    };
    
    // Clean up after note ends
    setTimeout(() => {
        delete pianoRollPreviewActiveVoices[voiceId];
    }, stopAt - audioContext.currentTime + 100);
}

function initPianoRollVisualizer() {
    pianoRollVisualizer = document.getElementById('piano-roll-visualizer');
    if (!pianoRollVisualizer) return;
    
    pianoRollVisualizerCtx = pianoRollVisualizer.getContext('2d');
    
    if (!pianoRollVisualizerAnalyzer && audioContext) {
        pianoRollVisualizerAnalyzer = audioContext.createAnalyser();
        pianoRollVisualizerAnalyzer.fftSize = 256;
    }
}

function drawPianoRollVisualizer() {
    if (!pianoRollVisualizer || !pianoRollVisualizerCtx || !pianoRollVisualizerAnalyzer) return;
    
    const width = pianoRollVisualizer.width;
    const height = pianoRollVisualizer.height;
    
    pianoRollVisualizerCtx.fillStyle = "#0a0a0a";
    pianoRollVisualizerCtx.fillRect(0, 0, width, height);
    
    const bufferLength = pianoRollVisualizerAnalyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    pianoRollVisualizerAnalyzer.getByteFrequencyData(dataArray);
    
    const barWidth = width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        
        const hue = (i / bufferLength) * 360;
        pianoRollVisualizerCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        pianoRollVisualizerCtx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth;
    }
}

function startPianoRollVisualizerAnimation() {
    if (pianoRollVisualizerAnimationId) return;
    
    function animate() {
        drawPianoRollVisualizer();
        pianoRollVisualizerAnimationId = requestAnimationFrame(animate);
    }
    
    animate();
}

function stopPianoRollVisualizerAnimation() {
    if (pianoRollVisualizerAnimationId) {
        cancelAnimationFrame(pianoRollVisualizerAnimationId);
        pianoRollVisualizerAnimationId = null;
    }
    
    // Clear visualizer
    if (pianoRollVisualizer && pianoRollVisualizerCtx) {
        pianoRollVisualizerCtx.fillStyle = "#0a0a0a";
        pianoRollVisualizerCtx.fillRect(0, 0, pianoRollVisualizer.width, pianoRollVisualizer.height);
    }
}

function initSoundDesignControls() {
    const data = pianoRollData[currentSampleForPopup];
    if (!data || !data.soundDesign) return;
    
    const sd = data.soundDesign;
    
    // Osc 1 controls
    const osc1Wave = document.getElementById('sd-osc1-wave');
    const osc1Level = document.getElementById('sd-osc1-level');
    const osc1LevelVal = document.getElementById('sd-osc1-level-val');
    const osc1Detune = document.getElementById('sd-osc1-detune');
    const osc1DetuneVal = document.getElementById('sd-osc1-detune-val');
    
    if (osc1Wave) {
        osc1Wave.value = sd.osc1.wave;
        osc1Wave.onchange = () => sd.osc1.wave = osc1Wave.value;
    }
    if (osc1Level) {
        osc1Level.value = sd.osc1.level;
        osc1LevelVal.textContent = sd.osc1.level + '%';
        osc1Level.oninput = () => {
            sd.osc1.level = +osc1Level.value;
            osc1LevelVal.textContent = sd.osc1.level + '%';
        };
    }
    if (osc1Detune) {
        osc1Detune.value = sd.osc1.detune;
        osc1DetuneVal.textContent = sd.osc1.detune + 'c';
        osc1Detune.oninput = () => {
            sd.osc1.detune = +osc1Detune.value;
            osc1DetuneVal.textContent = sd.osc1.detune + 'c';
        };
    }
    
    // Osc 2 controls
    const osc2Wave = document.getElementById('sd-osc2-wave');
    const osc2Level = document.getElementById('sd-osc2-level');
    const osc2LevelVal = document.getElementById('sd-osc2-level-val');
    const osc2Detune = document.getElementById('sd-osc2-detune');
    const osc2DetuneVal = document.getElementById('sd-osc2-detune-val');
    
    if (osc2Wave) {
        osc2Wave.value = sd.osc2.wave;
        osc2Wave.onchange = () => sd.osc2.wave = osc2Wave.value;
    }
    if (osc2Level) {
        osc2Level.value = sd.osc2.level;
        osc2LevelVal.textContent = sd.osc2.level + '%';
        osc2Level.oninput = () => {
            sd.osc2.level = +osc2Level.value;
            osc2LevelVal.textContent = sd.osc2.level + '%';
        };
    }
    if (osc2Detune) {
        osc2Detune.value = sd.osc2.detune;
        osc2DetuneVal.textContent = sd.osc2.detune + 'c';
        osc2Detune.oninput = () => {
            sd.osc2.detune = +osc2Detune.value;
            osc2DetuneVal.textContent = sd.osc2.detune + 'c';
        };
    }
    
    // Filter controls
    const filterType = document.getElementById('sd-filter-type');
    const filterCutoff = document.getElementById('sd-filter-cutoff');
    const filterCutoffVal = document.getElementById('sd-filter-cutoff-val');
    const filterRes = document.getElementById('sd-filter-res');
    const filterResVal = document.getElementById('sd-filter-res-val');
    
    if (filterType) {
        filterType.value = sd.filter.type;
        filterType.onchange = () => sd.filter.type = filterType.value;
    }
    if (filterCutoff) {
        filterCutoff.value = sd.filter.cutoff;
        filterCutoffVal.textContent = sd.filter.cutoff + ' Hz';
        filterCutoff.oninput = () => {
            sd.filter.cutoff = +filterCutoff.value;
            filterCutoffVal.textContent = sd.filter.cutoff + ' Hz';
        };
    }
    if (filterRes) {
        filterRes.value = sd.filter.resonance;
        filterResVal.textContent = sd.filter.resonance;
        filterRes.oninput = () => {
            sd.filter.resonance = +filterRes.value;
            filterResVal.textContent = sd.filter.resonance;
        };
    }
    
    // Envelope controls
    const envAttack = document.getElementById('sd-env-attack');
    const envAttackVal = document.getElementById('sd-env-attack-val');
    const envDecay = document.getElementById('sd-env-decay');
    const envDecayVal = document.getElementById('sd-env-decay-val');
    const envSustain = document.getElementById('sd-env-sustain');
    const envSustainVal = document.getElementById('sd-env-sustain-val');
    const envRelease = document.getElementById('sd-env-release');
    const envReleaseVal = document.getElementById('sd-env-release-val');
    
    if (envAttack) {
        envAttack.value = sd.envelope.attack;
        envAttackVal.textContent = sd.envelope.attack + ' ms';
        envAttack.oninput = () => {
            sd.envelope.attack = +envAttack.value;
            envAttackVal.textContent = sd.envelope.attack + ' ms';
        };
    }
    if (envDecay) {
        envDecay.value = sd.envelope.decay;
        envDecayVal.textContent = sd.envelope.decay + ' ms';
        envDecay.oninput = () => {
            sd.envelope.decay = +envDecay.value;
            envDecayVal.textContent = sd.envelope.decay + ' ms';
        };
    }
    if (envSustain) {
        envSustain.value = sd.envelope.sustain;
        envSustainVal.textContent = sd.envelope.sustain + '%';
        envSustain.oninput = () => {
            sd.envelope.sustain = +envSustain.value;
            envSustainVal.textContent = sd.envelope.sustain + '%';
        };
    }
    if (envRelease) {
        envRelease.value = sd.envelope.release;
        envReleaseVal.textContent = sd.envelope.release + ' ms';
        envRelease.oninput = () => {
            sd.envelope.release = +envRelease.value;
            envReleaseVal.textContent = sd.envelope.release + ' ms';
        };
    }
    
    // Initialize pitch modulation if not exists
    if (!sd.envelope.pitchMod) {
        sd.envelope.pitchMod = { enabled: false, amount: 0 };
    }
    
    // Pitch modulation controls
    const pitchEnable = document.getElementById('sd-env-pitch-enable');
    const pitchAmount = document.getElementById('sd-env-pitch-amount');
    const pitchAmountVal = document.getElementById('sd-env-pitch-amount-val');
    
    if (pitchEnable) {
        pitchEnable.checked = sd.envelope.pitchMod.enabled || false;
        pitchEnable.onchange = () => {
            sd.envelope.pitchMod.enabled = pitchEnable.checked;

        };
    }
    if (pitchAmount) {
        pitchAmount.value = sd.envelope.pitchMod.amount || 0;
        pitchAmountVal.textContent = (sd.envelope.pitchMod.amount || 0) + '';
        pitchAmount.oninput = () => {
            sd.envelope.pitchMod.amount = +pitchAmount.value;
            pitchAmountVal.textContent = sd.envelope.pitchMod.amount + '';
        };
    }
    
    // Master Volume control
    const masterVolume = document.getElementById('sd-master-volume');
    const masterVolumeVal = document.getElementById('sd-master-volume-val');
    if (masterVolume) {
        masterVolume.value = sd.masterVolume || 70;
        masterVolumeVal.textContent = (sd.masterVolume || 70) + '%';
        masterVolume.oninput = () => {
            sd.masterVolume = +masterVolume.value;
            masterVolumeVal.textContent = sd.masterVolume + '%';
        };
    }
    
    // Unison controls
    if (!sd.unison) {
        sd.unison = { voices: 1, detune: 10, pan: 50 };
    }
    const unisonVoices = document.getElementById('sd-unison-voices');
    const unisonVoicesVal = document.getElementById('sd-unison-voices-val');
    const unisonDetune = document.getElementById('sd-unison-detune');
    const unisonDetuneVal = document.getElementById('sd-unison-detune-val');
    const unisonPan = document.getElementById('sd-unison-pan');
    const unisonPanVal = document.getElementById('sd-unison-pan-val');
    
    if (unisonVoices) {
        unisonVoices.value = sd.unison.voices;
        unisonVoicesVal.textContent = sd.unison.voices;
        unisonVoices.oninput = () => {
            sd.unison.voices = +unisonVoices.value;
            unisonVoicesVal.textContent = sd.unison.voices;
        };
    }
    if (unisonDetune) {
        unisonDetune.value = sd.unison.detune;
        unisonDetuneVal.textContent = sd.unison.detune + 'c';
        unisonDetune.oninput = () => {
            sd.unison.detune = +unisonDetune.value;
            unisonDetuneVal.textContent = sd.unison.detune + 'c';
        };
    }
    if (unisonPan) {
        unisonPan.value = sd.unison.pan;
        unisonPanVal.textContent = sd.unison.pan + '%';
        unisonPan.oninput = () => {
            sd.unison.pan = +unisonPan.value;
            unisonPanVal.textContent = sd.unison.pan + '%';
        };
    }
    
    // PWM controls
    if (!sd.pwm) {
        sd.pwm = { enabled: false, rate: 0.5, depth: 50 };
    }
    const pwmEnable = document.getElementById('sd-pwm-enable');
    const pwmRate = document.getElementById('sd-pwm-rate');
    const pwmRateVal = document.getElementById('sd-pwm-rate-val');
    const pwmDepth = document.getElementById('sd-pwm-depth');
    const pwmDepthVal = document.getElementById('sd-pwm-depth-val');
    
    if (pwmEnable) {
        pwmEnable.checked = sd.pwm.enabled;
        pwmEnable.onchange = () => {
            sd.pwm.enabled = pwmEnable.checked;
        };
    }
    if (pwmRate) {
        pwmRate.value = sd.pwm.rate;
        pwmRateVal.textContent = sd.pwm.rate + ' Hz';
        pwmRate.oninput = () => {
            sd.pwm.rate = +pwmRate.value;
            pwmRateVal.textContent = sd.pwm.rate + ' Hz';
        };
    }
    if (pwmDepth) {
        pwmDepth.value = sd.pwm.depth;
        pwmDepthVal.textContent = sd.pwm.depth + '%';
        pwmDepth.oninput = () => {
            sd.pwm.depth = +pwmDepth.value;
            pwmDepthVal.textContent = sd.pwm.depth + '%';
        };
    }
    
    // Octave controls
    if (!sd.osc1.octave) sd.osc1.octave = 0;
    if (!sd.osc2.octave) sd.osc2.octave = 0;
    
    const osc1Octave = document.getElementById('sd-osc1-octave');
    const osc1OctaveVal = document.getElementById('sd-osc1-octave-val');
    const osc2Octave = document.getElementById('sd-osc2-octave');
    const osc2OctaveVal = document.getElementById('sd-osc2-octave-val');
    
    if (osc1Octave) {
        osc1Octave.value = sd.osc1.octave;
        osc1OctaveVal.textContent = (sd.osc1.octave > 0 ? '+' : '') + sd.osc1.octave;
        osc1Octave.oninput = () => {
            sd.osc1.octave = +osc1Octave.value;
            osc1OctaveVal.textContent = (sd.osc1.octave > 0 ? '+' : '') + sd.osc1.octave;
        };
    }
    if (osc2Octave) {
        osc2Octave.value = sd.osc2.octave;
        osc2OctaveVal.textContent = (sd.osc2.octave > 0 ? '+' : '') + sd.osc2.octave;
        osc2Octave.oninput = () => {
            sd.osc2.octave = +osc2Octave.value;
            osc2OctaveVal.textContent = (sd.osc2.octave > 0 ? '+' : '') + sd.osc2.octave;
        };
    }
    
    // Phase controls
    if (!sd.osc1.phase) sd.osc1.phase = 0;
    if (!sd.osc2.phase) sd.osc2.phase = 0;
    
    const osc1Phase = document.getElementById('sd-osc1-phase');
    const osc1PhaseVal = document.getElementById('sd-osc1-phase-val');
    const osc2Phase = document.getElementById('sd-osc2-phase');
    const osc2PhaseVal = document.getElementById('sd-osc2-phase-val');
    
    if (osc1Phase) {
        osc1Phase.value = sd.osc1.phase;
        osc1PhaseVal.textContent = sd.osc1.phase + '°';
        osc1Phase.oninput = () => {
            sd.osc1.phase = +osc1Phase.value;
            osc1PhaseVal.textContent = sd.osc1.phase + '°';
        };
    }
    if (osc2Phase) {
        osc2Phase.value = sd.osc2.phase;
        osc2PhaseVal.textContent = sd.osc2.phase + '°';
        osc2Phase.oninput = () => {
            sd.osc2.phase = +osc2Phase.value;
            osc2PhaseVal.textContent = sd.osc2.phase + '°';
        };
    }
    
    // Pan controls
    if (!sd.osc1.pan) sd.osc1.pan = 0;
    if (!sd.osc2.pan) sd.osc2.pan = 0;
    
    const osc1Pan = document.getElementById('sd-osc1-pan');
    const osc1PanVal = document.getElementById('sd-osc1-pan-val');
    const osc2Pan = document.getElementById('sd-osc2-pan');
    const osc2PanVal = document.getElementById('sd-osc2-pan-val');
    
    if (osc1Pan) {
        osc1Pan.value = sd.osc1.pan;
        osc1PanVal.textContent = sd.osc1.pan;
        osc1Pan.oninput = () => {
            sd.osc1.pan = +osc1Pan.value;
            osc1PanVal.textContent = sd.osc1.pan;
        };
    }
    if (osc2Pan) {
        osc2Pan.value = sd.osc2.pan;
        osc2PanVal.textContent = sd.osc2.pan;
        osc2Pan.oninput = () => {
            sd.osc2.pan = +osc2Pan.value;
            osc2PanVal.textContent = sd.osc2.pan;
        };
    }
    
    // Filter Envelope controls
    if (!sd.filter.envAmount) sd.filter.envAmount = 0;
    
    const filterEnvAmount = document.getElementById('sd-filter-env-amount');
    const filterEnvAmountVal = document.getElementById('sd-filter-env-amount-val');
    
    if (filterEnvAmount) {
        filterEnvAmount.value = sd.filter.envAmount;
        filterEnvAmountVal.textContent = sd.filter.envAmount + '%';
        filterEnvAmount.oninput = () => {
            sd.filter.envAmount = +filterEnvAmount.value;
            filterEnvAmountVal.textContent = sd.filter.envAmount + '%';
        };
    }
    
    // Draw ADSR canvas initially
    setTimeout(() => {
        drawADSRCanvas();
        setupADSRCanvasInteraction();
    }, 100);
    
    // Redraw ADSR canvas when envelope sliders change
    ['sd-env-attack', 'sd-env-decay', 'sd-env-sustain', 'sd-env-release'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                drawADSRCanvas();
            });
        }
    });
    
    // Initialize and setup piano roll LFOs when synth is selected
    if (!data.lfos) {
        data.lfos = [
            { target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { target: 'none', waveform: 'sine', rate: 1, depth: 0 }
        ];
    }
    
    setTimeout(() => {
        initPianoRollLFOs();
        setupPianoRollLFOListeners();
    }, 50);
}

// ========================================
// PIANO ROLL LFO SYSTEM
// ========================================

// Initialize piano roll LFOs
function initPianoRollLFOs() {
    const data = pianoRollData[currentSampleForPopup];
    if (!data || !data.lfos) return;
    
    // Load LFO values into UI
    for (let i = 1; i <= 4; i++) {
        const lfo = data.lfos[i - 1];
        if (!lfo) continue;
        
        const targetSelect = document.getElementById(`pr-lfo-${i}-target`);
        const waveSelect = document.getElementById(`pr-lfo-${i}-waveform`);
        const rateSlider = document.getElementById(`pr-lfo-${i}-rate`);
        const depthSlider = document.getElementById(`pr-lfo-${i}-depth`);
        const rateValue = document.getElementById(`pr-lfo-${i}-rate-value`);
        const depthValue = document.getElementById(`pr-lfo-${i}-depth-value`);
        
        if (targetSelect) targetSelect.value = lfo.target || 'none';
        if (waveSelect) waveSelect.value = lfo.waveform || 'sine';
        if (rateSlider) {
            rateSlider.value = lfo.rate || 1;
            if (rateValue) rateValue.textContent = (lfo.rate || 1).toFixed(1);
        }
        if (depthSlider) {
            depthSlider.value = lfo.depth || 0;
            if (depthValue) depthValue.textContent = (lfo.depth || 0) + '%';
        }
        
        // Draw waveform
        drawPianoRollLFOWaveform(i);
    }
    
    // Show LFO section if sound source is synth
    const soundSource = document.getElementById('piano-roll-sound-source');
    const lfoSection = document.getElementById('piano-roll-lfo-section');
    if (soundSource && soundSource.value === 'synth' && lfoSection) {
        lfoSection.style.display = 'block';
    }
}

// Setup piano roll LFO event listeners
function setupPianoRollLFOListeners() {
    // Tab switching
    const lfoTabs = document.querySelectorAll('#piano-roll-lfo-section .lfo-tab');
    const lfoPanels = document.querySelectorAll('#piano-roll-lfo-section .lfo-panel');
    
    lfoTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const lfoNum = tab.getAttribute('data-pr-lfo');
            
            lfoTabs.forEach(t => t.classList.remove('active'));
            lfoPanels.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            const panel = document.getElementById(`pr-lfo-panel-${lfoNum}`);
            if (panel) panel.classList.add('active');
        });
    });
    
    // LFO controls for each of the 4 LFOs
    for (let i = 1; i <= 4; i++) {
        setupSinglePianoRollLFOListener(i);
    }
}

// Setup listeners for a single piano roll LFO
function setupSinglePianoRollLFOListener(lfoNum) {
    const data = pianoRollData[currentSampleForPopup];
    if (!data || !data.lfos) return;
    
    const lfo = data.lfos[lfoNum - 1];
    const targetSelect = document.getElementById(`pr-lfo-${lfoNum}-target`);
    const waveSelect = document.getElementById(`pr-lfo-${lfoNum}-waveform`);
    const rateSlider = document.getElementById(`pr-lfo-${lfoNum}-rate`);
    const depthSlider = document.getElementById(`pr-lfo-${lfoNum}-depth`);
    const rateValue = document.getElementById(`pr-lfo-${lfoNum}-rate-value`);
    const depthValue = document.getElementById(`pr-lfo-${lfoNum}-depth-value`);
    
    if (targetSelect) {
        targetSelect.oninput = () => {
            lfo.target = targetSelect.value;

        };
    }
    
    if (waveSelect) {
        waveSelect.oninput = () => {
            lfo.waveform = waveSelect.value;
            drawPianoRollLFOWaveform(lfoNum);

        };
    }
    
    if (rateSlider) {
        rateSlider.oninput = () => {
            lfo.rate = parseFloat(rateSlider.value);
            if (rateValue) rateValue.textContent = lfo.rate.toFixed(1);
            drawPianoRollLFOWaveform(lfoNum);

        };
    }
    
    if (depthSlider) {
        depthSlider.oninput = () => {
            lfo.depth = parseInt(depthSlider.value);
            if (depthValue) depthValue.textContent = lfo.depth + '%';
            drawPianoRollLFOWaveform(lfoNum);

        };
    }
}

// Draw LFO waveform for piano roll
function drawPianoRollLFOWaveform(lfoNum) {
    const canvas = document.getElementById(`pr-lfo-${lfoNum}-wave`);
    if (!canvas) return;
    
    const data = pianoRollData[currentSampleForPopup];
    if (!data || !data.lfos) return;
    
    const lfo = data.lfos[lfoNum - 1];
    if (!lfo) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Don't draw if depth is 0
    if (lfo.depth === 0) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        return;
    }
    
    // Scale amplitude based on depth
    const amplitude = (height / 2) * (lfo.depth / 100);
    
    // Draw waveform - scale cycles based on rate (higher rate = more cycles visible)
    ctx.strokeStyle = '#3F51B5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const cycles = (lfo.rate || 1) * 2; // Show cycles proportional to rate
    const samplesPerCycle = width / cycles;
    
    for (let x = 0; x < width; x++) {
        const phase = (x / samplesPerCycle) * Math.PI * 2;
        let y;
        
        switch (lfo.waveform) {
            case 'sine':
                y = centerY - Math.sin(phase) * amplitude;
                break;
            case 'square':
                y = centerY - (Math.sin(phase) > 0 ? amplitude : -amplitude);
                break;
            case 'triangle':
                y = centerY - ((2 / Math.PI) * Math.asin(Math.sin(phase))) * amplitude;
                break;
            case 'sawtooth':
                y = centerY - ((phase / (Math.PI * 2)) * 2 - 1) * amplitude;
                break;
            default:
                y = centerY;
        }
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    // Draw center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
}

// Apply LFOs to a piano roll synth note during preview or rendering
// Now accepts filter node parameter for filter LFO modulation
function applyLFOsToPatternNote(source, sourceGain, lfoGains, masterGain, osc1, osc2, frequency, now, duration, patternLFOs, filter) {
    // patternLFOs should be the array of LFO objects from pianoRollData[pattern].lfos
    if (!patternLFOs || !Array.isArray(patternLFOs)) return;
    
    
    // Track active LFOs to prevent garbage collection
    const activeLFOs = [];
    
    // Create LFO oscillators and connect to targets
    patternLFOs.forEach((lfo, i) => {
        if (!lfo || lfo.target === 'none' || lfo.depth === 0) return;

        // Create LFO oscillator
        const lfoOsc = audioContext.createOscillator();
        lfoOsc.type = lfo.waveform || 'sine';
        lfoOsc.frequency.value = lfo.rate || 1;
        
        const lfoGain = audioContext.createGain();
        const depthRatio = lfo.depth / 100;
        
        lfoOsc.connect(lfoGain);
        
        // Connect to appropriate target
        switch (lfo.target) {
            case 'osc1-detune':
                if (osc1) {
                    lfoGain.gain.value = depthRatio * 1200; // ±12 semitones
                    lfoGain.connect(osc1.detune);

                }
                break;
            case 'osc2-detune':
                if (osc2) {
                    lfoGain.gain.value = depthRatio * 1200; // ±12 semitones
                    lfoGain.connect(osc2.detune);

                }
                break;
            case 'filter-cutoff':
                if (filter) {
                    lfoGain.gain.value = depthRatio * 2000; // Hz range
                    lfoGain.connect(filter.frequency);
                } else {
                }
                break;
            case 'filter-resonance':
                if (filter) {
                    lfoGain.gain.value = depthRatio * 30; // Q value
                    lfoGain.connect(filter.Q);
                } else {
                }
                break;
            case 'env-attack':
            case 'env-decay':
            case 'env-sustain':
            case 'env-release':
                // Envelope LFOs would need to be applied at note start
                break;
            default:

        }
        
        lfoOsc.start(now);
        lfoOsc.stop(now + duration + 0.5);
        activeLFOs.push({ osc: lfoOsc, gain: lfoGain });
    });
}

// ========================================
// ADSR VISUAL CANVAS - Serum Style
// ========================================

function drawADSRCanvas() {
    const canvas = document.getElementById('adsr-canvas');
    if (!canvas) return;
    
    // Set canvas resolution to match display size
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {

        setTimeout(drawADSRCanvas, 50);
        return;
    }
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const s = pianoRollData[currentSampleForPopup]?.soundDesign;
    if (!s) return;
    
    const attack = s.envelope.attack || 0;
    const decay = s.envelope.decay || 0;
    const sustain = (s.envelope.sustain || 0) / 100;
    const release = s.envelope.release || 0;
    
    // Fixed time scale
    const FIXED_TOTAL_TIME = 10000; // 10 seconds
    const SUSTAIN_DISPLAY_TIME = 1000; // 1 second sustain display
    
    const padding = 40;
    const availableWidth = width - (padding * 2);
    
    // Calculate X positions
    const attackX = padding + (attack / FIXED_TOTAL_TIME) * availableWidth;
    const decayX = padding + ((attack + decay) / FIXED_TOTAL_TIME) * availableWidth;
    
    const sustainTime = s.envelope.sustainTime || 10;
    const minSustainDisplay = 50;
    const displaySustainTime = Math.max(sustainTime, minSustainDisplay);
    const sustainX = padding + ((attack + decay + displaySustainTime) / FIXED_TOTAL_TIME) * availableWidth;
    const releaseX = padding + ((attack + decay + displaySustainTime + release) / FIXED_TOTAL_TIME) * availableWidth;
    
    const maxReleaseX = width - padding;
    const clampedReleaseX = Math.min(releaseX, maxReleaseX);
    
    const marginTop = 40;
    const marginBottom = 40;
    const availableHeight = height - marginTop - marginBottom;
    
    const peakY = marginTop;
    const sustainY = marginTop + ((1 - sustain) * availableHeight);
    const endY = height - marginBottom;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Grid lines
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = marginTop + (i * availableHeight / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Vertical grid lines (time markers every second)
    ctx.strokeStyle = '#222';
    for (let i = 1; i <= 10; i++) {
        const x = padding + (i * 1000 / FIXED_TOTAL_TIME) * availableWidth;
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, height - marginBottom);
        ctx.stroke();
        
        // Time labels
        ctx.fillStyle = '#444';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${i}s`, x, height - marginBottom + 12);
    }
    
    // Draw envelope curve with gradient - PURPLE theme
    const gradient = ctx.createLinearGradient(0, peakY, 0, endY);
    gradient.addColorStop(0, '#B388FF');
    gradient.addColorStop(1, '#7C4DFF');
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(padding, endY);
    ctx.lineTo(attackX, peakY); // Attack
    ctx.lineTo(decayX, sustainY); // Decay
    ctx.lineTo(sustainX, sustainY); // Sustain
    ctx.lineTo(clampedReleaseX, endY); // Release
    ctx.stroke();
    
    // Draw glow effect
    ctx.shadowColor = '#B388FF';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Fill under curve
    ctx.fillStyle = 'rgba(179, 136, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(padding, endY);
    ctx.lineTo(attackX, peakY);
    ctx.lineTo(decayX, sustainY);
    ctx.lineTo(sustainX, sustainY);
    ctx.lineTo(clampedReleaseX, endY);
    ctx.closePath();
    ctx.fill();
    
    // Draw control points with labels
    const points = [
        {x: attackX, y: peakY, label: 'A', color: '#FF4444'},
        {x: decayX, y: sustainY, label: 'D', color: '#FFAA44'},
        {x: sustainX, y: sustainY, label: 'S', color: '#44FF44'},
        {x: clampedReleaseX, y: endY, label: 'R', color: '#4444FF'}
    ];
    
    points.forEach(pt => {
        // Outer glow
        ctx.fillStyle = pt.color;
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner circle
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Label above point
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pt.label, pt.x, pt.y - 18);
    });
    
    // Value labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    
    if (attackX > padding + 20) {
        ctx.fillText(`${attack}ms`, attackX, height - 22);
    }
    if (decayX > attackX + 40) {
        ctx.fillText(`${decay}ms`, (attackX + decayX) / 2, height - 22);
    }
    ctx.fillText(`${Math.round(sustain * 100)}%`, (decayX + sustainX) / 2, sustainY - 8);
    if (sustainX > decayX + 20) {
        ctx.fillText(`${sustainTime}ms`, (decayX + sustainX) / 2, height - 22);
    }
    if (clampedReleaseX > sustainX + 40) {
        ctx.fillText(`${release}ms`, (sustainX + clampedReleaseX) / 2, height - 22);
    }
    
    // Stage labels at top
    ctx.fillStyle = '#666';
    ctx.font = 'bold 10px Arial';
    if (attackX > padding + 30) {
        ctx.fillText('ATTACK', (padding + attackX) / 2, 20);
    }
    if (decayX > attackX + 30) {
        ctx.fillText('DECAY', (attackX + decayX) / 2, 20);
    }
    if (sustainX > decayX + 30) {
        ctx.fillText('SUSTAIN', (decayX + sustainX) / 2, 20);
    }
    if (clampedReleaseX > sustainX + 30) {
        ctx.fillText('RELEASE', (sustainX + clampedReleaseX) / 2, 20);
    }
    
    // Warning if release is clamped
    if (releaseX > maxReleaseX) {
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('⚠ Max', width - padding - 5, 20);
    }
}

// Interactive ADSR canvas
function setupADSRCanvasInteraction() {
    const canvas = document.getElementById('adsr-canvas');
    if (!canvas) return;
    
    // Remove old listeners if they exist (prevent duplicates)
    if (canvas._adsrMouseDownHandler) {
        canvas.removeEventListener('mousedown', canvas._adsrMouseDownHandler);
        canvas.removeEventListener('mousemove', canvas._adsrMouseMoveHandler);
        canvas.removeEventListener('mouseup', canvas._adsrMouseUpHandler);
        canvas.removeEventListener('mouseleave', canvas._adsrMouseLeaveHandler);
    }
    
    let dragging = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let originalValue = 0;
    const FIXED_TOTAL_TIME = 10000;
    
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    const mouseDownHandler = (e) => {
        const pos = getMousePos(e);
        const s = pianoRollData[currentSampleForPopup]?.soundDesign;
        if (!s) return;
        
        const rect = canvas.getBoundingClientRect();
        const padding = 40;
        const marginTop = 40;
        const marginBottom = 40;
        const availableHeight = rect.height - marginTop - marginBottom;
        
        const attack = s.envelope.attack || 0;
        const decay = s.envelope.decay || 0;
        const sustain = (s.envelope.sustain || 0) / 100;
        const release = s.envelope.release || 0;
        const sustainTime = s.envelope.sustainTime || 10;
        
        const minSustainDisplay = 50;
        const displaySustainTime = Math.max(sustainTime, minSustainDisplay);
        
        const availableWidth = rect.width - (padding * 2);
        
        const attackX = padding + (attack / FIXED_TOTAL_TIME) * availableWidth;
        const decayX = padding + ((attack + decay) / FIXED_TOTAL_TIME) * availableWidth;
        const sustainX = padding + ((attack + decay + displaySustainTime) / FIXED_TOTAL_TIME) * availableWidth;
        const releaseX = Math.min(padding + ((attack + decay + displaySustainTime + release) / FIXED_TOTAL_TIME) * availableWidth, rect.width - padding);
        
        const peakY = marginTop;
        const sustainY = marginTop + ((1 - sustain) * availableHeight);
        const endY = rect.height - marginBottom;
        
        // Find closest point
        const points = [
            {name: 'attack', x: attackX, y: peakY, value: attack},
            {name: 'decay', x: decayX, y: sustainY, value: {decay: decay, sustain: sustain * 100}},
            {name: 'sustain-point', x: sustainX, y: sustainY, value: {sustainTime: sustainTime, sustain: sustain * 100}},
            {name: 'release', x: releaseX, y: endY, value: release}
        ];
        
        let closestPoint = null;
        let minDistance = 15;
        
        points.forEach(pt => {
            const distance = Math.sqrt(Math.pow(pos.x - pt.x, 2) + Math.pow(pos.y - pt.y, 2));
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = pt;
            }
        });
        
        if (closestPoint) {
            dragging = closestPoint.name;
            dragStartX = pos.x;
            dragStartY = pos.y;
            originalValue = closestPoint.value;
            e.preventDefault();
            canvas.style.cursor = 'grabbing';
        }
    };
    
    const mouseMoveHandler = (e) => {
        if (!dragging) return;
        
        const pos = getMousePos(e);
        const s = pianoRollData[currentSampleForPopup]?.soundDesign;
        if (!s) return;
        
        const rect = canvas.getBoundingClientRect();
        const padding = 40;
        const marginTop = 40;
        const marginBottom = 40;
        const availableHeight = rect.height - marginTop - marginBottom;
        const availableWidth = rect.width - (padding * 2);
        
        if (dragging === 'attack') {
            const deltaX = pos.x - dragStartX;
            const deltaTime = (deltaX / availableWidth) * FIXED_TOTAL_TIME;
            const newAttack = Math.max(0, Math.min(2000, originalValue + deltaTime));
            document.getElementById('sd-env-attack').value = newAttack;
            document.getElementById('sd-env-attack').dispatchEvent(new Event('input'));
            
        } else if (dragging === 'decay') {
            const deltaX = pos.x - dragStartX;
            const deltaY = pos.y - dragStartY;
            
            const deltaTime = (deltaX / availableWidth) * FIXED_TOTAL_TIME;
            const newDecay = Math.max(0, Math.min(4000, originalValue.decay + deltaTime));
            document.getElementById('sd-env-decay').value = newDecay;
            document.getElementById('sd-env-decay').dispatchEvent(new Event('input'));
            
            const deltaSustain = -(deltaY / availableHeight) * 100;
            const newSustain = Math.max(0, Math.min(100, originalValue.sustain + deltaSustain));
            document.getElementById('sd-env-sustain').value = newSustain;
            document.getElementById('sd-env-sustain').dispatchEvent(new Event('input'));
            
        } else if (dragging === 'sustain-point') {
            const deltaX = pos.x - dragStartX;
            const deltaTime = (deltaX / availableWidth) * FIXED_TOTAL_TIME;
            const newSustainTime = Math.max(0, Math.min(2000, originalValue.sustainTime + deltaTime));
            if (!s.envelope.sustainTime) s.envelope.sustainTime = 10;
            s.envelope.sustainTime = newSustainTime;
            drawADSRCanvas();
            
        } else if (dragging === 'release') {
            const deltaX = pos.x - dragStartX;
            const deltaTime = (deltaX / availableWidth) * FIXED_TOTAL_TIME;
            const newRelease = Math.max(0, Math.min(4000, originalValue + deltaTime));
            document.getElementById('sd-env-release').value = newRelease;
            document.getElementById('sd-env-release').dispatchEvent(new Event('input'));
        }
    };
    
    const mouseUpHandler = () => {
        dragging = null;
        canvas.style.cursor = 'crosshair';
    };
    
    const mouseLeaveHandler = () => {
        dragging = null;
        canvas.style.cursor = 'crosshair';
    };
    
    // Store handlers on canvas for cleanup
    canvas._adsrMouseDownHandler = mouseDownHandler;
    canvas._adsrMouseMoveHandler = mouseMoveHandler;
    canvas._adsrMouseUpHandler = mouseUpHandler;
    canvas._adsrMouseLeaveHandler = mouseLeaveHandler;
    
    // Attach event listeners
    canvas.addEventListener('mousedown', mouseDownHandler);
    canvas.addEventListener('mousemove', mouseMoveHandler);
    canvas.addEventListener('mouseup', mouseUpHandler);
    canvas.addEventListener('mouseleave', mouseLeaveHandler);
}

// ========== PLAYBACK ==========
function playArrangement() {
    if (arrangementState.isPlaying) {

        return;
    }





    if (arrangementState.clips.length === 0) {
        alert('No clips to play! Add some clips first by selecting a sample/pattern and clicking on a track.');
        return;
    }
    
    arrangementState.isPlaying = true;
    playheadLine.classList.add('playing');
    
    // Initialize audio context

    initAudioContext();
    
    if (!audioContext) {
        alert('Audio context failed to initialize');
        stopArrangement();
        return;
    }

    // Resume if suspended
    if (audioContext.state === 'suspended') {

        audioContext.resume().then(() => {

            startPlayback();
        });
    } else {
        startPlayback();
    }
}

function startPlayback() {
    // PROFESSIONAL: Progressive scheduling system for smooth playback with many clips
    // Only schedule clips within a 4-bar lookahead window, then update progressively
    
    // Start playback loop
    const startTime = audioContext.currentTime;
    arrangementState.startTime = startTime - arrangementState.currentTime;
    arrangementState.scheduledSources = []; // Track sources for cleanup
    arrangementState.lastUpdateTime = audioContext.currentTime; // Initialize for delta time calculation
    arrangementState.lastScheduleTime = audioContext.currentTime; // Track when we last scheduled clips
    arrangementState.scheduledClipIds = new Set(); // Track which clips are already scheduled
    
    // Initialize bar position if not already set
    if (!arrangementState.currentBarPosition) {
        arrangementState.currentBarPosition = 0;
    }

    // Initial scheduling (4 bar lookahead)
    scheduleClipsProgressive();
    
    animate();
}

function stopArrangement() {
    // If already stopped, reset to beginning
    if (!arrangementState.isPlaying) {
        // Reset to beginning (bar 0)
        arrangementState.currentBarPosition = 0;
        arrangementState.currentTime = 0;
        arrangementState.currentBar = 1;
        
        // Update display
        document.getElementById('arr-current-bar').textContent = '1';
        
        // Move playhead to start
        playheadLine.style.left = '0px';
        
        // Scroll timeline to start
        const timelineWrapper = document.getElementById('timeline-scroll-wrapper');
        const tracksScroll = document.getElementById('arrangement-tracks-scroll');
        if (timelineWrapper) timelineWrapper.scrollLeft = 0;
        if (tracksScroll) tracksScroll.scrollLeft = 0;
        arrangementState.scrollX = 0;
        
        // Re-render timeline
        renderTimeline();
        
        return;
    }

    arrangementState.isPlaying = false;
    playheadLine.classList.remove('playing');
    
    if (arrangementState.animationId) {
        cancelAnimationFrame(arrangementState.animationId);
    }
    
    // Stop all scheduled sources
    if (arrangementState.scheduledSources) {
        arrangementState.scheduledSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Already stopped
            }
        });
        arrangementState.scheduledSources = [];
    }
    
    // Clear progressive scheduling tracking
    arrangementState.scheduledClipIds = new Set();
    
    // Clear active clip nodes
    arrangementState.activeClipNodes = {};
    
    // Clear all LFO and Automation intervals
    if (arrangementState.clipPlaybackData) {
        arrangementState.clipPlaybackData.forEach(clipData => {
            if (clipData.lfoIntervals) {
                clipData.lfoIntervals.forEach(id => clearInterval(id));
            }
            if (clipData.lfoPitchIntervals) {
                clipData.lfoPitchIntervals.forEach(id => clearInterval(id));
            }
            if (clipData.automationIntervals) {
                clipData.automationIntervals.forEach(id => clearInterval(id));
            }
        });
        arrangementState.clipPlaybackData = [];
    }
}

function animate() {
    if (!arrangementState.isPlaying) return;
    
    const currentTime = audioContext.currentTime;
    
    // Calculate delta time since last update
    if (!arrangementState.lastUpdateTime) {
        arrangementState.lastUpdateTime = currentTime;
    }
    const deltaTime = currentTime - arrangementState.lastUpdateTime;
    arrangementState.lastUpdateTime = currentTime;
    
    // Calculate how many bars have passed based on current tempo
    const beatDuration = 60 / arrangementState.tempo;
    const barDuration = beatDuration * 4;
    const barsPassed = deltaTime / barDuration;
    
    // Update bar position (tempo-independent counter)
    arrangementState.currentBarPosition += barsPassed;
    
    // Update elapsed time
    const elapsed = currentTime - arrangementState.startTime;
    arrangementState.currentTime = elapsed;
    
    // Update playhead position based on bar position (not time)
    const barWidth = 100 * arrangementState.zoom;
    const currentBar = Math.floor(arrangementState.currentBarPosition);
    const barPosition = arrangementState.currentBarPosition * barWidth;
    
    // Check if loop is enabled and we've reached the end
    if (arrangementState.loopEnabled && 
        arrangementState.loopStart !== null && 
        arrangementState.loopEnd !== null) {
        
        if (arrangementState.currentBarPosition >= arrangementState.loopEnd) {
            // Loop back to start

            arrangementState.currentBarPosition = arrangementState.loopStart - 1;
            
            // Calculate new start time based on bar position
            arrangementState.startTime = currentTime - (arrangementState.currentBarPosition * barDuration);
            arrangementState.currentTime = arrangementState.currentBarPosition * barDuration;
            
            // Stop all current sources
            if (arrangementState.scheduledSources) {
                arrangementState.scheduledSources.forEach(source => {
                    try {
                        source.stop();
                    } catch (e) {
                        // Already stopped
                    }
                });
                arrangementState.scheduledSources = [];
            }
            
            // Clear scheduled clips tracking for fresh scheduling
            arrangementState.scheduledClipIds = new Set();
            
            // Clear all LFO and Automation intervals
            if (arrangementState.clipPlaybackData) {
                arrangementState.clipPlaybackData.forEach(clipData => {
                    if (clipData.lfoIntervals) {
                        clipData.lfoIntervals.forEach(id => clearInterval(id));
                    }
                    if (clipData.automationIntervals) {
                        clipData.automationIntervals.forEach(id => clearInterval(id));
                    }
                });
                arrangementState.clipPlaybackData = [];
            }
            
            // Reschedule clips from loop start
            scheduleClips();
            
            // Continue animation from loop start
            arrangementState.animationId = requestAnimationFrame(animate);
            return;
        }
    }
    
    playheadLine.style.left = barPosition + 'px';
    
    // Update playhead height to match all tracks (each track is 60px tall)
    const totalTracksHeight = arrangementState.tracks.length * 60;
    playheadLine.style.height = totalTracksHeight + 'px';
    
    arrangementState.currentBar = currentBar + 1;
    document.getElementById('arr-current-bar').textContent = arrangementState.currentBar;
    
    // Auto-scroll timeline to follow playhead
    const timelineContainer = document.querySelector('.arrangement-timeline-container');
    if (timelineContainer) {
        const containerWidth = timelineContainer.clientWidth;
        const scrollLeft = timelineContainer.scrollLeft;
        const playheadPosition = barPosition;
        
        // Scroll when playhead is near the right edge (80% of visible area)
        const scrollThreshold = containerWidth * 0.8;
        const playheadRelativePosition = playheadPosition - scrollLeft;
        
        if (playheadRelativePosition > scrollThreshold) {
            // Smooth scroll to keep playhead centered
            const newScrollPosition = playheadPosition - (containerWidth / 2);
            timelineContainer.scrollTo({
                left: Math.max(0, newScrollPosition),
                behavior: 'smooth'
            });
        }
    }
    
    arrangementState.animationId = requestAnimationFrame(animate);
}

// PROFESSIONAL: Progressive clip scheduling - only schedule clips within lookahead window
// This prevents lag when starting playback with many clips (30+)
async function scheduleClipsProgressive() {
    if (!audioContext) {
        return;
    }
    
    const LOOKAHEAD_BARS = 4; // Schedule 4 bars ahead (aggressive lookahead for smooth playback)
    const SCHEDULE_INTERVAL = 1.0; // Re-check every 1 second
    
    const beatDuration = 60 / arrangementState.tempo;
    const barDuration = beatDuration * 4;
    const currentBarPos = arrangementState.currentBarPosition;
    const currentTimeInSong = arrangementState.currentTime;
    
    // Calculate lookahead window
    const lookaheadEndBar = currentBarPos + LOOKAHEAD_BARS;
    
    let scheduledCount = 0;
    
    // Only schedule clips within the lookahead window that aren't already scheduled
    for (const clip of arrangementState.clips) {
        // Skip if already scheduled
        if (arrangementState.scheduledClipIds && arrangementState.scheduledClipIds.has(clip.id)) {
            continue;
        }
        
        // Check if track is audible (mute/solo logic)
        if (!isTrackAudible(clip.trackIndex)) {
            continue;
        }
        
        const clipEndBar = clip.startBar + clip.length;
        
        // Schedule if clip is within lookahead window or currently playing
        const isInLookahead = clip.startBar <= lookaheadEndBar && clipEndBar >= currentBarPos;
        
        if (isInLookahead) {
            const clipStartTime = clip.startBar * barDuration;
            const clipEndTime = clipStartTime + (clip.length * barDuration);
            
            let scheduleAt, offset;
            
            if (clipStartTime >= currentTimeInSong) {
                // Clip hasn't started yet - schedule normally
                scheduleAt = arrangementState.startTime + clipStartTime;
                offset = 0;
            } else {
                // Clip is already playing - start immediately with offset
                scheduleAt = audioContext.currentTime;
                offset = currentTimeInSong - clipStartTime;
            }
            
            // Schedule the clip
            if (clip.type === 'sample') {
                await scheduleSampleClip(clip, scheduleAt, offset);
            } else if (clip.type === 'pattern') {
                schedulePatternClip(clip, scheduleAt, offset);
            }
            
            // Mark as scheduled
            if (!arrangementState.scheduledClipIds) {
                arrangementState.scheduledClipIds = new Set();
            }
            arrangementState.scheduledClipIds.add(clip.id);
            scheduledCount++;
        }
    }
    
    // Schedule next progressive update (run continuously during playback)
    if (arrangementState.isPlaying) {
        setTimeout(() => {
            if (arrangementState.isPlaying) {
                scheduleClipsProgressive();
            }
        }, SCHEDULE_INTERVAL * 1000);
    }
}

// Legacy function - kept for loop restart compatibility
async function scheduleClips() {
    // Reset scheduled clips tracking
    arrangementState.scheduledClipIds = new Set();
    
    // Use progressive scheduling
    await scheduleClipsProgressive();
}

// LFO MODULATION HELPER - Calculate LFO value at a given time
function getLFOValue(lfo, time) {
    const phase = (time * lfo.rate * Math.PI * 2) % (Math.PI * 2);
    let modulation = 0;
    
    switch (lfo.waveform) {
        case 'sine':
            modulation = Math.sin(phase);
            break;
        case 'square':
            modulation = Math.sin(phase) > 0 ? 1 : -1;
            break;
        case 'triangle':
            const t = (phase / Math.PI) % 2;
            modulation = t < 1 ? 2 * t - 1 : 3 - 2 * t;
            break;
        case 'sawtooth':
            modulation = 2 * ((phase / Math.PI) % 1) - 1;
            break;
        default:
            modulation = 0;
    }
    
    return modulation * (lfo.depth / 100);
}

// AUTOMATION HELPER - Calculate automation value based on curve
function getAutomationValue(auto, clipStartTime, currentTime, clipDuration) {
    if (auto.target === 'none') return 0;
    
    // Use arrangementState.tempo for BPM/tempo reference (was using non-existent 'bpm')
    const elapsedBeats = (currentTime - clipStartTime) / (60 / arrangementState.tempo);
    const autoDurationBeats = auto.duration * 4; // duration is in bars (4 beats per bar)
    
    // Loop the automation if clip is longer than automation duration
    const t = (elapsedBeats % autoDurationBeats) / autoDurationBeats;
    
    let value;
    switch (auto.curve) {
        case 'linear':
            value = auto.start + (auto.end - auto.start) * t;
            break;
        case 'exponential':
            value = auto.start + (auto.end - auto.start) * (t * t);
            break;
        case 'logarithmic':
            value = auto.start + (auto.end - auto.start) * Math.sqrt(t);
            break;
        default:
            value = auto.start + (auto.end - auto.start) * t;
    }
    
    return value / 100; // Return as 0-1 range
}

// APPLY LFO MODULATION TO AUDIO PARAMS
function applyLFOsToSample(source, filterNode, gainNode, effects, startTime, clipData) {
    // New per-clip oscillator-based LFO implementation (adapted from PsychologicalStudio)
    // Ensure clipData has a reference to the effects object so update loops can read current config
    try { if (clipData) clipData.effects = effects; } catch (e) {}
    // Store the start time for relative LFO phase calculations
    if (clipData) clipData.startTime = startTime;
    if (!effects.lfos || !Array.isArray(effects.lfos)) {
        effects.lfos = [
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 }
        ];
    }

    // Normalize entries
    for (let i = 0; i < 4; i++) {
        const l = effects.lfos[i] || {};
        effects.lfos[i] = {
            enabled: !!l.enabled,
            target: l.target || 'none',
            waveform: l.waveform || 'sine',
            rate: Number(l.rate) || 1,
            depth: Number(l.depth) || 0
        };
    }

    // Ensure clipData has storage
    clipData.lfoNodes = clipData.lfoNodes || [null, null, null, null];
    clipData.lfoGainNodes = clipData.lfoGainNodes || [null, null, null, null];
    clipData.lfoUpdateTimeouts = clipData.lfoUpdateTimeouts || [null, null, null, null];
    clipData.lfoPitchIntervals = clipData.lfoPitchIntervals || [null, null, null, null];
    clipData.lfoTargets = clipData.lfoTargets || ["none","none","none","none"];

    // Store base values
    if (source && source.playbackRate) clipData.basePitchRate = source.playbackRate.value;
    if (gainNode && gainNode.gain) clipData.baseGain = gainNode.gain.value;

    // Clear old LFOs
    for (let i = 0; i < 4; i++) {
        if (clipData.lfoUpdateTimeouts[i]) { clearTimeout(clipData.lfoUpdateTimeouts[i]); clipData.lfoUpdateTimeouts[i] = null; }
        if (clipData.lfoPitchIntervals[i]) { clearInterval(clipData.lfoPitchIntervals[i]); clipData.lfoPitchIntervals[i] = null; }
        if (clipData.lfoNodes[i]) {
            try { clipData.lfoNodes[i].disconnect(); clipData.lfoNodes[i].stop(); } catch (e) {}
            clipData.lfoNodes[i] = null;
        }
        if (clipData.lfoGainNodes[i]) {
            try { clipData.lfoGainNodes[i].disconnect(); } catch (e) {}
            clipData.lfoGainNodes[i] = null;
        }
        clipData.lfoTargets[i] = "none";
    }

    // Create LFOs per slot
    effects.lfos.forEach((lfo, lfoIndex) => {
        try {
            if (!lfo || lfo.target === 'none' || (lfo.depth || 0) === 0) return;

            // Create oscillator and gain
            const lfoNode = audioContext.createOscillator();
            lfoNode.type = lfo.waveform || 'sine';
            lfoNode.frequency.setValueAtTime(lfo.rate || 1, audioContext.currentTime);

            const lfoGainNode = audioContext.createGain();
            lfoNode.connect(lfoGainNode);

            // Save nodes
            clipData.lfoNodes[lfoIndex] = lfoNode;
            clipData.lfoGainNodes[lfoIndex] = lfoGainNode;

            // Connect to target and start oscillator or polling as needed
            ps_connectLFOToClip(clipData, lfoIndex, lfo, lfoNode, lfoGainNode, source);

            try { lfoNode.start(); } catch (e) {}
            // Start the per-LFO update loop so automation and Apply changes are respected
            try { ps_startLFOUpdateLoop(clipData, lfoIndex); } catch (e) {}
        } catch (err) {
        }
    });
}

// Helper: update LFO gain scaling based on target
function ps_updateLFOGainForClip(clipData, lfoIndex, target, depth, lfoGainNode) {
    if (!lfoGainNode) return;
    if (target === 'volume' && clipData.gainNode && clipData.gainNode.gain) {
        // Match preview: depth * 0.5 (was baseGain * 0.5 * depth - too strong!)
        lfoGainNode.gain.setValueAtTime(depth * 0.5, audioContext.currentTime);
    } else if (target === 'filter' && clipData.filterNode) {
        const baseFreq = clipData.filterNode.frequency ? clipData.filterNode.frequency.value : 1000;
        const maxOctaves = 2;
        const modulationOctaves = maxOctaves * depth;
        const minFreq = baseFreq / Math.pow(2, modulationOctaves);
        const maxFreq = baseFreq * Math.pow(2, modulationOctaves);
        const scaleFactor = (maxFreq - minFreq) / 2;
        lfoGainNode.gain.setValueAtTime(scaleFactor, audioContext.currentTime);
    } else if (target === 'delay-time' && clipData.delayNode) {
        // Match preview: depth * 0.1 (was 0.5 * depth - 5x too strong!)
        const maxMod = 0.1;
        lfoGainNode.gain.setValueAtTime(maxMod * depth, audioContext.currentTime);
    } else if (target === 'delay-feedback' && clipData.feedbackGainNode) {
        const maxMod = 0.3;
        lfoGainNode.gain.setValueAtTime(maxMod * depth, audioContext.currentTime);
    } else if (target === 'pan' && clipData.pannerNode) {
        lfoGainNode.gain.setValueAtTime(depth, audioContext.currentTime);
    } else if (target && target.startsWith('eq-')) {
        const maxMod = 12; lfoGainNode.gain.setValueAtTime(maxMod * depth, audioContext.currentTime);
    }
}

// Helper: disconnect single LFO for a clip
function ps_disconnectSingleLFOForClip(clipData, lfoIndex) {
    if (!clipData) return;
    if (clipData.lfoGainNodes && clipData.lfoGainNodes[lfoIndex]) {
        try { clipData.lfoGainNodes[lfoIndex].disconnect(); } catch (e) {}
    }
    if (clipData.lfoFilterOffsetNodes && clipData.lfoFilterOffsetNodes[lfoIndex]) {
        try { clipData.lfoFilterOffsetNodes[lfoIndex].disconnect(); clipData.lfoFilterOffsetNodes[lfoIndex].stop(); clipData.lfoFilterOffsetNodes[lfoIndex] = null; } catch (e) {}
    }
    if (clipData.lfoUpdateTimeouts && clipData.lfoUpdateTimeouts[lfoIndex]) {
        clearTimeout(clipData.lfoUpdateTimeouts[lfoIndex]); clipData.lfoUpdateTimeouts[lfoIndex] = null;
    }
    if (clipData.lfoPitchIntervals && clipData.lfoPitchIntervals[lfoIndex]) {
        clearInterval(clipData.lfoPitchIntervals[lfoIndex]); clipData.lfoPitchIntervals[lfoIndex] = null;
        if (clipData.lfoTargets && clipData.lfoTargets[lfoIndex] === 'pitch') {
            if (clipData.source && clipData.source.playbackRate) {
                const baseRate = clipData.basePitchRate || 1;
                try { clipData.source.playbackRate.setValueAtTime(baseRate, audioContext.currentTime); } catch (e) {}
            }
        }
    }
    if (clipData.lfoTargets) clipData.lfoTargets[lfoIndex] = 'none';
}

// Helper: connect LFO to clip target (adapted)
function ps_connectLFOToClip(clipData, lfoIndex, lfo, lfoNode, lfoGainNode, source) {
    const target = lfo.target;
    const depth = (lfo.depth || 0) / 100;
    clipData.lfoTargets[lfoIndex] = target;

    if (target === 'pitch') {
        // Use polled approach to modulate playbackRate if detune not available
        if (!clipData.basePitchRate && source && source.playbackRate) clipData.basePitchRate = source.playbackRate.value || 1;

        // Clear existing pitch interval
        if (clipData.lfoPitchIntervals && clipData.lfoPitchIntervals[lfoIndex]) { clearInterval(clipData.lfoPitchIntervals[lfoIndex]); clipData.lfoPitchIntervals[lfoIndex] = null; }
        if (!clipData.lfoPitchIntervals) clipData.lfoPitchIntervals = [null,null,null,null];

        // Start polling interval - 20ms for smooth pitch modulation
        clipData.lfoPitchIntervals[lfoIndex] = setInterval(() => {
            // Don't return early - let the try/catch handle source validity
            // This allows LFO to continue for the full visual clip duration
            const currentRate = lfo.rate || 1.0;
            const currentDepth = (lfo.depth || 0) / 100;
            const waveform = lfo.waveform || 'sine';
            const time = audioContext.currentTime;
            // Sync LFO to clip's start position in arrangement for consistent playback
            // Calculate bar position to time offset
            const clip = clipData.clip; // Need to store clip reference
            const barStartTime = clip ? (clip.startBar * 4 * (60 / arrangementState.tempo)) : 0;
            const arrangementStartTime = arrangementState.startTime || 0;
            const clipAbsoluteStartTime = arrangementStartTime + barStartTime;
            const relativeTime = time - clipAbsoluteStartTime;
            const phase = (relativeTime * currentRate * Math.PI * 2) % (Math.PI * 2);
            let modulation = 0;
            switch (waveform) {
                case 'sine': modulation = Math.sin(phase); break;
                case 'square': modulation = Math.sin(phase) > 0 ? 1 : -1; break;
                case 'triangle': {
                    const t = (phase / Math.PI) % 2; modulation = t < 1 ? 2*t-1 : 3-2*t; break;
                }
                case 'sawtooth': modulation = 2 * ((phase / Math.PI) % 1) - 1; break;
            }
            const maxSemitones = 12; const semitones = modulation * maxSemitones * currentDepth;
            const pitchMultiplier = Math.pow(2, semitones/12);
            const baseRate = clipData.basePitchRate || 1;
            const newRate = Math.max(0.1, Math.min(16, baseRate * pitchMultiplier)); // Clamp to safe range
            try { 
                // Use direct .value assignment for real-time modulation instead of setValueAtTime
                // This avoids scheduling conflicts with the stretch playback rate
                if (source && source.playbackRate) {
                    source.playbackRate.value = newRate;
                }
            } catch (e) { 
                // Don't clear interval on error - let the cleanup timer handle it
                // This allows LFO to continue for full visual clip duration
            }
        }, 20);

    } else if (target === 'volume' && clipData.gainNode && clipData.gainNode.gain) {
        // FIXED: Use constant source for base volume + LFO for modulation
        // LFO oscillates -1 to +1, so we need offset to prevent silence
        const baseGain = clipData.gainNode.gain.value;
        
        // DON'T set gain to 0 - keep it at base value
        // This way, if LFO disconnects, volume returns to base automatically
        
        // Create constant source for DC offset so LFO modulates AROUND the base
        // The gain parameter becomes: base + (LFO × scaling)
        // We want total range: base × (1 ± depth×0.5)
        // So LFO contribution: base × depth × 0.5 × LFO(-1 to +1)
        
        lfoGainNode.gain.value = baseGain * depth * 0.5;
        lfoGainNode.connect(clipData.gainNode.gain);
        
        // NOTE: No offset node needed! The gain.value stays at baseGain,
        // and the LFO adds/subtracts from it
    } else if (target === 'filter' && clipData.filterNode) {
        const baseFrequency = clipData.filterNode.frequency ? clipData.filterNode.frequency.value : 1000;
        const lfoDepth = depth; const maxOctaves = 2; const modulationOctaves = maxOctaves * lfoDepth;
        const minFrequency = baseFrequency / Math.pow(2, modulationOctaves); const maxFrequency = baseFrequency * Math.pow(2, modulationOctaves);
        const scaleFactor = (maxFrequency - minFrequency)/2; lfoGainNode.gain.value = scaleFactor; lfoGainNode.connect(clipData.filterNode.frequency);
        // Create offset constant to center LFO
        const offsetNode = audioContext.createConstantSource(); offsetNode.offset.value = (maxFrequency + minFrequency)/2; offsetNode.connect(clipData.filterNode.frequency); offsetNode.start();
        clipData.lfoFilterOffsetNodes = clipData.lfoFilterOffsetNodes || []; clipData.lfoFilterOffsetNodes[lfoIndex] = offsetNode;
    } else if (target === 'delay-time' && clipData.delayNode) {
        const maxMod = 0.5; lfoGainNode.gain.value = maxMod * depth; lfoGainNode.connect(clipData.delayNode.delayTime);
    } else if (target === 'delay-feedback' && clipData.feedbackGainNode) {
        const maxMod = 0.3; lfoGainNode.gain.value = maxMod * depth; lfoGainNode.connect(clipData.feedbackGainNode.gain);
    } else if (target === 'reverb-mix' && clipData.reverbWetGain) {
        const maxMod = 0.3; lfoGainNode.gain.value = maxMod * depth; lfoGainNode.connect(clipData.reverbWetGain.gain);
    } else if (target && target.startsWith('eq-')) {
        const maxMod = 12; lfoGainNode.gain.value = maxMod * depth;
        if (target === 'eq-low' && clipData.eqNodes && clipData.eqNodes.low) lfoGainNode.connect(clipData.eqNodes.low.gain);
        if (target === 'eq-lowmid' && clipData.eqNodes && clipData.eqNodes.lowmid) lfoGainNode.connect(clipData.eqNodes.lowmid.gain);
        if (target === 'eq-mid' && clipData.eqNodes && clipData.eqNodes.mid) lfoGainNode.connect(clipData.eqNodes.mid.gain);
        if (target === 'eq-highmid' && clipData.eqNodes && clipData.eqNodes.highmid) lfoGainNode.connect(clipData.eqNodes.highmid.gain);
        if (target === 'eq-high' && clipData.eqNodes && clipData.eqNodes.high) lfoGainNode.connect(clipData.eqNodes.high.gain);
    } else if (target === 'pan' && clipData.pannerNode) {
        lfoGainNode.gain.value = depth; lfoGainNode.connect(clipData.pannerNode.pan);
    }
}

// Start an update loop for a clip's single LFO index to adapt to runtime changes
function ps_startLFOUpdateLoop(clipData, lfoIndex) {
    if (!clipData) return;
    // Ensure array exists
    clipData.lfoUpdateTimeouts = clipData.lfoUpdateTimeouts || [null, null, null, null];

    const updateFn = () => {
        // If source is gone, stop
        if (!clipData.source) return;

        const effects = (clipData.source && clipData.source._effects) ? clipData.source._effects : null;
        // Try to read effects from clipData.effects fallback
        const lfos = (effects && effects.lfos) ? effects.lfos : (clipData.effects && clipData.effects.lfos ? clipData.effects.lfos : null);

        const currentLfo = lfos ? lfos[lfoIndex] : null;

        // If there's no LFO config or it's disabled, disconnect if present
        const shouldBeActive = currentLfo && currentLfo.target && currentLfo.target !== 'none' && (currentLfo.depth || 0) > 0;
        const isActive = clipData.lfoNodes && clipData.lfoNodes[lfoIndex];

        if (shouldBeActive && !isActive) {
            // Reinitialize nodes from saved config if possible
            try {
                const cfg = currentLfo;
                const node = audioContext.createOscillator();
                node.type = cfg.waveform || 'sine';
                node.frequency.setValueAtTime(cfg.rate || 1, audioContext.currentTime);
                const gainNode = audioContext.createGain();
                node.connect(gainNode);
                clipData.lfoNodes[lfoIndex] = node;
                clipData.lfoGainNodes[lfoIndex] = gainNode;
                // Reconnect using helper
                ps_connectLFOToClip(clipData, lfoIndex, cfg, node, gainNode, clipData.source);
                try { node.start(); } catch (e) {}
            } catch (e) {}
        } else if (!shouldBeActive && isActive) {
            // Disconnect
            ps_disconnectSingleLFOForClip(clipData, lfoIndex);
        } else if (shouldBeActive && isActive) {
            // Update oscillator rate and gain scaling
            const node = clipData.lfoNodes[lfoIndex];
            const gain = clipData.lfoGainNodes[lfoIndex];
            try {
                if (node && node.frequency && currentLfo) node.frequency.setValueAtTime(currentLfo.rate || 1, audioContext.currentTime);
                if (gain && currentLfo) ps_updateLFOGainForClip(clipData, lfoIndex, currentLfo.target, (currentLfo.depth || 0) / 100, gain);
            } catch (e) {}
        }

        // schedule next
        clipData.lfoUpdateTimeouts[lfoIndex] = setTimeout(updateFn, 50);
    };

    // Kick it off
    if (clipData.lfoUpdateTimeouts[lfoIndex]) clearTimeout(clipData.lfoUpdateTimeouts[lfoIndex]);
    clipData.lfoUpdateTimeouts[lfoIndex] = setTimeout(updateFn, 50);
}

// APPLY AUTOMATIONS TO SAMPLE
function applyAutomationsToSample(source, filterNode, gainNode, effects, startTime, clipDuration, clipData) {
    if (!effects.automations || !Array.isArray(effects.automations)) return;
    try { if (clipData) clipData.effects = effects; } catch (e) {}
    
    const updateInterval = 100; // Update every 100ms (was 50ms - reduced for performance)
    
    if (!clipData.automationIntervals) {
        clipData.automationIntervals = [];
    }
    
    effects.automations.forEach((auto, index) => {
        if (auto.target === 'none') return;
        
        const intervalId = setInterval(() => {
            const currentTime = audioContext.currentTime;
            const autoValue = getAutomationValue(auto, startTime, currentTime, clipDuration);
            
            try {
                switch (auto.target) {
                    case 'volume':
                        if (gainNode && gainNode.gain) {
                            gainNode.gain.setValueAtTime(autoValue, currentTime);
                        }
                        break;
                        
                    case 'pitch':
                        if (source && source.playbackRate) {
                            // Map 0-1 to 0.5x - 2x playback rate
                            const pitchRate = 0.5 + (autoValue * 1.5);
                            source.playbackRate.setValueAtTime(pitchRate, currentTime);
                        }
                        break;
                        
                    case 'filter':
                        if (filterNode && filterNode.frequency) {
                            // Map 0-1 to 20Hz - 20kHz
                            const cutoff = 20 + (autoValue * 19980);
                            filterNode.frequency.setValueAtTime(cutoff, currentTime);
                        }
                        break;
                        
                        case 'delay-time':
                            if (clipData.delayNode && clipData.delayNode.delayTime) {
                                const newDelay = Math.max(0, (autoValue * 2)); // map 0-1 to 0-2s
                                clipData.delayNode.delayTime.setValueAtTime(newDelay, currentTime);
                            }
                            break;

                        case 'delay-feedback':
                            if (clipData.feedbackGainNode && clipData.feedbackGainNode.gain) {
                                const newFeedback = Math.max(0, Math.min(0.99, autoValue));
                                clipData.feedbackGainNode.gain.setValueAtTime(newFeedback, currentTime);
                            }
                            break;

                        case 'pan':
                            if (clipData.pannerNode && clipData.pannerNode.pan) {
                                const newPan = Math.max(-1, Math.min(1, (autoValue * 2) - 1));
                                clipData.pannerNode.pan.setValueAtTime(newPan, currentTime);
                            }
                            break;
                        
                    case 'pan':
                        // Would require StereoPannerNode
                        break;
                }
            } catch (e) {
                clearInterval(intervalId);
            }
        }, updateInterval);
        
        clipData.automationIntervals.push(intervalId);
    });
}

async function scheduleSampleClip(clip, startTime, offset = 0) {
    // Try to get sample buffer - check type from audioSource or infer from clip.data
    let buffer = null;
    const sampleKey = clip.data;
    const isCustomSample = typeof sampleKey === 'string' && (sampleKey.startsWith('custom_') || sampleKey.startsWith('recording_'));
    const isFromFolder = clip.isFromFolder && !isCustomSample;
    
    if (isCustomSample) {
        // Custom uploaded or recorded sample - get from sampleBuffers
        buffer = sampleBuffers[sampleKey];

        // PROFESSIONAL: On-demand loading - load from disk if not in memory
        if (!buffer && customSampleOriginalPaths[sampleKey]) {
            const filePath = customSampleOriginalPaths[sampleKey];
            
            try {
                const result = await window.electronAPI.readAudioFile(filePath);
                if (result && result.success && result.data) {
                    const arrayBuffer = new Uint8Array(result.data).buffer;
                    buffer = await audioContext.decodeAudioData(arrayBuffer);
                    sampleBuffers[sampleKey] = buffer; // Cache it for next time
                }
            } catch (err) {
                console.error(`Failed to load sample on-demand:`, err);
            }
        }
        
        if (!buffer) {
            console.warn(`Sample ${sampleKey} not found in memory or disk`);
        }
    } else if (isFromFolder) {
        // Get from folder audio buffers
        buffer = getAudioBuffer(sampleKey, true);

        // Wait for buffer if still loading in background
        if (!buffer) {
            const maxWaitTime = 15000; // 15 seconds for large files
            const startWait = Date.now();
            
            while (!buffer && (Date.now() - startWait) < maxWaitTime) {
                buffer = getAudioBuffer(clip.data, true);
                if (buffer) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!buffer) {
                console.warn(`Folder sample ${sampleKey} timeout`);
            }
        }
    } else {
        // Get from standard sample buffers
        buffer = sampleBuffers[clip.data];
        
        // If not loaded, try to load it now (only for numbered samples)
        if (!buffer && typeof clip.data === 'number') {

            await loadSampleBuffer(clip.data);
            buffer = sampleBuffers[clip.data];
        }
    }
    
    if (!buffer) {
        playTestToneAt(startTime, 440, 0.5);
        return;
    }
    
    // Get effects for this clip
    const effects = clip.effects || getDefaultEffects();
    
    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Apply speed (playback rate)
    let playbackRate = effects.speed || 1;
    
    // Apply pitch shift if specified (multiply with speed)
    if (effects.pitch && effects.pitch !== 0) {
        // Convert semitones to playback rate and multiply with speed
        playbackRate *= Math.pow(2, effects.pitch / 12);
    }
    
    // Apply tempo multiplier (120 BPM is the reference tempo = 1.0x speed)
    // This makes samples play faster/slower with BPM changes
    // Support tempos from 40 to 1000 BPM (multipliers: 0.33x to 8.33x)
    const tempoMultiplier = arrangementState.tempo / 120;
    playbackRate *= tempoMultiplier;
    playbackRate = Math.max(0.1, Math.min(16, playbackRate)); // Clamp to safe range
    
    source.playbackRate.value = playbackRate;
    
    // Create audio processing chain: source -> eq -> filter -> delay -> reverb -> gain -> destination
    let currentNode = source;
    
    // --- Patch: Use interactive EQ points for real-time EQ ---
    let eqNodes = {};
    if (effects.eq && Array.isArray(effects.eq)) {
        // Create up to 12 peaking filters from EQ points
        let lastNode = currentNode;
        effects.eq.forEach((point, idx) => {
            const eqNode = audioContext.createBiquadFilter();
            eqNode.type = point.type || (point.frequency <= 200 ? 'lowshelf' : point.frequency >= 8000 ? 'highshelf' : 'peaking');
            eqNode.frequency.value = point.frequency;
            eqNode.gain.value = point.gain;
            eqNode.Q.value = point.q || 1;
            lastNode.connect(eqNode);
            lastNode = eqNode;
            eqNodes[`band${idx}`] = eqNode;
        });
        currentNode = lastNode;
    } else {
        // Fallback to 5-band object
        const eqLow = audioContext.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.value = 200;
        eqLow.gain.value = effects.eq ? (effects.eq.low || 0) : 0;
        eqNodes.low = eqLow;

        const eqLowMid = audioContext.createBiquadFilter();
        eqLowMid.type = 'peaking';
        eqLowMid.frequency.value = 500;
        eqLowMid.Q.value = 1;
        eqLowMid.gain.value = effects.eq ? (effects.eq.lowmid || 0) : 0;
        eqNodes.lowmid = eqLowMid;

        const eqMid = audioContext.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.value = 1500;
        eqMid.Q.value = 1;
        eqMid.gain.value = effects.eq ? (effects.eq.mid || 0) : 0;
        eqNodes.mid = eqMid;

        const eqHighMid = audioContext.createBiquadFilter();
        eqHighMid.type = 'peaking';
        eqHighMid.frequency.value = 4000;
        eqHighMid.Q.value = 1;
        eqHighMid.gain.value = effects.eq ? (effects.eq.highmid || 0) : 0;
        eqNodes.highmid = eqHighMid;

        const eqHigh = audioContext.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.value = 8000;
        eqHigh.gain.value = effects.eq ? (effects.eq.high || 0) : 0;
        eqNodes.high = eqHigh;

        // Chain EQ filters
        currentNode.connect(eqLow);
        eqLow.connect(eqLowMid);
        eqLowMid.connect(eqMid);
        eqMid.connect(eqHighMid);
        eqHighMid.connect(eqHigh);
        currentNode = eqHigh;
    }
    
    // ALWAYS create filter node for real-time updates (start with type that passes through)
    const filterNode = audioContext.createBiquadFilter();
    filterNode.type = (effects.filter && effects.filter.type !== 'none') ? effects.filter.type : 'allpass';
    filterNode.frequency.value = effects.filter ? effects.filter.cutoff : 1000;
    filterNode.Q.value = effects.filter ? effects.filter.resonance : 0;
    currentNode.connect(filterNode);
    currentNode = filterNode;
    
    // Store delay nodes for real-time updates
    let delayNode = null;
    let delayGainNode = null;
    let feedbackGainNode = null;
    
    // Apply delay if specified
    if (effects.delay && effects.delay.time > 0) {
        delayNode = audioContext.createDelay();
        const delayWetGain = audioContext.createGain();
        const dryGain = audioContext.createGain();
        feedbackGainNode = audioContext.createGain();
        
        delayNode.delayTime.value = effects.delay.time / 1000; // Convert ms to seconds
        feedbackGainNode.gain.value = effects.delay.feedback / 100;
        delayWetGain.gain.value = 0.5; // 50% wet
        dryGain.gain.value = 1.0; // 100% dry
        
        // Create feedback loop
        currentNode.connect(delayNode);
        delayNode.connect(feedbackGainNode);
        feedbackGainNode.connect(delayNode); // Feedback loop
        
        // Mix wet and dry paths
        delayNode.connect(delayWetGain); // Wet signal from delay
        currentNode.connect(dryGain); // Dry signal bypasses delay
        
        // Merge both paths
        const mixNode = audioContext.createGain();
        delayWetGain.connect(mixNode);
        dryGain.connect(mixNode);
        
        delayGainNode = delayWetGain; // Store for real-time updates
        currentNode = mixNode;
    }
    
    // Apply reverb if specified (simplified convolver-based reverb)
    if (effects.reverb && effects.reverb.mix > 0) {
        // Create a simple impulse response for reverb
        const reverbTime = Math.max(0.1, effects.reverb.decay || 2); // Minimum 0.1 seconds
        const sampleRate = audioContext.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * reverbTime)); // Ensure at least 1 frame
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);
        
        const damping = effects.reverb.damping || 50;
        for (let i = 0; i < length; i++) {
            const n = length - i;
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, damping / 50);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, damping / 50);
        }
        
        const convolver = audioContext.createConvolver();
        convolver.buffer = impulse;
        
        const reverbGain = audioContext.createGain();
        reverbGain.gain.value = effects.reverb.mix / 100;
        
        const dryGain = audioContext.createGain();
        dryGain.gain.value = 1 - (effects.reverb.mix / 100);
        
        currentNode.connect(convolver);
        convolver.connect(reverbGain);
        currentNode.connect(dryGain);
        
        // Merge wet and dry
        const merger = audioContext.createGain();
        reverbGain.connect(merger);
        dryGain.connect(merger);
        currentNode = merger;
    }
    
    // Apply volume gain with safety check
    const gainNode = audioContext.createGain();
    const volumeValue = (typeof effects.volume === 'number' && isFinite(effects.volume)) ? effects.volume : 100;
    gainNode.gain.value = Math.max(0, Math.min(1, (volumeValue / 100) * 0.7)); // Clamp to 0-0.7 range
    
    // Insert stereo panner before final gain so LFO/Automation can modulate pan
    const pannerNode = audioContext.createStereoPanner ? audioContext.createStereoPanner() : null;
    if (pannerNode) {
        pannerNode.pan.value = 0;
        currentNode.connect(pannerNode);
        pannerNode.connect(gainNode);
    } else {
        currentNode.connect(gainNode);
    }
    
    // Connect to destination
    gainNode.connect(audioContext.destination);
    
    // Create clip data object for LFO/Automation tracking
    const clipPlaybackData = {
        clip: clip, // Store clip reference for LFO syncing to clip position
        source: source,
        gainNode: gainNode,
        filterNode: filterNode,
        delayNode: delayNode,
        delayGainNode: delayGainNode,
        feedbackGainNode: feedbackGainNode,
        pannerNode: pannerNode,
        lfoIntervals: [],
        automationIntervals: [],
        basePitchRate: source.playbackRate.value,
        baseGain: gainNode.gain.value
    };
    
    // Store audio nodes for real-time effect updates
    arrangementState.activeClipNodes[clip.id] = {
        gainNode: gainNode,
        filterNode: filterNode,
        eqNodes: eqNodes,
        delayNode: delayNode,
        delayGainNode: delayGainNode,
        feedbackGainNode: feedbackGainNode,
        source: source
    };
    
    // Clean up nodes when clip finishes
    source.onended = () => {
        delete arrangementState.activeClipNodes[clip.id];
    };

    // Ensure we clean up automation timers and oscillators when the source stops
    // CRITICAL FIX FOR STRETCHED CLIPS WITH LFO PITCH:
    // For stretched clips, the audio buffer plays faster (via playbackRate) and ends before
    // the visual clip duration expires. However, LFO pitch modulation uses intervals that
    // need to continue modulating even after the audio ends, until the visual clip ends.
    // 
    // Example: 2-bar sample stretched to 4 bars
    // - Audio plays at 2x speed and ends after 2 bars worth of time
    // - Visual clip continues for 4 bars in the arrangement
    // - LFO pitch must continue for the full 4 bars
    // 
    // Solution: Calculate remaining visual clip time and schedule final cleanup accordingly
    const originalOnEnded = source.onended;
    
    // Calculate actual clip duration in song time - use clip.length (the VISIBLE trimmed length)
    const beatDuration = 60 / arrangementState.tempo;
    const barDuration = beatDuration * 4;
    const actualClipDuration = clip.length * barDuration;
    
    source.onended = () => {
        try {
            // Find the clipPlaybackData entry
            if (arrangementState.clipPlaybackData && Array.isArray(arrangementState.clipPlaybackData)) {
                const clipData = arrangementState.clipPlaybackData.find(cp => cp && cp.source === source);
                
                if (clipData) {
                    // Calculate how long until the visual clip ends
                    const audioEndTime = audioContext.currentTime;
                    const clipStartTime = startTime;
                    const audioPlayDuration = audioEndTime - clipStartTime;
                    const remainingClipTime = Math.max(0, actualClipDuration - audioPlayDuration);
                    
                    if (remainingClipTime > 0.1) {
                        // Schedule final cleanup after the visual clip ends
                        setTimeout(() => {
                            // Clean up update timeouts
                            if (clipData.lfoUpdateTimeouts) clipData.lfoUpdateTimeouts.forEach(t => { try { clearTimeout(t); } catch(e){} });
                            // NOW we can clear lfoPitchIntervals - after the full visual clip duration
                            if (clipData.lfoPitchIntervals) clipData.lfoPitchIntervals.forEach(i => { try { clearInterval(i); } catch(e){} });
                            if (clipData.lfoNodes) clipData.lfoNodes.forEach(n => { try { if (n) { n.stop(); n.disconnect(); } } catch(e){} });
                            if (clipData.lfoGainNodes) clipData.lfoGainNodes.forEach(g => { try { if (g) g.disconnect(); } catch(e){} });
                            if (clipData.automationIntervals) clipData.automationIntervals.forEach(i => { try { clearInterval(i); } catch(e){} });
                            
                            // Remove from active nodes
                            delete arrangementState.activeClipNodes[clip.id];
                        }, remainingClipTime * 1000);
                    } else {
                        // Clip ended naturally, clean up immediately
                        if (clipData.lfoUpdateTimeouts) clipData.lfoUpdateTimeouts.forEach(t => { try { clearTimeout(t); } catch(e){} });
                        if (clipData.lfoPitchIntervals) clipData.lfoPitchIntervals.forEach(i => { try { clearInterval(i); } catch(e){} });
                        if (clipData.lfoNodes) clipData.lfoNodes.forEach(n => { try { if (n) { n.stop(); n.disconnect(); } } catch(e){} });
                        if (clipData.lfoGainNodes) clipData.lfoGainNodes.forEach(g => { try { if (g) g.disconnect(); } catch(e){} });
                        if (clipData.automationIntervals) clipData.automationIntervals.forEach(i => { try { clearInterval(i); } catch(e){} });
                        
                        delete arrangementState.activeClipNodes[clip.id];
                    }
                }
            }
        } catch (e) {
        }

        try { if (typeof originalOnEnded === 'function') originalOnEnded(); } catch (e) {}
    };
    
    // Apply stretch ratio BEFORE LFOs so the base pitch rate includes stretch
    if (clip.stretchMode === true) {
        const originalBars = clip.originalLength || clip.length;
        const stretchedBars = clip.stretchedLength || clip.originalLength || clip.length;
        const stretchRatio = originalBars / stretchedBars;
        
        source.playbackRate.value *= stretchRatio;
    }
    
    // Update basePitchRate AFTER stretch is applied so LFO modulates from correct base
    clipPlaybackData.basePitchRate = source.playbackRate.value;
    
    // Calculate the effective duration for effects/automation
    // Use clip.length (the VISIBLE trimmed length) for effects duration
    // This ensures effects run for the entire visible clip, whether stretched or trimmed
    const effectiveDuration = clip.length * barDuration;
    
    // Apply LFO modulation (uses the stretch-adjusted playback rate as base)
    applyLFOsToSample(source, clipPlaybackData.filterNode, gainNode, effects, startTime, clipPlaybackData);
    
    // Apply Automation with the visible clip duration
    applyAutomationsToSample(source, clipPlaybackData.filterNode, gainNode, effects, startTime, effectiveDuration, clipPlaybackData);
    
    // PLAYBACK: Play exactly clip.length bars worth of audio, starting from trimStart
    const scheduleTime = Math.max(startTime, audioContext.currentTime);
    
    const trimStartBars = clip.trimStart || 0;
    const originalBars = clip.originalLength || clip.length;
    
    // When stretched, trim values are in stretched space, need to convert to buffer space
    let bufferStartOffset, bufferPlayDuration;
    
    if (clip.stretchMode === true) {
        // Stretched clip: trim values are in stretched bar units
        const stretchedBars = clip.stretchedLength || originalBars;
        
        // Convert trim positions from stretched space to original space
        const originalTrimStart = (trimStartBars / stretchedBars) * originalBars;
        const originalClipLength = (clip.length / stretchedBars) * originalBars;
        
        // Now map to buffer
        bufferStartOffset = (originalTrimStart / originalBars) * buffer.duration;
        bufferPlayDuration = (originalClipLength / originalBars) * buffer.duration;
    } else {
        // Non-stretched: trim values directly map to buffer
        bufferStartOffset = (trimStartBars / originalBars) * buffer.duration;
        bufferPlayDuration = (clip.length / originalBars) * buffer.duration;
    }
    
    // Account for mid-clip joining (offset parameter)
    const midClipOffset = (offset / barDuration) / clip.length * bufferPlayDuration;
    const actualStart = bufferStartOffset + midClipOffset;
    const actualDuration = Math.max(0, bufferPlayDuration - midClipOffset);
    
    // Start with duration limit - playback rate is already set for stretch
    source.start(scheduleTime, actualStart, actualDuration);
    
    // Track for cleanup
    if (!arrangementState.scheduledSources) {
        arrangementState.scheduledSources = [];
    }
    arrangementState.scheduledSources.push(source);
    
    // Store clip data for later cleanup
    if (!arrangementState.clipPlaybackData) {
        arrangementState.clipPlaybackData = [];
    }
    arrangementState.clipPlaybackData.push(clipPlaybackData);
    
    // DON'T clear intervals when source ends - they should run for the full clip duration
    // LFO intervals will be cleaned up when playback stops globally
    // source.onended = () => {
    //     clipPlaybackData.lfoIntervals.forEach(id => clearInterval(id));
    //     clipPlaybackData.automationIntervals.forEach(id => clearInterval(id));
    // };
    
}

async function scheduleClipWithOffset(clip, startTime, offsetSeconds) {
    // Similar to scheduleSampleClip but starts from a specific offset
    let buffer = sampleBuffers[clip.data];
    
    // Only try to load if it's a numbered sample
    if (!buffer && typeof clip.data === 'number') {
        await loadSampleBuffer(clip.data);
        buffer = sampleBuffers[clip.data];
    }
    
    if (!buffer) {
        return;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Get effects (use clip effects or defaults)
    const effects = clip.effects || getDefaultEffects();
    
    // Create full effect chain (matching preview)
    const gainNode = audioContext.createGain();
    const scaledVolume = (effects.volume / 100) * 0.7; // Match preview scaling
    gainNode.gain.value = scaledVolume;
    
    // Create EQ nodes
    const eqNodes = {
        low: audioContext.createBiquadFilter(),
        lowmid: audioContext.createBiquadFilter(),
        mid: audioContext.createBiquadFilter(),
        highmid: audioContext.createBiquadFilter(),
        high: audioContext.createBiquadFilter()
    };
    
    eqNodes.low.type = 'lowshelf';
    eqNodes.low.frequency.value = 200;
    eqNodes.lowmid.type = 'peaking';
    eqNodes.lowmid.frequency.value = 500;
    eqNodes.lowmid.Q.value = 1;
    eqNodes.mid.type = 'peaking';
    eqNodes.mid.frequency.value = 1500;
    eqNodes.mid.Q.value = 1;
    eqNodes.highmid.type = 'peaking';
    eqNodes.highmid.frequency.value = 4000;
    eqNodes.highmid.Q.value = 1;
    eqNodes.high.type = 'highshelf';
    eqNodes.high.frequency.value = 8000;
    
    // Apply EQ settings
    if (Array.isArray(effects.eq)) {
        const p1 = effects.eq[0] || { frequency: 200, gain: 0 };
        const p2 = effects.eq[1] || { frequency: 500, gain: 0 };
        const p3 = effects.eq[2] || { frequency: 1500, gain: 0 };
        const p4 = effects.eq[3] || { frequency: 4000, gain: 0 };
        const p5 = effects.eq[4] || { frequency: 8000, gain: 0 };
        
        eqNodes.low.frequency.value = p1.frequency;
        eqNodes.low.gain.value = p1.gain;
        eqNodes.lowmid.frequency.value = p2.frequency;
        eqNodes.lowmid.gain.value = p2.gain;
        eqNodes.mid.frequency.value = p3.frequency;
        eqNodes.mid.gain.value = p3.gain;
        eqNodes.highmid.frequency.value = p4.frequency;
        eqNodes.highmid.gain.value = p4.gain;
        eqNodes.high.frequency.value = p5.frequency;
        eqNodes.high.gain.value = p5.gain;
    }
    
    // Chain EQ nodes
    eqNodes.low.connect(eqNodes.lowmid);
    eqNodes.lowmid.connect(eqNodes.mid);
    eqNodes.mid.connect(eqNodes.highmid);
    eqNodes.highmid.connect(eqNodes.high);
    
    // Create filter node
    const filterNode = audioContext.createBiquadFilter();
    if (effects.filter && effects.filter.type !== 'none') {
        filterNode.type = effects.filter.type;
        filterNode.frequency.value = effects.filter.cutoff;
        filterNode.Q.value = effects.filter.resonance;
    } else {
        filterNode.type = 'allpass';
    }
    eqNodes.high.connect(filterNode);
    
    // Create delay nodes (if delay is used)
    let finalNode = filterNode;
    if (effects.delay && effects.delay.time > 0) {
        const delayNode = audioContext.createDelay(5.0);
        const feedbackNode = audioContext.createGain();
        const delayWetGain = audioContext.createGain();
        const dryGain = audioContext.createGain();
        
        delayNode.delayTime.value = effects.delay.time / 1000;
        feedbackNode.gain.value = effects.delay.feedback / 100;
        delayWetGain.gain.value = 0.5; // 50% wet
        dryGain.gain.value = 1.0; // 100% dry
        
        filterNode.connect(delayNode);
        delayNode.connect(feedbackNode);
        feedbackNode.connect(delayNode); // Feedback loop
        
        delayNode.connect(delayWetGain);
        filterNode.connect(dryGain);
        
        const mixNode = audioContext.createGain();
        delayWetGain.connect(mixNode);
        dryGain.connect(mixNode);
        finalNode = mixNode;
    }
    
    // Connect source -> EQ chain -> gain -> destination
    source.connect(eqNodes.low);
    finalNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Add the user offset to trimStart
    const trimStart = (clip.trimStart || 0);
    const barsPerSecond = arrangementState.tempo / 60 / 4;
    const totalOffsetSeconds = (trimStart / barsPerSecond) + offsetSeconds;
    
    const remainingDuration = (clip.length / barsPerSecond) - offsetSeconds;
    
    const scheduleTime = Math.max(startTime, audioContext.currentTime);
    
    const originalDurationBars = buffer.duration * barsPerSecond;
    
    // Use the stretchMode flag to determine playback method
    if (clip.stretchMode === true) {
        const beatDuration = 60 / arrangementState.tempo;
        const barDuration = beatDuration * 4;
        
        // Calculate the original audio duration (from originalLength or fallback)
        const originalBars = clip.originalLength || clip.length;
        const originalDuration = originalBars * barDuration;
        
        // Audio portion after trim
        const audioPortionDuration = Math.max(0.001, originalDuration - (trimStart / barsPerSecond));
        
        // Adjust playback rate to fit into clip.length
        const targetDuration = clip.length * barDuration;
        source.playbackRate.value = audioPortionDuration / targetDuration;
        source.start(scheduleTime, totalOffsetSeconds);
        
    } else {
        source.start(scheduleTime, totalOffsetSeconds, remainingDuration);
    }
    
    if (!arrangementState.scheduledSources) {
        arrangementState.scheduledSources = [];
    }
    arrangementState.scheduledSources.push(source);
    
}

function schedulePatternClip(clip, startTime, offset = 0) {
    // Force reload of pattern object from arrangementState before playback
    const pattern = arrangementState.patterns[clip.data];
    if (!pattern || !pattern.notes || pattern.notes.length === 0) {
        return;
    }
    // Debug: Confirm reference and effects

    // For pattern clips, always use effects from the pattern object (canonical source)
    // Use array of EQ points if present, fallback to object for legacy
    let effects = pattern.effects || getDefaultEffects();
    // Patch: Pass interactive EQ array directly to playback functions for real-time EQ
    // (No conversion to 5-band object; playback functions now support array format)

    
    const beatDuration = 60 / arrangementState.tempo;
    const stepDuration = beatDuration / 4; // 16th notes
    const patternDurationBars = pattern.length || 1; // Pattern length in bars
    const patternDurationSteps = pattern.gridWidth || (patternDurationBars * 16); // Use gridWidth if available
    
    // Calculate how many times to repeat the pattern
    const clipDurationBars = clip.length;
    const repetitions = Math.ceil(clipDurationBars / patternDurationBars);
    
    // Schedule each repetition
    for (let rep = 0; rep < repetitions; rep++) {
        const repOffset = rep * patternDurationSteps * stepDuration;
        
        // Schedule each note in this repetition
        pattern.notes.forEach(note => {
            // New piano roll format: note has {row, col, length, velocity}
            const noteCol = note.col !== undefined ? note.col : note.step; // Support both formats
            const noteTime = startTime + repOffset + (noteCol * stepDuration) - offset;
            const noteDuration = (note.length || 1) * stepDuration;
            
            // Skip notes that would have already played due to offset
            if (noteTime < audioContext.currentTime) {
                return; // Skip this note
            }
            
            // Calculate frequency from row number
            let frequency;
            if (note.row !== undefined) {
                // New format: row number (0-83 for 7 octaves)
                frequency = rowToFrequency(note.row);
            } else if (note.note) {
                // Old format: note name like "C4"
                frequency = noteToFrequency(note.note);
            } else {
                frequency = 440; // Default
            }
            
            // Only play if within clip duration
            if (repOffset + (noteCol * stepDuration) < clipDurationBars * 4 * beatDuration) {
                // Check sound source
                if (pattern.soundSource === 'sample') {
                    // Play sample at pitch (with effects and pattern LFOs)
                    playPatternSampleScheduled(noteTime, frequency, noteDuration, effects, pattern.lfos);
                } else {
                    // Play synth note with sound design (with effects and pattern LFOs)
                    playPatternSynthScheduled(noteTime, frequency, noteDuration, pattern.soundDesign, effects, pattern.lfos);
                }
            }
        });
    }

}

// Update active clip nodes when effects change so changes take effect during playback
function updateActiveClipEffects(clip, effects) {
    if (!clip || !clip.id) return;
    const nodes = arrangementState.activeClipNodes ? arrangementState.activeClipNodes[clip.id] : null;
    if (!nodes) return; // Not currently playing

    try {
        // Update gain
        if (nodes.gainNode && effects.volume !== undefined) {
            nodes.gainNode.gain.setValueAtTime((effects.volume / 100) * 0.7, audioContext.currentTime);
        }

        // Update filter
        if (nodes.filterNode && effects.filter) {
            if (effects.filter.type && effects.filter.type !== 'none') nodes.filterNode.type = effects.filter.type;
            if (effects.filter.cutoff !== undefined) nodes.filterNode.frequency.setValueAtTime(effects.filter.cutoff, audioContext.currentTime);
            if (effects.filter.resonance !== undefined) nodes.filterNode.Q.setValueAtTime(effects.filter.resonance, audioContext.currentTime);
        }

        // Update delay
        if (nodes.delayNode && effects.delay) {
            if (effects.delay.time !== undefined) nodes.delayNode.delayTime.setValueAtTime(effects.delay.time / 1000, audioContext.currentTime);
            if (nodes.feedbackGainNode && effects.delay.feedback !== undefined) nodes.feedbackGainNode.gain.setValueAtTime(effects.delay.feedback / 100, audioContext.currentTime);
        }

        // Update panner
        if (nodes.pannerNode && effects.pan !== undefined && typeof nodes.pannerNode.pan !== 'undefined') {
            nodes.pannerNode.pan.setValueAtTime(effects.pan, audioContext.currentTime);
        }

        // Restart LFO/Automation processing for this clip by clearing intervals and re-applying
        if (arrangementState.clipPlaybackData && Array.isArray(arrangementState.clipPlaybackData)) {
            arrangementState.clipPlaybackData.forEach(clipData => {
                if (clipData && clipData.source && clipData.source === nodes.source) {
                    // Clear existing intervals
                    if (clipData.lfoIntervals) { clipData.lfoIntervals.forEach(id => clearInterval(id)); clipData.lfoIntervals = []; }
                    if (clipData.automationIntervals) { clipData.automationIntervals.forEach(id => clearInterval(id)); clipData.automationIntervals = []; }

                    // Re-apply using the new effects
                    try { applyLFOsToSample(clipData.source, clipData.filterNode, nodes.gainNode, effects, audioContext.currentTime - 0.01, clipData); } catch (e) {}
                    try { applyAutomationsToSample(clipData.source, clipData.filterNode, nodes.gainNode, effects, audioContext.currentTime - 0.01, (clip.length || 4) * (60 / arrangementState.tempo) * 4, clipData); } catch (e) {}
                }
            });
        }
    } catch (e) {
    }
}

function rowToFrequency(row) {
    // Calculate frequency from piano roll row (0-83 for C0-B6)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(row / 12);
    const noteIndex = row % 12;
    
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    
    const noteName = noteNames[noteIndex];
    const baseFreq = noteFrequencies[noteName];
    return baseFreq * Math.pow(2, octave);
}

function getNoteFrequency(noteName, octave) {
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    const baseFreq = noteFrequencies[noteName];
    return baseFreq * Math.pow(2, octave);
}

function playPatternSampleScheduled(time, frequency, duration, effects, patternLFOs) {
    if (!audioContext) return;
    

    if (effects) {



    }
    
    const sampleNum = 1; // Default kick sample
    if (!sampleBuffers[sampleNum]) return;
    
    const source = audioContext.createBufferSource();
    source.buffer = sampleBuffers[sampleNum];
    
    // Pitch shift
    const basePitch = 440; // A4
    let playbackRate = frequency / basePitch;
    
    // Apply speed effect
    if (effects && effects.speed) {
        playbackRate *= effects.speed;
    }
    
    // Apply pitch shift effect if specified
    if (effects && effects.pitch && effects.pitch !== 0) {
        playbackRate *= Math.pow(2, effects.pitch / 12);
    }
    
    // Apply LFO pitch modulation (calculate value at this specific time)
    if (effects && effects.lfos && Array.isArray(effects.lfos)) {
        effects.lfos.forEach(lfo => {
            if (lfo.enabled && lfo.target === 'pitch' && lfo.depth > 0) {
                const lfoValue = getLFOValue(lfo, time);
                const semitones = lfoValue * 12; // ±1 octave range
                const pitchMultiplier = Math.pow(2, semitones / 12);
                playbackRate *= pitchMultiplier;
            }
        });
    }
    
    // Apply Automation pitch modulation (calculate value at this specific time)
    if (effects && effects.automations && Array.isArray(effects.automations)) {
        const clipDuration = 16; // TODO: Get actual clip duration
        const clipStartTime = 0; // TODO: Get actual clip start time
        effects.automations.forEach(auto => {
            if (auto.enabled && auto.target === 'pitch') {
                const autoValue = getAutomationValue(auto, clipStartTime, time, clipDuration);
                // autoValue is 0-1, convert to -1 to +1 range, then to semitones
                const normalizedValue = (autoValue - 0.5) * 2; // -1 to +1
                const semitones = normalizedValue * 12; // ±1 octave
                const pitchMultiplier = Math.pow(2, semitones / 12);
                playbackRate *= pitchMultiplier;
            }
        });
    }
    
    // Apply tempo multiplier (120 BPM is the reference tempo = 1.0x speed)
    const tempoMultiplier = arrangementState.tempo / 120;
    playbackRate *= tempoMultiplier;
    
    source.playbackRate.value = playbackRate;
    
    // Create audio processing chain
    let currentNode = source;
    
    // Apply EQ if specified
    if (effects && effects.eq) {
        const eqLow = audioContext.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.value = 200;
        eqLow.gain.value = effects.eq.low || 0;
        
        const eqLowMid = audioContext.createBiquadFilter();
        eqLowMid.type = 'peaking';
        eqLowMid.frequency.value = 500;
        eqLowMid.Q.value = 1;
        eqLowMid.gain.value = effects.eq.lowmid || 0;
        
        const eqMid = audioContext.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.value = 1500;
        eqMid.Q.value = 1;
        eqMid.gain.value = effects.eq.mid || 0;
        
        const eqHighMid = audioContext.createBiquadFilter();
        eqHighMid.type = 'peaking';
        eqHighMid.frequency.value = 4000;
        eqHighMid.Q.value = 1;
        eqHighMid.gain.value = effects.eq.highmid || 0;
        
        const eqHigh = audioContext.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.value = 8000;
        eqHigh.gain.value = effects.eq.high || 0;
        
        // Chain EQ filters
        currentNode.connect(eqLow);
        eqLow.connect(eqLowMid);
        eqLowMid.connect(eqMid);
        eqMid.connect(eqHighMid);
        eqHighMid.connect(eqHigh);
        currentNode = eqHigh;
    }
    
    // Apply filter if specified
    if (effects && effects.filter && effects.filter.type !== 'none') {
        const filterNode = audioContext.createBiquadFilter();
        filterNode.type = effects.filter.type;
        filterNode.frequency.value = effects.filter.cutoff;
        filterNode.Q.value = effects.filter.resonance;
        currentNode.connect(filterNode);
        currentNode = filterNode;
    }
    
    // --- Apply Delay effect ---
    let delayNode = null;
    let feedbackNode = null;
    let delayWetGain = null;
    let delayDryGain = null;
    
    if (effects && effects.delay && effects.delay.time > 0) {
        delayNode = audioContext.createDelay(5.0);
        feedbackNode = audioContext.createGain();
        delayWetGain = audioContext.createGain();
        delayDryGain = audioContext.createGain();
        
        delayNode.delayTime.value = effects.delay.time / 1000;
        feedbackNode.gain.value = effects.delay.feedback / 100;
        delayWetGain.gain.value = 0.5;
        delayDryGain.gain.value = 0.5;
        
        // Dry path
        currentNode.connect(delayDryGain);
        
        // Wet path with feedback
        currentNode.connect(delayNode);
        delayNode.connect(feedbackNode);
        feedbackNode.connect(delayNode); // Feedback loop
        delayNode.connect(delayWetGain);
        
        // Merge dry and wet
        const delayMerge = audioContext.createGain();
        delayDryGain.connect(delayMerge);
        delayWetGain.connect(delayMerge);
        currentNode = delayMerge;
    }

    // --- Apply Reverb effect ---
    if (effects && effects.reverb && effects.reverb.mix > 0 && effects.reverb.decay > 0) {
        const reverbWetGain = audioContext.createGain();
        const reverbDryGain = audioContext.createGain();
        
        reverbWetGain.gain.value = effects.reverb.mix / 100;
        reverbDryGain.gain.value = 1 - (effects.reverb.mix / 100);
        
        const reverbTime = Math.max(0.1, effects.reverb.decay || 2);
        const sampleRate = audioContext.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * reverbTime));
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
            const n = length - i;
            const decay = Math.pow(n / length, (effects.reverb.damping || 50) / 50);
            impulseL[i] = (Math.random() * 2 - 1) * decay;
            impulseR[i] = (Math.random() * 2 - 1) * decay;
        }
        
        const reverbConvolver = audioContext.createConvolver();
        reverbConvolver.buffer = impulse;
        
        // Dry path
        currentNode.connect(reverbDryGain);
        
        // Wet path
        currentNode.connect(reverbConvolver);
        reverbConvolver.connect(reverbWetGain);
        
        // Merge dry and wet
        const reverbMerge = audioContext.createGain();
        reverbDryGain.connect(reverbMerge);
        reverbWetGain.connect(reverbMerge);
        currentNode = reverbMerge;
    }

    // Final gain node with volume control
    const finalGainNode = audioContext.createGain();
    const finalVolume = effects && effects.volume ? effects.volume / 100 : 1;
    finalGainNode.gain.value = 0.3 * finalVolume;
    
    currentNode.connect(finalGainNode);
    finalGainNode.connect(audioContext.destination);

    const scheduleTime = Math.max(time, audioContext.currentTime);
    source.start(scheduleTime);
    source.stop(scheduleTime + duration);
    
    if (!arrangementState.scheduledSources) {
        arrangementState.scheduledSources = [];
    }
    arrangementState.scheduledSources.push(source);
}

function playPatternSynthScheduled(time, frequency, duration, soundDesign, effects, patternLFOs) {
    if (!audioContext) return;
    
    
    const sd = soundDesign || {
        masterVolume: 70,
        osc1: { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
        osc2: { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
        filter: { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 },
        envelope: { attack: 10, decay: 100, sustain: 70, release: 200 },
        unison: { voices: 1, detune: 10, pan: 50 }
    };
    
    // Ensure all properties exist with defaults
    if (!sd.masterVolume) sd.masterVolume = 70;
    if (!sd.osc1) sd.osc1 = { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 };
    if (!sd.osc2) sd.osc2 = { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 };
    if (!sd.unison) sd.unison = { voices: 1, detune: 10, pan: 50 };
    if (!sd.filter) sd.filter = { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 };
    if (!sd.envelope) sd.envelope = { attack: 10, decay: 100, sustain: 70, release: 200 };
    
    // Apply octave shifts
    const osc1OctaveShift = Math.pow(2, sd.osc1.octave || 0);
    const osc2OctaveShift = Math.pow(2, sd.osc2.octave || 0);
    
    // Apply speed and pitch shift effects
    let finalFrequency = frequency;
    
    // Apply speed (affects frequency for synth)
    if (effects && effects.speed) {
        finalFrequency *= effects.speed;
    }
    
    // Apply pitch shift effect if specified
    if (effects && effects.pitch && effects.pitch !== 0) {
        finalFrequency *= Math.pow(2, effects.pitch / 12);
    }
    
    // Apply tempo multiplier (120 BPM is the reference tempo = 1.0x speed)
    const tempoMultiplier = arrangementState.tempo / 120;
    finalFrequency *= tempoMultiplier;
    
    const osc1Frequency = finalFrequency * osc1OctaveShift;
    const osc2Frequency = finalFrequency * osc2OctaveShift;
    
    // Check if unison is enabled (when voices > 1)
    const unisonVoices = sd.unison && sd.unison.voices > 1 ? sd.unison.voices : 1;
    const unisonDetune = sd.unison ? (sd.unison.detune || 10) : 0;
    const unisonPan = sd.unison ? (sd.unison.pan || 50) / 100 : 0;
    
    // Create oscillators (with unison support)
    const osc1Array = [];
    const osc2Array = [];
    const osc1GainArray = [];
    const osc2GainArray = [];
    
    // Create unison voices
    for (let v = 0; v < unisonVoices; v++) {
        // Calculate detune spread
        const voiceDetune = unisonVoices > 1 
            ? ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
            : 0;
        
        // Create oscillators for this voice
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        
        osc1.type = sd.osc1.wave === 'custom' ? 'sawtooth' : sd.osc1.wave;
        osc2.type = sd.osc2.wave === 'custom' ? 'sawtooth' : sd.osc2.wave;
        
        osc1.frequency.value = osc1Frequency;
        osc2.frequency.value = osc2Frequency;
        osc1.detune.value = (sd.osc1.detune || 0) + voiceDetune;
        osc2.detune.value = (sd.osc2.detune || 0) + voiceDetune;
        
        // Create gain nodes for this voice
        const osc1Gain = audioContext.createGain();
        const osc2Gain = audioContext.createGain();
        
        // Apply stereo width for unison (pan voices across stereo field)
        if (unisonVoices > 1 && unisonPan > 0) {
            const panPosition = ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonPan; // -1 to 1
            const panner = audioContext.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, panPosition)); // Clamp to valid range
            
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
            osc1Gain.connect(panner);
            osc2Gain.connect(panner);
            
            // Store panner reference
            osc1Gain.panner = panner;
            osc2Gain.panner = panner;
        } else {
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
        }
        
        osc1Array.push(osc1);
        osc2Array.push(osc2);
        osc1GainArray.push(osc1Gain);
        osc2GainArray.push(osc2Gain);
    }
    
    // Master gains for osc1 and osc2 (sums all unison voices)
    const osc1MasterGain = audioContext.createGain();
    const osc2MasterGain = audioContext.createGain();
    
    // Connect all voice gains to master gains
    osc1GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc1MasterGain);
        } else {
            gain.connect(osc1MasterGain);
        }
    });
    osc2GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc2MasterGain);
        } else {
            gain.connect(osc2MasterGain);
        }
    });
    
    // Set voice levels (divide by voice count to maintain same loudness)
    const voiceLevelScale = 1 / Math.sqrt(unisonVoices); // Use sqrt for perceived loudness
    osc1GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    osc2GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    
    // Apply volume effect
    const volumeMultiplier = effects && effects.volume ? effects.volume / 100 : 1;
    
    // Set master oscillator levels with proper gain staging
    const masterVolume = (sd.masterVolume !== undefined ? sd.masterVolume : 70) / 100;
    const osc1Level = (sd.osc1.level || 0) / 100;
    const osc2Level = (sd.osc2.level || 0) / 100;
    
    // Calculate total level to prevent clipping
    const totalLevel = osc1Level + osc2Level;
    const normalizationFactor = totalLevel > 0 ? 1 / Math.max(totalLevel, 1) : 1;
    
    // Apply normalized levels with master volume and volume effect
    osc1MasterGain.gain.value = osc1Level * normalizationFactor * masterVolume * volumeMultiplier;
    osc2MasterGain.gain.value = osc2Level * normalizationFactor * masterVolume * volumeMultiplier;
    
    // Create filter with envelope support
    const filter = audioContext.createBiquadFilter();
    filter.type = sd.filter.type || 'lowpass';
    const baseCutoff = Math.max(20, sd.filter.cutoff || 2000);
    filter.frequency.value = baseCutoff;
    filter.Q.value = (sd.filter.resonance || 0) / 10;
    
    // Create envelope
    const env = audioContext.createGain();
    
    // Connect audio graph
    osc1MasterGain.connect(filter);
    osc2MasterGain.connect(filter);
    filter.connect(env);
    
    // Track LFO oscillators for modulation
    const detuneActiveLFOs = [];
    const activeLFOs = [];
    
    // Apply pattern LFO detune modulation (create actual LFO oscillators, not snapshots)
    if (patternLFOs && Array.isArray(patternLFOs)) {
        patternLFOs.forEach(lfo => {
            if (lfo && lfo.target === 'osc1-detune' && lfo.depth > 0) {
                // Apply to all unison voices
                osc1Array.forEach(osc => {
                    const lfoOsc = audioContext.createOscillator();
                    const lfoGain = audioContext.createGain();
                    lfoOsc.type = lfo.waveform || 'sine';
                    lfoOsc.frequency.value = lfo.rate || 1;
                    lfoGain.gain.value = (lfo.depth / 100) * 1200; // ±12 semitones
                    lfoOsc.connect(lfoGain);
                    lfoGain.connect(osc.detune);
                    lfoOsc.start(Math.max(time, audioContext.currentTime));
                    lfoOsc.stop(Math.max(time, audioContext.currentTime) + duration + 0.5);
                    detuneActiveLFOs.push({ osc: lfoOsc, gain: lfoGain });
                });
            }
            if (lfo && lfo.target === 'osc2-detune' && lfo.depth > 0) {
                // Apply to all unison voices
                osc2Array.forEach(osc => {
                    const lfoOsc = audioContext.createOscillator();
                    const lfoGain = audioContext.createGain();
                    lfoOsc.type = lfo.waveform || 'sine';
                    lfoOsc.frequency.value = lfo.rate || 1;
                    lfoGain.gain.value = (lfo.depth / 100) * 1200; // ±12 semitones
                    lfoOsc.connect(lfoGain);
                    lfoGain.connect(osc.detune);
                    lfoOsc.start(Math.max(time, audioContext.currentTime));
                    lfoOsc.stop(Math.max(time, audioContext.currentTime) + duration + 0.5);
                    detuneActiveLFOs.push({ osc: lfoOsc, gain: lfoGain });
                });
            }
            if (lfo && lfo.target === 'filter-cutoff' && lfo.depth > 0) {
                const lfoOsc = audioContext.createOscillator();
                const lfoGain = audioContext.createGain();
                lfoOsc.type = lfo.waveform || 'sine';
                lfoOsc.frequency.value = lfo.rate || 1;
                lfoGain.gain.value = (lfo.depth / 100) * 2000; // Hz
                lfoOsc.connect(lfoGain);
                lfoGain.connect(filter.frequency);
                lfoOsc.start(Math.max(time, audioContext.currentTime));
                lfoOsc.stop(Math.max(time, audioContext.currentTime) + duration + 0.5);
                activeLFOs.push({ osc: lfoOsc, gain: lfoGain });
            }
            if (lfo && lfo.target === 'filter-resonance' && lfo.depth > 0) {
                const lfoOsc = audioContext.createOscillator();
                const lfoGain = audioContext.createGain();
                lfoOsc.type = lfo.waveform || 'sine';
                lfoOsc.frequency.value = lfo.rate || 1;
                lfoGain.gain.value = (lfo.depth / 100) * 30; // Q value
                lfoOsc.connect(lfoGain);
                lfoGain.connect(filter.Q);
                lfoOsc.start(Math.max(time, audioContext.currentTime));
                lfoOsc.stop(Math.max(time, audioContext.currentTime) + duration + 0.5);
                activeLFOs.push({ osc: lfoOsc, gain: lfoGain });
            }
        });
    }
    
    // Store active LFOs to prevent garbage collection
    const playbackId = Date.now() + Math.random();
    const allLFOs = [...detuneActiveLFOs, ...activeLFOs];
    if (allLFOs.length > 0) {
        patternPlaybackActiveLFOs[playbackId] = allLFOs;
        const stopTime = Math.max(time, audioContext.currentTime) + duration + 0.5;
        setTimeout(() => {
            delete patternPlaybackActiveLFOs[playbackId];
        }, (stopTime - audioContext.currentTime + 100) * 1000);
    }
    
    // Apply effects from pattern (Volume, Delay, Reverb, EQ, Filter, etc.)
    let effectsChain = env;
    
    // Create effects nodes if effects are provided
    if (effects) {
        // Filter (additional filter on top of sound design filter)
        if (effects.filter && effects.filter.type && effects.filter.type !== 'none') {
            const effectFilter = audioContext.createBiquadFilter();
            effectFilter.type = effects.filter.type;
            effectFilter.frequency.value = effects.filter.cutoff || 1000;
            effectFilter.Q.value = effects.filter.resonance || 0;
            effectsChain.connect(effectFilter);
            effectsChain = effectFilter;
        }
        
        // EQ
        if (effects.eq && Array.isArray(effects.eq) && effects.eq.length > 0) {
            effects.eq.forEach(point => {
                if (point.gain !== 0) {
                    const eqNode = audioContext.createBiquadFilter();
                    eqNode.type = point.type || 'peaking';
                    eqNode.frequency.value = point.frequency;
                    eqNode.gain.value = point.gain;
                    eqNode.Q.value = point.q || 1;
                    effectsChain.connect(eqNode);
                    effectsChain = eqNode;
                }
            });
        }
        
        // Delay
        if (effects.delay && effects.delay.time > 0) {
            const delayNode = audioContext.createDelay(5);
            const delayFeedback = audioContext.createGain();
            const delayWet = audioContext.createGain();
            const delayDry = audioContext.createGain();
            
            delayNode.delayTime.value = effects.delay.time / 1000;
            delayFeedback.gain.value = (effects.delay.feedback || 0) / 100;
            delayWet.gain.value = 0.5;
            delayDry.gain.value = 0.5;
            
            effectsChain.connect(delayDry);
            effectsChain.connect(delayNode);
            delayNode.connect(delayFeedback);
            delayFeedback.connect(delayNode);
            delayNode.connect(delayWet);
            
            const delayMerge = audioContext.createGain();
            delayDry.connect(delayMerge);
            delayWet.connect(delayMerge);
            effectsChain = delayMerge;
        }
        
        // Reverb
        if (effects.reverb && effects.reverb.mix > 0) {
            const reverbNode = audioContext.createConvolver();
            const reverbWet = audioContext.createGain();
            const reverbDry = audioContext.createGain();
            
            // Create impulse response for reverb
            const decay = Math.max(0.1, effects.reverb.decay || 2);
            const sampleRate = audioContext.sampleRate;
            const length = Math.max(1, Math.floor(sampleRate * decay));
            const impulse = audioContext.createBuffer(2, length, sampleRate);
            const impulseL = impulse.getChannelData(0);
            const impulseR = impulse.getChannelData(1);
            
            for (let i = 0; i < length; i++) {
                impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
                impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
            reverbNode.buffer = impulse;
            
            reverbWet.gain.value = effects.reverb.mix / 100;
            reverbDry.gain.value = 1 - (effects.reverb.mix / 100);
            
            effectsChain.connect(reverbDry);
            effectsChain.connect(reverbNode);
            reverbNode.connect(reverbWet);
            
            const reverbMerge = audioContext.createGain();
            reverbDry.connect(reverbMerge);
            reverbWet.connect(reverbMerge);
            effectsChain = reverbMerge;
        }
    }
    
    // Connect final chain to destination
    effectsChain.connect(audioContext.destination);

    // ADSR Envelope - Use exponential ramps to prevent clicks
    const now = Math.max(time, audioContext.currentTime);
    const attack = Math.max(0.001, (sd.envelope.attack || 0) / 1000); // Minimum 1ms to prevent clicks
    const decay = Math.max(0.001, (sd.envelope.decay || 0) / 1000);
    const sustain = (sd.envelope.sustain || 0) / 100;
    const release = Math.max(0.01, (sd.envelope.release || 0) / 1000); // Minimum 10ms for smooth release
    
    // Start from a very small value instead of 0 to enable exponential ramps
    const minValue = 0.0001;
    env.gain.setValueAtTime(minValue, now);
    
    // Attack: exponential rise for smooth start (prevents clicks)
    env.gain.exponentialRampToValueAtTime(1, now + attack);
    
    // Decay: exponential fall to sustain level
    const sustainValue = Math.max(minValue, sustain); // Ensure sustain isn't 0 for exponential
    env.gain.exponentialRampToValueAtTime(sustainValue, now + attack + decay);
    
    // Hold at sustain level
    env.gain.setValueAtTime(sustainValue, now + duration);
    
    // Release: exponential decay to silence (prevents clicks)
    env.gain.exponentialRampToValueAtTime(minValue, now + duration + release);
    
    // Apply Filter Envelope if amount is set
    const filterEnvAmount = sd.filter.envAmount || 0;
    if (filterEnvAmount !== 0) {
        const filterEnvRange = Math.abs(filterEnvAmount) / 100 * 10000; // Max 10kHz modulation
        const filterTargetCutoff = filterEnvAmount > 0 
            ? Math.min(20000, baseCutoff + filterEnvRange)
            : Math.max(20, baseCutoff - filterEnvRange);
        
        // Filter envelope follows amplitude envelope
        filter.frequency.setValueAtTime(filterTargetCutoff, now);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + attack);
        filter.frequency.setValueAtTime(baseCutoff, now + attack + decay);
        filter.frequency.setValueAtTime(baseCutoff, now + duration);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff * 0.5, now + duration + release);
    }
    
    // Apply Envelope → Pitch Modulation (if enabled)
    if (sd.envelope.pitchMod && sd.envelope.pitchMod.enabled && sd.envelope.pitchMod.amount !== 0) {
        const pitchAmount = sd.envelope.pitchMod.amount; // semitones
        const maxDetune = pitchAmount * 100; // cents

        // Apply pitch modulation to all unison voices
        osc1Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            const currentDetune = (sd.osc1.detune || 0) + voiceDetune;
            osc.detune.setValueAtTime(currentDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime(currentDetune, now + attack);
        });
        
        osc2Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            const currentDetune = (sd.osc2.detune || 0) + voiceDetune;
            osc.detune.setValueAtTime(currentDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime(currentDetune, now + attack);
        });
    }
    
    // Calculate stop time for oscillators (needed by PWM and cleanup)
    const stopAt = now + duration + release;
    
    // Apply PWM (Pulse Width Modulation) if enabled
    if (sd.pwm && sd.pwm.enabled && sd.pwm.rate > 0 && sd.pwm.depth > 0) {
        const pwmRate = sd.pwm.rate; // Hz
        const pwmDepth = sd.pwm.depth / 100; // 0-1 range
        
        // Create PWM LFO for each oscillator array
        osc1Array.forEach((osc, idx) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.frequency.value = pwmRate;
            pwmLFO.type = 'sine'; // Smooth PWM modulation
            pwmGain.gain.value = pwmDepth * 50; // Scale to reasonable detune amount
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(stopAt);
            
            // Add to scheduled sources for cleanup
            if (arrangementState.scheduledSources) {
                arrangementState.scheduledSources.push(pwmLFO);
            }
        });
        
        osc2Array.forEach((osc, idx) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.frequency.value = pwmRate;
            pwmLFO.type = 'sine';
            pwmGain.gain.value = pwmDepth * 50;
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(stopAt);
            
            if (arrangementState.scheduledSources) {
                arrangementState.scheduledSources.push(pwmLFO);
            }
        });
    }
    
    // Start all oscillators
    osc1Array.forEach(osc => osc.start(now));
    osc2Array.forEach(osc => osc.start(now));
    osc1Array.forEach(osc => osc.stop(stopAt));
    osc2Array.forEach(osc => osc.stop(stopAt));
    
    if (!arrangementState.scheduledSources) {
        arrangementState.scheduledSources = [];
    }
    // Store all oscillators in scheduled sources
    osc1Array.forEach(osc => arrangementState.scheduledSources.push(osc));
    osc2Array.forEach(osc => arrangementState.scheduledSources.push(osc));
}

function playTestToneAt(time, frequency, duration) {
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.value = frequency;
    osc.type = 'sine';
    
    const scheduleTime = Math.max(time, audioContext.currentTime);
    
    gain.gain.setValueAtTime(0.3, scheduleTime);
    gain.gain.exponentialRampToValueAtTime(0.01, scheduleTime + duration);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    try {
        osc.start(scheduleTime);
        osc.stop(scheduleTime + duration);

    } catch (e) {
    }
    
    if (!arrangementState.scheduledSources) {
        arrangementState.scheduledSources = [];
    }
    arrangementState.scheduledSources.push(osc);
}

function noteToFrequency(noteName) {
    const noteMap = {
        'C5': 523.25, 'B4': 493.88, 'A4': 440.00, 'G4': 392.00,
        'F4': 349.23, 'E4': 329.63, 'D4': 293.66, 'C4': 261.63,
        'B3': 246.94, 'A3': 220.00, 'G3': 196.00, 'F3': 174.61
    };
    return noteMap[noteName] || 440;
}

function initAudioContext() {
    if (!audioContext) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();




        } catch (e) {
            alert('Audio not supported in this browser');
            return;
        }
    }
    
    if (audioContext.state === 'suspended') {

        audioContext.resume().then(() => {

        });
    }
}

function playSimpleBeep() {



    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.value = 880; // A5
    osc.type = 'sine';
    
    gain.gain.value = 0.3;
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    const now = audioContext.currentTime;
    osc.start(now);
    osc.stop(now + 0.3);

}

// ========== ZOOM ==========
function renderTrackGrid(canvas) {
    const ctx = canvas.getContext('2d');
    const zoom = arrangementState.zoom;
    
    // Calculate width needed - dynamic based on clips with 50 bar buffer
    const numBars = getVisibleBarCount();
    const barWidth = Math.round(100 * zoom);
    const totalWidth = numBars * barWidth;
    
    // Set CSS size for layout - leave 2px for border at bottom
    canvas.style.width = totalWidth + 'px';
    canvas.style.height = '58px';
    
    // Use higher resolution for crisp rendering, but cap to prevent canvas size limits
    const dpr = window.devicePixelRatio || 1;
    const minResolution = 5000;
    const maxCanvasSize = 32000; // Maximum canvas size (browser limit is ~32767)
    
    // Cap canvas width to prevent blank screen at high zoom levels
    let canvasWidth = Math.max(totalWidth * dpr, minResolution);
    canvasWidth = Math.min(canvasWidth, maxCanvasSize);
    
    canvas.width = canvasWidth;
    canvas.height = 58 * dpr; // 58px instead of 60px to show border
    
    // Calculate scale factor
    const scale = canvasWidth / totalWidth;
    
    const width = canvasWidth;
    const height = 60 * dpr;
    
    const scaledBarWidth = barWidth * scale;
    const beatWidth = scaledBarWidth / 4;
    const stepWidth = beatWidth / 4;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw bar lines (thick purple)
    ctx.strokeStyle = '#533483';
    ctx.lineWidth = 2 * dpr;
    for (let bar = 0; bar < numBars; bar++) {
        const x = bar * scaledBarWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Draw beat lines (medium blue-gray) - only if zoomed in enough
    if (beatWidth > 5 * dpr) {
        ctx.strokeStyle = '#2d3561';
        ctx.lineWidth = 1 * dpr;
        for (let beat = 1; beat * beatWidth < width; beat++) {
            if (beat % 4 === 0) continue; // Skip bar lines
            const x = beat * beatWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
    
    // Draw step lines (subtle dark blue) - only if zoomed in enough
    if (stepWidth > 2 * dpr) {
        ctx.strokeStyle = '#1e2347';
        ctx.lineWidth = 0.5 * dpr;
        for (let step = 1; step * stepWidth < width; step++) {
            if (step % 4 === 0) continue; // Skip beat lines
            const x = step * stepWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
}

function updateTrackBackgrounds() {
    const zoom = arrangementState.zoom;
    const numBars = getVisibleBarCount(); // Dynamic bar count
    const barWidth = Math.round(100 * zoom);
    const totalWidth = numBars * barWidth;
    
    // Update container width
    const container = document.getElementById('arrangement-tracks');
    container.style.minWidth = totalWidth + 'px';
    
    // Re-render all track grids with current zoom
    const lanes = tracksContainer.querySelectorAll('.track-lane');
    lanes.forEach(lane => {
        // Update lane width
        lane.style.minWidth = totalWidth + 'px';
        
        const canvas = lane.querySelector('.track-lane-canvas');
        if (canvas) {
            renderTrackGrid(canvas);
        }
    });
}

function adjustZoom(factor) {
    arrangementState.zoom = Math.max(0.25, Math.min(4, arrangementState.zoom * factor));
    updateZoomDisplay();
    updateTrackBackgrounds();
    renderTimeline();
    renderAllClips();
}

// ========== SAVE/LOAD ==========
async function saveArrangement(showAlert = true) {
    // ONLY stop playback for manual saves (showAlert = true)
    // Auto-saves during clip operations (showAlert = false) should NOT interrupt playback
    if (showAlert && arrangementState.isPlaying) {
        stopArrangement();
    }

    // Initialize audioContext if needed for save operations
    if (!audioContext) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        } catch (e) {
        }
    }

    // Create comprehensive save data including samples, patterns, and effects
    const data = {
        version: '3.0',
        tracks: arrangementState.tracks,
        clips: arrangementState.clips.map(clip => {
            // Determine audio source type
            let audioSource;
            if (clip.type === 'pattern') {
                audioSource = { type: 'pattern', patternName: clip.data };
            } else if (clip.isFromFolder) {
                audioSource = { type: 'folder', folderPath: currentFolderPath, fileName: clip.data };
            } else if (typeof clip.data === 'string' && (clip.data.startsWith('custom_') || clip.data.startsWith('recording_'))) {
                audioSource = { type: 'custom', sampleKey: clip.data };
            } else {
                audioSource = { type: 'standard', sampleNumber: clip.data };
            }
            
            return {
                ...clip,
                effects: clip.effects || {},
                automation: clip.automation || {},
                lfo: clip.lfo || {},
                audioSource: audioSource
            };
        }),
        patterns: arrangementState.patterns,
        pianoRollData: pianoRollData, // Save piano roll patterns
        tempo: arrangementState.tempo,
        zoom: arrangementState.zoom,
        
        // Save custom sample file paths
        customSamplePaths: customSampleOriginalPaths,
        
        midiPatterns: {}, // Save MIDI data separately
        
        // NEW: Save folder state for auto-reloading
        folderState: {
            currentFolderPath: currentFolderPath,
            currentFolderFiles: currentFolderFiles,
            folderSamplesLoaded: folderSamplesLoaded
        }
    };
    

    // Save MIDI patterns from piano roll
    Object.keys(pianoRollData).forEach(patternName => {
        const patternData = pianoRollData[patternName];
        if (patternData && patternData.notes) {
            data.midiPatterns[patternName] = {
                notes: patternData.notes,
                length: patternData.length || 4,
                tempo: patternData.tempo || arrangementState.tempo
            };
        }
    });
    
    // Save to localStorage for auto-recovery
    try {
        localStorage.setItem('arrangement-data', JSON.stringify(data));

    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            try {
                localStorage.removeItem('arrangement-data');
            } catch (clearError) {
            }
        } else {
        }
    }
    
    // Download file if explicitly requested
    if (showAlert && window.electronAPI && window.electronAPI.saveProject) {
        try {
            // Add timeout to prevent blocking
            const savePromise = window.electronAPI.saveProject(data);
            const timeoutPromise = new Promise((resolve) => 
                setTimeout(() => resolve({ success: false, error: 'Save timeout' }), 30000)
            );
            
            const result = await Promise.race([savePromise, timeoutPromise]);
            
            if (!result.success) {
                if (result.error !== 'Save cancelled' && result.error !== 'Save timeout') {
                    alert('Failed to save project: ' + result.error);
                }
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save project: ' + err.message);
        }
    }
    // Auto-save to localStorage always happens above, no alert needed
}

function loadArrangement() {
    // Stop playback to prevent audio freeze
    if (arrangementState.isPlaying) {
        stopArrangement();
    }
    
    // Ensure audioContext is initialized before loading
    if (!audioContext) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();

        } catch (e) {
            alert('Error: Could not initialize audio context. Please try again.');
            return;
        }
    }

    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                
                // Validate and load data
                arrangementState.tracks = parsed.tracks || [];
                arrangementState.clips = parsed.clips || [];
                arrangementState.patterns = parsed.patterns || {};
                arrangementState.tempo = parsed.tempo || 120;
                arrangementState.zoom = parsed.zoom || 1;
                
                // Show initial loading screen
                showLoadingProgress('Loading Arrangement...', 'Preparing...');
                
                // NEW: Restore folder state for auto-reloading uploaded samples
                if (parsed.folderState) {
                    currentFolderPath = parsed.folderState.currentFolderPath;
                    currentFolderFiles = parsed.folderState.currentFolderFiles;
                    folderSamplesLoaded = parsed.folderState.folderSamplesLoaded;
                    
                    // Update the folder display in UI
                    const folderNameDisplay = currentFolderPath ? currentFolderPath.split(/[\\/]/).pop() : 'Default';
                    document.getElementById('arr-current-folder').textContent = folderNameDisplay;

                    // Automatically reload folder files if they were loaded
                    if (folderSamplesLoaded && currentFolderPath && currentFolderFiles && currentFolderFiles.length > 0) {
                        // Show loading progress
                        showLoadingProgress('Loading Folder Samples...', `Loading ${currentFolderFiles.length} files...`);
                        
                        try {
                            const result = await loadAllAudioFilesFromFolder(currentFolderPath, currentFolderFiles, folderAudioBuffers, (current, total, fileName) => {
                                updateLoadingProgress(current, total, fileName);
                            });
                            // Update dropdown to show folder samples
                            updateSampleDropdown();
                        } catch (err) {
                            console.error('Error loading folder samples:', err);
                        }
                    }
                }
                
                // Load piano roll MIDI data
                if (parsed.midiPatterns) {
                    Object.keys(parsed.midiPatterns).forEach(patternName => {
                        pianoRollData[patternName] = parsed.midiPatterns[patternName];
                    });
                }
                
                // Restore custom sample file paths and prepare to load them
                let loadedSamplesCount = 0;
                const customSamplesToLoad = [];
                
                if (parsed.customSamplePaths && Object.keys(parsed.customSamplePaths).length > 0) {
                    // Restore the file path mappings
                    customSampleOriginalPaths = { ...parsed.customSamplePaths };
                    loadedSamplesCount = Object.keys(parsed.customSamplePaths).length;
                    
                    // LAZY LOADING: Just store paths, don't load audio yet
                    // Audio will be loaded on-demand when playback starts
                    Object.entries(parsed.customSamplePaths).forEach(([sampleKey, filePath]) => {
                        // Mark as pending load (not in memory yet)
                        if (!sampleBuffers[sampleKey]) {
                            customSamplesToLoad.push({ sampleKey, filePath });
                        }
                    });
                    
                    // Add to dropdown immediately (paths only, no audio loaded)
                    updateSampleDropdown();
                }
                
                // CRITICAL: Store folder paths for BACKGROUND loading
                // Collect unique folder paths from clips that have audioSource metadata
                const folderPathsToLoad = new Map(); // Map<folderPath, Set<fileName>>
                
                arrangementState.clips.forEach(clip => {
                    if (clip.audioSource && clip.audioSource.type === 'folder') {
                        const folderPath = clip.audioSource.folderPath;
                        const fileName = clip.audioSource.fileName;
                        
                        if (folderPath && fileName) {
                            if (!folderPathsToLoad.has(folderPath)) {
                                folderPathsToLoad.set(folderPath, new Set());
                            }
                            folderPathsToLoad.get(folderPath).add(fileName);
                        }
                    }
                });
                
                // HYBRID LOADING: Load in background without blocking UI
                if (folderPathsToLoad.size > 0) {
                    const totalFilesToLoad = Array.from(folderPathsToLoad.values()).reduce((sum, set) => sum + set.size, 0);
                    
                    // Start background loading (non-blocking)
                    setTimeout(() => {
                        let filesLoadedSoFar = 0;
                        
                        const loadPromises = [];
                        folderPathsToLoad.forEach((fileNames, folderPath) => {
                            const fileNamesArray = Array.from(fileNames);

                            const promise = loadAllAudioFilesFromFolder(folderPath, fileNamesArray, folderAudioBuffers, (current, total, fileName) => {
                                filesLoadedSoFar++;
                                // Update in background (optional visual indicator)
                            })
                                .then(result => {
                                    return result;
                                })
                                .catch(err => {
                                    return { loadedCount: 0, totalCount: fileNamesArray.length };
                                });
                            
                            loadPromises.push(promise);
                        });
                        
                        Promise.all(loadPromises).then(results => {
                            folderSamplesLoaded = true;
                            updateSampleDropdown();
                        });
                    }, 100); // Start 100ms after UI loads
                }
                
                // HYBRID LOADING: Load custom samples in background
                if (customSamplesToLoad.length > 0) {
                    setTimeout(async () => {
                        let customLoadedCount = 0;
                        const maxConcurrent = 6; // Load 6 at a time in background
                        
                        for (let i = 0; i < customSamplesToLoad.length; i += maxConcurrent) {
                            const batch = customSamplesToLoad.slice(i, i + maxConcurrent);
                            
                            const batchPromises = batch.map(async ({ sampleKey, filePath }) => {
                                try {
                                    const result = await window.electronAPI.readAudioFile(filePath);
                                    if (result && result.success && result.data) {
                                        const arrayBuffer = new Uint8Array(result.data).buffer;
                                        const buffer = await audioContext.decodeAudioData(arrayBuffer);
                                        sampleBuffers[sampleKey] = buffer;
                                        customLoadedCount++;
                                    }
                                } catch (err) {
                                    console.error(`Background load failed for ${sampleKey}:`, err);
                                }
                            });
                            
                            await Promise.all(batchPromises);
                            await new Promise(resolve => setTimeout(resolve, 50)); // Pause between batches
                        }
                    }, 200); // Start 200ms after UI loads
                }
                
                // Hide loading progress
                hideLoadingProgress();
                
                // Rebuild UI
                rebuildTrackList();
                renderAllClips();
                renderTimeline();
                updateTrackBackgrounds();
                
                // Update sample dropdown to include loaded custom samples
                updateSampleDropdown();
                
                // Populate pattern dropdown
                patternDropdown.innerHTML = '<option value="">-- Select Pattern --</option>';
                Object.keys(arrangementState.patterns).forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    patternDropdown.appendChild(option);
                });
                
                // Update tempo display
                const tempoDisplay = document.getElementById('arr-tempo-value');
                if (tempoDisplay) {
                    tempoDisplay.textContent = arrangementState.tempo;
                }
                
                // Update zoom display
                const zoomDisplay = document.getElementById('arr-zoom-display');
                if (zoomDisplay) {
                    zoomDisplay.textContent = Math.round(arrangementState.zoom * 100) + '%';
                }
                
                // Update BPM slider
                const bpmSlider = document.getElementById('arr-bpm-slider');
                if (bpmSlider) {
                    bpmSlider.value = arrangementState.tempo;
                }
                
                // Save to localStorage for auto-recovery
                try {
                    localStorage.setItem('arrangement-data', JSON.stringify(parsed));
                } catch (e) {
                }
                
                const midiCount = Object.keys(pianoRollData).length;
                
                // Show beautiful popup instead of alert
                showLoadPopup({
                    clips: arrangementState.clips.length,
                    samples: loadedSamplesCount || 0,
                    patterns: midiCount,
                    lazyLoad: true // Indicate samples will load on-demand
                });

            } catch (e) {
                hideLoadingProgress();
                alert('❌ Failed to load arrangement! Invalid file format or corrupted data.\n\nError: ' + e.message);
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

function loadArrangementData() {
    const data = localStorage.getItem('arrangement-data');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            arrangementState.tracks = parsed.tracks || [];
            arrangementState.clips = parsed.clips || [];
            arrangementState.patterns = parsed.patterns || {};
            arrangementState.tempo = parsed.tempo || 120;
            arrangementState.zoom = parsed.zoom || 1;
            
            // Fix legacy clips that don't have originalLength or stretchedLength
            arrangementState.clips.forEach(clip => {
                if (!clip.originalLength) {
                    clip.originalLength = clip.length;
                }
                if (!clip.stretchedLength) {
                    clip.stretchedLength = clip.stretchMode ? clip.length : clip.originalLength;
                }
            });
            
            // Load MIDI patterns if available
            if (parsed.midiPatterns) {
                Object.keys(parsed.midiPatterns).forEach(patternName => {
                    pianoRollData[patternName] = parsed.midiPatterns[patternName];
                });
            }
            
            // Load custom samples if available and audioContext is ready
            if (parsed.customSamples && audioContext) {
                Object.keys(parsed.customSamples).forEach(key => {
                    try {
                        const sampleData = parsed.customSamples[key];
                        if (sampleData && sampleData.channels) {
                            const audioBuffer = audioContext.createBuffer(
                                sampleData.numberOfChannels,
                                sampleData.length,
                                sampleData.sampleRate
                            );
                            
                            for (let i = 0; i < sampleData.numberOfChannels; i++) {
                                const channelData = audioBuffer.getChannelData(i);
                                const savedData = sampleData.channels[i];
                                if (savedData && Array.isArray(savedData)) {
                                    for (let j = 0; j < savedData.length; j++) {
                                        channelData[j] = savedData[j] || 0;
                                    }
                                }
                            }
                            
                            sampleBuffers[key] = audioBuffer;

                        }
                    } catch (e) {
                    }
                });
            }
            
            if (arrangementState.tracks.length > 0) {
                rebuildTrackList();
                renderAllClips();
                renderTimeline();
                updateTrackBackgrounds();
                updateTrackButtonStates(); // Initialize mute/solo button states
            }
            
            // Populate pattern dropdown
            Object.keys(arrangementState.patterns).forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                patternDropdown.appendChild(option);
            });

        } catch (e) {
        }
    }
}

function clearArrangement() {
    if (!confirm('Clear entire arrangement? This cannot be undone!')) return;
    
    arrangementState.tracks = [];
    arrangementState.clips = [];
    arrangementState.patterns = {};
    
    rebuildTrackList();
    
    // Create 10 empty tracks
    for (let i = 1; i <= 10; i++) {
        addTrack(`Track ${i}`);
    }
    
    patternDropdown.innerHTML = '<option value="">-- Select Pattern --</option>';
    
    saveArrangement(false);

}

// ========== LOAD SAMPLES FROM MAIN APP ==========
function loadSamplesFromMainApp() {
    // Load folder info
    loadSamplesFromStorage();


    // Populate dropdown with sample numbers 1-100
    for (let i = 1; i <= 100; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Sample ${i}`;
        sampleDropdown.appendChild(option);
    }
    
}

async function loadSampleBuffer(sampleNum) {
    try {
        // Initialize audio context if needed
        if (!audioContext) {
            initAudioContext();
        }
        
        if (!audioContext) {
            return;
        }
        
        // Build the file path like the main app does
        const filePath = `./${currentSampleFolder}/${sampleNum}.wav`;

        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            sampleBuffers[sampleNum] = audioBuffer;
        } catch (fetchError) {
            // Don't store anything - will play test tone instead
        }
    } catch (e) {
    }
}

// ========== CONTEXT MENU & EFFECTS POPUP ==========
let contextMenu = null;
let effectsPopup = null;
let currentClipForContext = null;
let currentClipEffects = null;
let originalClipEffects = null;

function initContextMenu() {
    contextMenu = document.getElementById('clip-context-menu');
    effectsPopup = document.getElementById('arr-effects-popup');



    // Hide context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
    
    // Context menu item click handlers
    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item || !currentClipForContext) return;
        
        const action = item.dataset.action;
        
        if (action === 'delete') {
            deleteClipById(currentClipForContext.id);
            contextMenu.style.display = 'none';
            currentClipForContext = null;
        } else if (action === 'effects') {
            showEffectsPopup(currentClipForContext);
            contextMenu.style.display = 'none';
            // DO NOT clear currentClipForContext here - it's needed for Apply/Reset buttons
        } else if (action === 'edit') {

            openPatternEditor(currentClipForContext);
            contextMenu.style.display = 'none';
            currentClipForContext = null;
        }
        // Note: color action is handled by the color picker input's change event
    });
    
    // Color picker change handler
    const colorPicker = document.getElementById('clip-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('change', (e) => {
            if (currentClipForContext) {
                // Save the custom color to the clip
                currentClipForContext.customColor = e.target.value;
                
                // Re-render the clip to apply the color
                renderAllClips();
                
                // Save the arrangement
                saveArrangement(false);
            }
        });
        
        // Prevent color picker from closing the context menu when clicking it
        colorPicker.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Setup effects controls (sliders, etc)
    setupEffectsControls();
    
    // Setup LFO and Automation tabs
    setupLFOTabs();
    setupAutomationTabs();
    
    // Setup LFO and Automation listeners
    // Use the idempotent event-listener based setup functions
    if (typeof setupAllLFOEventListeners === 'function') setupAllLFOEventListeners();
    if (typeof setupAllAutomationEventListeners === 'function') setupAllAutomationEventListeners();

}

function showContextMenu(clip, x, y) {
    currentClipForContext = clip;
    
    // Get menu items
    const editOption = contextMenu.querySelector('[data-action="edit"]');
    const effectsOption = contextMenu.querySelector('[data-action="effects"]');
    const colorOption = contextMenu.querySelector('[data-action="color"]');
    
    // Show/hide options based on clip type
    if (clip.type === 'pattern') {
        // Pattern clips: Delete, Edit, Effects, Color - ALL visible
        editOption.style.display = 'block';
        effectsOption.style.display = 'block'; // CHANGED: Now show effects for patterns
        colorOption.style.display = 'flex';
    } else if (clip.type === 'sample') {
        // Sample clips: Delete, Effects, Color (NO Edit)
        editOption.style.display = 'none';
        effectsOption.style.display = 'block';
        colorOption.style.display = 'flex';
    }
    
    // Set current color in color picker
    const colorPicker = document.getElementById('clip-color-picker');
    if (colorPicker && clip.customColor) {
        colorPicker.value = clip.customColor;
    } else {
        // Default colors
        colorPicker.value = clip.type === 'sample' ? '#000000' : '#0a0a0a';
    }
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
    // Ensure menu doesn't go off-screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (y - rect.height) + 'px';
    }
}

function deleteClipById(clipId) {
    const index = arrangementState.clips.findIndex(c => c.id === clipId);
    if (index !== -1) {
        // Store the clip data for undo
        const deletedClip = JSON.parse(JSON.stringify(arrangementState.clips[index]));
        
        window.undoManager.execute(
            new Command(
                'Delete Clip',
                () => {
                    arrangementState.clips.splice(index, 1);
                    renderAllClips();
                    saveArrangement(false);
                },
                () => {
                    // Restore clip at original position
                    arrangementState.clips.splice(index, 0, deletedClip);
                    renderAllClips();
                    saveArrangement(false);
                }
            )
        );
    }
}

function showEffectsPopup(clip) {

    // DON'T stop playback - let effects preview play alongside arrangement
    // User wants real-time effects editing while hearing the full mix
    // if (arrangementState.isPlaying) {
    //     stopArrangement();
    // }
    
    currentClipForContext = clip;
    
    // Set currentSampleForPopup for pattern clips (needed for sound design access)
    if (clip.type === 'pattern') {
        currentSampleForPopup = clip.data; // Pattern name

    }
    
    // Initialize effects if they don't exist
    if (!clip.effects) {
        clip.effects = getDefaultEffects();
    }
    
    // For pattern clips, load effects from the pattern object if available
    if (clip.type === 'pattern' && arrangementState.patterns[clip.data] && arrangementState.patterns[clip.data].effects) {
        originalClipEffects = JSON.parse(JSON.stringify(arrangementState.patterns[clip.data].effects));
        currentClipEffects = JSON.parse(JSON.stringify(arrangementState.patterns[clip.data].effects));
    } else {
        originalClipEffects = JSON.parse(JSON.stringify(clip.effects));
        currentClipEffects = JSON.parse(JSON.stringify(clip.effects));
    }

    // Ensure EQ is in array format for interactive editing
    if (currentClipEffects.eq && !Array.isArray(currentClipEffects.eq)) {
        // Convert from object format to array format
        const eqObj = currentClipEffects.eq;
        currentClipEffects.eq = [];
        // Convert each band to a point
        if (eqObj.low !== undefined && eqObj.low !== 0) {
            currentClipEffects.eq.push({ frequency: 200, gain: eqObj.low, type: 'lowshelf', q: 1 });
        }
        if (eqObj.lowmid !== undefined && eqObj.lowmid !== 0) {
            currentClipEffects.eq.push({ frequency: 500, gain: eqObj.lowmid, type: 'peaking', q: 1 });
        }
        if (eqObj.mid !== undefined && eqObj.mid !== 0) {
            currentClipEffects.eq.push({ frequency: 1500, gain: eqObj.mid, type: 'peaking', q: 1 });
        }
        if (eqObj.highmid !== undefined && eqObj.highmid !== 0) {
            currentClipEffects.eq.push({ frequency: 4000, gain: eqObj.highmid, type: 'peaking', q: 1 });
        }
        if (eqObj.high !== undefined && eqObj.high !== 0) {
            currentClipEffects.eq.push({ frequency: 8000, gain: eqObj.high, type: 'highshelf', q: 1 });
        }
        // If no points were added (all zero), add default points
        if (currentClipEffects.eq.length === 0) {
            currentClipEffects.eq = [
                { frequency: 200, gain: 0, type: 'lowshelf', q: 1 },
                { frequency: 500, gain: 0, type: 'peaking', q: 1 },
                { frequency: 1500, gain: 0, type: 'peaking', q: 1 },
                { frequency: 4000, gain: 0, type: 'peaking', q: 1 },
                { frequency: 8000, gain: 0, type: 'highshelf', q: 1 }
            ];
        }

    } else if (!currentClipEffects.eq) {
        // Initialize with default EQ points if none exist
        currentClipEffects.eq = [
            { frequency: 200, gain: 0, type: 'lowshelf', q: 1 },
            { frequency: 500, gain: 0, type: 'peaking', q: 1 },
            { frequency: 1500, gain: 0, type: 'peaking', q: 1 },
            { frequency: 4000, gain: 0, type: 'peaking', q: 1 },
            { frequency: 8000, gain: 0, type: 'highshelf', q: 1 }
        ];

    }
    
    // Update popup title
    const clipName = clip.type === 'sample' ? `Sample ${clip.data}` : `Pattern "${clip.data}"`;
    document.getElementById('arr-popup-clip-name').textContent = clipName;
    
    // Hide LFO and Automation sections for pattern clips (only show for sample clips)
    const lfoSection = effectsPopup.querySelector('.lfo-section');
    const automationSection = effectsPopup.querySelector('.automation-section');
    
    if (clip.type === 'pattern') {
        // Pattern clips: Hide LFO and Automation sections
        if (lfoSection) lfoSection.style.display = 'none';
        if (automationSection) automationSection.style.display = 'none';
    } else {
        // Sample clips: Show all sections
        if (lfoSection) lfoSection.style.display = 'block';
        if (automationSection) automationSection.style.display = 'block';
    }
    
    // Load effects values into controls
    loadEffectsIntoControls(currentClipEffects);
    
    // Start preview playback
    startEffectsPreview(clip);
    
    // Initialize ALL interactive systems with small delays to ensure canvases are rendered
    setTimeout(() => {
        initVisualEQ();
    }, 100);
    
    setTimeout(() => {
        setupLFOTabs();
        // Use the robust event listener initializers (idempotent)
        if (typeof setupAllLFOEventListeners === 'function') setupAllLFOEventListeners();
        initAllLFOVisualizers();
    }, 150);

    setTimeout(() => {
        setupAutomationTabs();
        if (typeof setupAllAutomationEventListeners === 'function') setupAllAutomationEventListeners();
        initAllAutomationVisualizers();
        setupInteractiveAutomation(); // Make automation canvases interactive
    }, 200);
    
    // Position and show popup
    const popupWidth = Math.min(500, window.innerWidth * 0.9);
    const popupHeight = Math.min(600, window.innerHeight * 0.9);
    
    effectsPopup.style.width = popupWidth + 'px';
    effectsPopup.style.height = popupHeight + 'px';
    effectsPopup.style.left = ((window.innerWidth - popupWidth) / 2) + 'px';
    effectsPopup.style.top = ((window.innerHeight - popupHeight) / 2) + 'px';
    effectsPopup.style.display = 'flex';
    
    // Reset scroll position
    const popupContent = effectsPopup.querySelector('.popup-content');
    if (popupContent) {
        popupContent.scrollTop = 0;
    }
    
    // Set up button event listeners (do this each time popup opens to ensure they work)
    const closeBtn = document.getElementById('arr-effects-close-btn');
    const applyBtn = document.getElementById('arr-effects-apply-btn');
    const resetBtn = document.getElementById('arr-effects-reset-btn');


    // Remove old listeners by cloning and replacing (prevents duplicate listeners)
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            hideEffectsPopup();
        });
    }
    
    if (applyBtn) {
        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
        newApplyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();


            try {
                applyEffects();
            } catch (error) {
            }
        });
    }
    
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
        newResetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();


            resetEffects();
        });
    }
    
    // Setup waveform scrubbing
    setupWaveformScrubbing();

}

// Start looping preview playback for effects popup
async function startEffectsPreview(clip) {

    // Stop any existing preview FIRST
    stopEffectsPreview();
    
    // Wait a tiny bit to ensure cleanup completed
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Store the clip for stretch ratio access in playhead animation
    currentPreviewClip = clip;
    
    // Handle pattern clips differently
    if (clip.type === 'pattern') {

        startPatternEffectsPreview(clip);
        return;
    }
    
    if (clip.type !== 'sample') {

        return;
    }
    
    // Load the sample buffer
    // IMPORTANT: Check BOTH sampleBuffers AND folderAudioBuffers
    let buffer = sampleBuffers[clip.data];
    if (!buffer && clip.isFromFolder) {
        // Try folder audio buffers if marked as from folder
        buffer = folderAudioBuffers[clip.data];

    }
    if (!buffer && typeof clip.data === 'number') {
        // Try loading from sample number
        await loadSampleBuffer(clip.data);
        buffer = sampleBuffers[clip.data];
    }
    
    if (!buffer) {
        return;
    }
    
    
    // Calculate clip duration in seconds based on timeline grid
    const clipDurationInBeats = clip.duration || 4; // Default to 4 beats if not set
    const secondsPerBeat = 60 / arrangementState.tempo;
    const clipDurationInSeconds = clipDurationInBeats * secondsPerBeat;
    
    // Validate duration
    if (!isFinite(clipDurationInSeconds) || clipDurationInSeconds <= 0) {
        return;
    }
    
    
    // Create effect chain ONCE (outside the loop function)
    // Create EQ nodes
    previewEqNodes = {
        low: audioContext.createBiquadFilter(),
        lowmid: audioContext.createBiquadFilter(),
        mid: audioContext.createBiquadFilter(),
        highmid: audioContext.createBiquadFilter(),
        high: audioContext.createBiquadFilter()
    };
    
    previewEqNodes.low.type = 'lowshelf';
    previewEqNodes.low.frequency.value = 200;
    previewEqNodes.lowmid.type = 'peaking';
    previewEqNodes.lowmid.frequency.value = 500;
    previewEqNodes.lowmid.Q.value = 1;
    previewEqNodes.mid.type = 'peaking';
    previewEqNodes.mid.frequency.value = 1500;
    previewEqNodes.mid.Q.value = 1;
    previewEqNodes.highmid.type = 'peaking';
    previewEqNodes.highmid.frequency.value = 4000;
    previewEqNodes.highmid.Q.value = 1;
    previewEqNodes.high.type = 'highshelf';
    previewEqNodes.high.frequency.value = 8000;
    
    // Chain EQ nodes
    previewEqNodes.low.connect(previewEqNodes.lowmid);
    previewEqNodes.lowmid.connect(previewEqNodes.mid);
    previewEqNodes.mid.connect(previewEqNodes.highmid);
    previewEqNodes.highmid.connect(previewEqNodes.high);
    
    // Create filter node
    previewFilterNode = audioContext.createBiquadFilter();
    previewFilterNode.type = 'allpass';
    previewEqNodes.high.connect(previewFilterNode);
    
    // Create delay nodes (ALWAYS create them, even if delay is 0)
    previewDelayNode = audioContext.createDelay(5.0); // Max 5 second delay
    previewFeedbackNode = audioContext.createGain();
    previewFeedbackNode.gain.value = 0; // Start with no feedback
    const delayWetGain = audioContext.createGain();
    delayWetGain.gain.value = 0; // Start with no delay wet signal
    
    // Create gain node for dry signal
    previewGainNode = audioContext.createGain();
    previewGainNode.gain.value = 0.7; // Match playback default gain (volume 100 * 0.7)
    previewDryNode = audioContext.createGain(); // Dry path 
    previewDryNode.gain.value = 1.0; // Full dry signal by default
    
    // Create reverb nodes (simple mix control)
    previewReverbNode = audioContext.createGain();
    previewReverbMixNode = audioContext.createGain();
    previewReverbMixNode.gain.value = 1.0; // Pass signal through (reverb controlled by dry gain)
    
    // Setup audio routing with proper reverb chain:
    // Filter -> Delay (with feedback) -> [Wet + Dry merge] -> Dry signal -> [Reverb wet/dry] -> Gain -> Analyzer -> Destination
    
    // DELAY SETUP
    previewFilterNode.connect(previewDelayNode);
    previewDelayNode.connect(delayWetGain);
    previewDelayNode.connect(previewFeedbackNode);
    previewFeedbackNode.connect(previewDelayNode); // Feedback loop
    
    // Connect dry path from filter (bypasses delay)
    previewFilterNode.connect(previewDryNode);
    
    // Merge delay wet and dry into a single node (this becomes input for reverb)
    const delayMergeNode = audioContext.createGain();
    delayWetGain.connect(delayMergeNode);
    previewDryNode.connect(delayMergeNode);
    
    // Store the wet gain for later control
    previewDelayWetGain = delayWetGain;
    
    // REVERB SETUP - Create reverb nodes (even if not initially active)
    // We create them here so they're ready when effects are applied
    const initialEffects = currentClipEffects || clip.effects || {};
    const reverbDecay = (initialEffects.reverb && initialEffects.reverb.decay) || 2;
    const reverbDamping = (initialEffects.reverb && initialEffects.reverb.damping) || 50;
    const reverbMix = (initialEffects.reverb && initialEffects.reverb.mix) || 0;
    
    // Create reverb convolver
    previewReverbConvolver = audioContext.createConvolver();
    
    // Create impulse response
    const sampleRate = audioContext.sampleRate;
    const safeReverbDecay = Math.max(0.1, reverbDecay || 2);
    const length = Math.max(1, Math.floor(sampleRate * safeReverbDecay));
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const n = length - i;
        const decay = Math.pow(n / length, reverbDamping / 50);
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    previewReverbConvolver.buffer = impulse;
    
    // Create reverb wet/dry gains
    previewReverbWetGain = audioContext.createGain();
    previewReverbWetGain.gain.value = reverbMix / 100;
    
    const reverbDryGain = audioContext.createGain();
    reverbDryGain.gain.value = 1.0; // Always pass dry signal
    
    // Route: delayMerge -> [reverbConvolver -> wetGain] + [dryGain] -> finalGain
    delayMergeNode.connect(previewReverbConvolver);
    previewReverbConvolver.connect(previewReverbWetGain);
    
    delayMergeNode.connect(reverbDryGain);
    
    // Both reverb wet and dry connect to final gain
    previewReverbWetGain.connect(previewGainNode);
    reverbDryGain.connect(previewGainNode);
    
    // Connect gain to destination via analyzer for visualization
    if (waveformAnalyzer) {
        try {
            waveformAnalyzer.disconnect();
        } catch (e) {}
    } else {
        waveformAnalyzer = audioContext.createAnalyser();
        waveformAnalyzer.fftSize = 4096;
        waveformAnalyzer.smoothingTimeConstant = 0.7;
    }
    
    previewGainNode.connect(waveformAnalyzer);
    waveformAnalyzer.connect(audioContext.destination);
    
    // Apply initial effects
    // Use the saved effects from the pattern object if available
    if (arrangementState.patterns[clip.data] && arrangementState.patterns[clip.data].effects) {
        currentClipEffects = JSON.parse(JSON.stringify(arrangementState.patterns[clip.data].effects));

    }
    updatePreviewEffects();
    
    // Create and start the source with NATIVE LOOPING
    previewSource = audioContext.createBufferSource();
    previewSource.buffer = buffer;
    
    // Apply speed (playbackRate) AND tempo multiplier (to match playback)
    const effects = currentClipEffects || clip.effects;
    const speed = effects.speed || 1;
    
    // CRITICAL: Apply tempo multiplier (120 BPM is reference = 1.0x)
    // This makes preview follow the BPM slider exactly like playback
    // Support tempos from 40 to 1000 BPM (multipliers: 0.33x to 8.33x)
    const tempoMultiplier = arrangementState.tempo / 120;
    let finalRate = Math.max(0.1, Math.min(16, tempoMultiplier * speed)); // Clamp to safe range
    
    // IMPORTANT: Apply stretch ratio if clip is stretched
    if (clip.stretchMode === true) {
        const originalBars = clip.originalLength || clip.length;
        const stretchedBars = clip.stretchedLength || clip.originalLength || clip.length;
        const stretchRatio = originalBars / stretchedBars;
        finalRate *= stretchRatio;
    }
    
    previewSource.playbackRate.value = finalRate;
    
    // Store base rate for LFO pitch modulation
    previewBasePitchRate = finalRate;
    
    // Calculate trim offset and loop points based on clip settings
    let startOffset = 0;
    let loopDuration = buffer.duration;
    
    if (clip.stretchMode === true) {
        // Stretched clip: use stretchedLength to calculate trim
        const originalBars = clip.originalLength || clip.length;
        const stretchedBars = clip.stretchedLength || clip.originalLength || clip.length;
        const trimStartBars = clip.trimStart || 0;
        
        // Trim offset as proportion of stretched audio
        const trimProportion = trimStartBars / stretchedBars;
        startOffset = trimProportion * buffer.duration;
        
        // Loop duration as proportion of stretched audio
        const clipLengthProportion = clip.length / stretchedBars;
        loopDuration = clipLengthProportion * buffer.duration;
    } else {
        // Normal/trimmed clip: calculate based on original length
        const originalBars = clip.originalLength || clip.length;
        const trimStartBars = clip.trimStart || 0;
        
        if (trimStartBars > 0) {
            const trimProportion = trimStartBars / originalBars;
            startOffset = trimProportion * buffer.duration;
        }
        
        const clipLengthProportion = clip.length / originalBars;
        loopDuration = clipLengthProportion * buffer.duration;
    }
    
    // Use native looping with correct trim/stretch loop points
    previewSource.loop = true;
    previewSource.loopStart = startOffset;
    previewSource.loopEnd = startOffset + loopDuration;
    
    // Connect source to effect chain
    previewSource.connect(previewEqNodes.low);
    
    // Start playback from trim offset
    const startTime = audioContext.currentTime;
    previewSource.start(startTime, startOffset);

    // Initialize waveform visualization for effects preview
    effectsPreviewBuffer = buffer;
    effectsPreviewStartTime = startTime;
    
    // Clear cached waveform - will be regenerated on first draw
    cachedWaveformImage = null;
    
    initEffectsWaveformCanvas();
    
    // Start waveform animation
    if (effectsWaveformAnimationId) {
        cancelAnimationFrame(effectsWaveformAnimationId);
    }
    animateEffectsWaveform();
    
    // Initialize LFOs and Automations
    initializePreviewLFOs();
    initializePreviewAutomations();
    
    // Set flag
    previewInterval = true;
}

// Update preview effects in real-time
function updatePreviewEffects() {
    if (!currentClipEffects || !previewGainNode) return;
    
    const effects = currentClipEffects;
    const now = audioContext.currentTime;
    
    // Update Volume - match scheduled playback scaling (scale to 0.7 max)
    if (previewGainNode) {
        const scaledVolume = (effects.volume / 100) * 0.7;
        previewGainNode.gain.setValueAtTime(scaledVolume, now);
    }
    
    // Update Filter
    if (previewFilterNode) {
        if (effects.filter.type !== 'none') {
            previewFilterNode.type = effects.filter.type;
            previewFilterNode.frequency.setValueAtTime(
                effects.filter.cutoff,
                now
            );
            previewFilterNode.Q.setValueAtTime(
                effects.filter.resonance,
                now
            );

        } else {
            previewFilterNode.type = 'allpass';
        }
    }
    
    // Update EQ (using array of points - interactive EQ)
    if (previewEqNodes.low && effects.eq) {
        // If EQ is an array (interactive EQ), apply points to the 5 filter bands
        if (Array.isArray(effects.eq)) {
            // Apply the first 5 points to the 5 bands (or defaults)
            const p1 = effects.eq[0] || { frequency: 200, gain: 0 };
            const p2 = effects.eq[1] || { frequency: 500, gain: 0 };
            const p3 = effects.eq[2] || { frequency: 1500, gain: 0 };
            const p4 = effects.eq[3] || { frequency: 4000, gain: 0 };
            const p5 = effects.eq[4] || { frequency: 8000, gain: 0 };
            
            previewEqNodes.low.frequency.setValueAtTime(p1.frequency, now);
            previewEqNodes.low.gain.setValueAtTime(p1.gain, now);
            
            previewEqNodes.lowmid.frequency.setValueAtTime(p2.frequency, now);
            previewEqNodes.lowmid.gain.setValueAtTime(p2.gain, now);
            
            previewEqNodes.mid.frequency.setValueAtTime(p3.frequency, now);
            previewEqNodes.mid.gain.setValueAtTime(p3.gain, now);
            
            previewEqNodes.highmid.frequency.setValueAtTime(p4.frequency, now);
            previewEqNodes.highmid.gain.setValueAtTime(p4.gain, now);
            
            previewEqNodes.high.frequency.setValueAtTime(p5.frequency, now);
            previewEqNodes.high.gain.setValueAtTime(p5.gain, now);
            
        } 
        // If EQ is an object (legacy format), apply old way
        else if (effects.eq.low !== undefined) {
            previewEqNodes.low.gain.setValueAtTime(effects.eq.low, now);
            previewEqNodes.lowmid.gain.setValueAtTime(effects.eq.lowmid || 0, now);
            previewEqNodes.mid.gain.setValueAtTime(effects.eq.mid || 0, now);
            previewEqNodes.highmid.gain.setValueAtTime(effects.eq.highmid || 0, now);
            previewEqNodes.high.gain.setValueAtTime(effects.eq.high || 0, now);
        }
    }
    
    // Update Delay
    if (previewDelayNode && effects.delay) {
        const delayTime = effects.delay.time / 1000; // Convert ms to seconds
        const feedback = effects.delay.feedback / 100;
        
        // Smoothly ramp delay time to prevent audio glitches
        previewDelayNode.delayTime.cancelScheduledValues(now);
        previewDelayNode.delayTime.setValueAtTime(previewDelayNode.delayTime.value, now);
        previewDelayNode.delayTime.linearRampToValueAtTime(delayTime, now + 0.05);
        
        if (previewFeedbackNode) {
            // Smoothly ramp feedback as well
            previewFeedbackNode.gain.cancelScheduledValues(now);
            previewFeedbackNode.gain.setValueAtTime(previewFeedbackNode.gain.value, now);
            previewFeedbackNode.gain.linearRampToValueAtTime(feedback, now + 0.05);
        }
        
        // Control wet/dry mix: if delay time is 0, set wet gain to 0
        if (previewDelayWetGain) {
            const wetLevel = delayTime > 0 ? 0.5 : 0; // 50% wet when delay is active
            previewDelayWetGain.gain.setValueAtTime(wetLevel, now);
        }
    }
    
    // Update Reverb Mix and parameters
    if (effects.reverb && previewReverbWetGain && previewReverbConvolver) {
        const reverbMix = effects.reverb.mix / 100; // 0 to 1
        const reverbDecay = effects.reverb.decay || 2;
        const reverbDamping = effects.reverb.damping || 50;
        
        // Update wet gain for mix control
        previewReverbWetGain.gain.setValueAtTime(reverbMix, now);
        
        // If decay changed significantly, recreate the impulse response
        if (Math.abs(reverbDecay - (previewLastReverbDecay || 0)) > 0.2) {
            createPreviewReverb(reverbDecay, reverbDamping);
            previewLastReverbDecay = reverbDecay;
        }
        
    }
    
    // Update LFO parameters WITHOUT recreating oscillators (prevents phase reset & lag)
    updatePreviewLFOParameters();
    
    // Update Pitch (via source playbackRate if needed)
    // Note: Pitch shift requires resampling, typically done via playbackRate
    // For BufferSourceNode with looping, we can't change playbackRate dynamically
    // This would need to be applied when creating the source

}

// Create reverb convolver for preview
function createPreviewReverb(decayTime, damping) {
    
    // Don't recreate if decay is very short (< 0.1s)
    if (decayTime < 0.1) {
        if (previewReverbWetGain) {
            previewReverbWetGain.gain.setValueAtTime(0, audioContext.currentTime);
        }
        return;
    }
    
    if (!previewReverbConvolver) {
        return;
    }
    
    // Create new impulse response
    const sampleRate = audioContext.sampleRate;
    const safeDecayTime = Math.max(0.1, decayTime || 2);
    const length = Math.max(1, Math.floor(sampleRate * safeDecayTime));
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const n = length - i;
        const decay = Math.pow(n / length, damping / 50);
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    // Update the convolver buffer (no need to reconnect)
    previewReverbConvolver.buffer = impulse;
}

// ========================================
// LFO PROCESSING FOR PREVIEW
// ========================================

function initializePreviewLFOs() {
    if (!currentClipEffects || !currentClipEffects.lfos) return;

    // Stop any existing LFOs first
    stopPreviewLFOs();
    
    // Create LFO oscillators and gains for each of the 4 LFOs
    for (let i = 0; i < 4; i++) {
        // Defensive: ensure a slot exists
        const lfo = currentClipEffects.lfos[i] || { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 };
        
        if (!lfo || lfo.target === 'none' || (lfo.depth || 0) === 0) {
            previewLfoOscillators[i] = null;
            previewLfoGains[i] = null;
            continue;
        }

        try {
            // Create oscillator for this LFO
            const oscillator = audioContext.createOscillator();
            oscillator.type = lfo.waveform || 'sine';
            oscillator.frequency.value = lfo.rate || 1;

            // Create gain node to control LFO depth
            const lfoGain = audioContext.createGain();
            const depth = (lfo.depth || 0) / 100;

            // Connect oscillator to gain
            oscillator.connect(lfoGain);

            // Connect to target parameter
            connectLFOToTarget(i, lfo.target, lfoGain, depth);

            // Start the oscillator
            oscillator.start();

            previewLfoOscillators[i] = oscillator;
            previewLfoGains[i] = lfoGain;

        } catch (err) {
            previewLfoOscillators[i] = null;
            previewLfoGains[i] = null;
            // continue to next LFO - do not abort entire initialization
            continue;
        }
    }
}

function connectLFOToTarget(lfoIndex, target, lfoGain, depth) {
    // Determine which parameter to modulate based on target
    switch(target) {
        case 'volume':
            if (previewGainNode) {
                // FIXED: Don't set gain to 0, keep it at base value
                // LFO will modulate AROUND the base value
                const baseGain = previewGainNode.gain.value;
                
                // Connect LFO for modulation (depth * 0.5 means ±50% modulation around base)
                // The gain parameter becomes: base + (LFO × scaling)
                lfoGain.gain.value = baseGain * depth * 0.5;
                lfoGain.connect(previewGainNode.gain);
                
                // No offset node needed! gain.value stays at baseGain
            }
            break;
            
        case 'filter':
            if (previewFilterNode && previewFilterNode.type !== 'allpass') {
                // MATCH PLAYBACK: Use exponential octave-based modulation (±2 octaves)
                const baseFrequency = previewFilterNode.frequency ? previewFilterNode.frequency.value : 1000;
                const maxOctaves = 2; // ±2 octaves range
                const modulationOctaves = maxOctaves * depth;
                const minFrequency = baseFrequency / Math.pow(2, modulationOctaves);
                const maxFrequency = baseFrequency * Math.pow(2, modulationOctaves);
                const scaleFactor = (maxFrequency - minFrequency) / 2;
                
                lfoGain.gain.value = scaleFactor;
                lfoGain.connect(previewFilterNode.frequency);
                
                // Create offset constant to center LFO oscillation around base frequency
                const offsetNode = audioContext.createConstantSource();
                offsetNode.offset.value = (maxFrequency + minFrequency) / 2;
                offsetNode.connect(previewFilterNode.frequency);
                offsetNode.start();
                
                // Store offset node for cleanup
                if (!previewLfoFilterOffsetNodes) previewLfoFilterOffsetNodes = [];
                previewLfoFilterOffsetNodes[lfoIndex] = offsetNode;
                
            }
            break;
            
        case 'pitch':
            // Pitch modulation using detune (for synth) or playbackRate (for samples)
            if (previewSource && previewSource.detune) {
                // Synth: connect to detune (in cents, 100 cents = 1 semitone)
                lfoGain.gain.value = depth * 1200; // Max ±12 semitones (1200 cents)
                lfoGain.connect(previewSource.detune);
            } else if (previewSource && previewSource.playbackRate) {
                // Sample: Use polling interval to modulate playbackRate (MATCHES playback behavior)
                // Must use exponential scaling: playbackRate = baseRate * Math.pow(2, semitones/12)
                
                // Store base rate
                if (!previewBasePitchRate) {
                    previewBasePitchRate = previewSource.playbackRate.value || 1;
                }
                
                // Clear existing interval for this LFO slot
                if (previewLfoPitchIntervals[lfoIndex]) {
                    clearInterval(previewLfoPitchIntervals[lfoIndex]);
                }
                
                // Get LFO object from effects
                const lfo = currentClipEffects.lfos[lfoIndex];
                
                // Start polling interval - INCREASED to 100ms to reduce CPU load
                previewLfoPitchIntervals[lfoIndex] = setInterval(() => {
                    if (!previewSource || !previewSource.playbackRate) return;
                    
                    const currentRate = lfo.rate || 1.0;
                    const currentDepth = (lfo.depth || 0) / 100;
                    const waveform = lfo.waveform || 'sine';
                    const time = audioContext.currentTime;
                    
                    // Use time relative to preview start (phase 0 at start, matches playback behavior)
                    const relativeTime = effectsPreviewStartTime ? (time - effectsPreviewStartTime) : time;
                    const phase = (relativeTime * currentRate * Math.PI * 2) % (Math.PI * 2);
                    
                    let modulation = 0;
                    switch (waveform) {
                        case 'sine': modulation = Math.sin(phase); break;
                        case 'square': modulation = Math.sin(phase) > 0 ? 1 : -1; break;
                        case 'triangle': {
                            const t = (phase / Math.PI) % 2; 
                            modulation = t < 1 ? 2*t-1 : 3-2*t; 
                            break;
                        }
                        case 'sawtooth': modulation = 2 * ((phase / Math.PI) % 1) - 1; break;
                    }
                    
                    const maxSemitones = 12; 
                    const semitones = modulation * maxSemitones * currentDepth;
                    const pitchMultiplier = Math.pow(2, semitones/12);
                    const baseRate = previewBasePitchRate || 1;
                    const newRate = Math.max(0.1, Math.min(16, baseRate * pitchMultiplier)); // Clamp to safe range
                    
                    try { 
                        previewSource.playbackRate.setValueAtTime(newRate, time); 
                    } catch (e) { 
                        clearInterval(previewLfoPitchIntervals[lfoIndex]); 
                        previewLfoPitchIntervals[lfoIndex] = null; 
                    }
                }, 100); // 100ms polling interval - reduced CPU load

            } else {
            }
            break;
            
        case 'delay-time':
            if (previewDelayNode) {
                lfoGain.gain.value = depth * 0.1; // Max ±100ms modulation
                lfoGain.connect(previewDelayNode.delayTime);
            }
            break;
            
        case 'delay-feedback':
            if (previewFeedbackNode) {
                lfoGain.gain.value = depth * 0.3; // Max ±30% feedback modulation
                lfoGain.connect(previewFeedbackNode.gain);
            }
            break;
            
        case 'pan':
            // Connect to stereo panner if available
            if (previewPannerNode) {
                // LFO output is -1..1, scale by depth
                lfoGain.gain.value = depth;
                try {
                    lfoGain.connect(previewPannerNode.pan);
                } catch (e) {
                }
            } else {
            }
            break;
    }
}

function updatePreviewLFOs() {
    if (!currentClipEffects || !currentClipEffects.lfos) return;
    
    // Re-initialize all LFOs with new settings
    initializePreviewLFOs();
}

function stopPreviewLFOs() {
    // Stop and disconnect all LFO oscillators
    for (let i = 0; i < previewLfoOscillators.length; i++) {
        if (previewLfoOscillators[i]) {
            try {
                previewLfoOscillators[i].stop();
                previewLfoOscillators[i].disconnect();
            } catch (e) {
            }
        }
        
        if (previewLfoGains[i]) {
            try {
                previewLfoGains[i].disconnect();
            } catch (e) {}
        }
        
        // Clear pitch polling intervals
        if (previewLfoPitchIntervals[i]) {
            clearInterval(previewLfoPitchIntervals[i]);
            previewLfoPitchIntervals[i] = null;
        }
        
        // Disconnect and stop filter offset nodes
        if (previewLfoFilterOffsetNodes[i]) {
            try {
                previewLfoFilterOffsetNodes[i].disconnect();
                previewLfoFilterOffsetNodes[i].stop();
            } catch (e) {}
            previewLfoFilterOffsetNodes[i] = null;
        }
    }
    
    previewLfoOscillators = [];
    previewLfoGains = [];
    previewLfoPitchIntervals = [];
    previewLfoFilterOffsetNodes = [];
    previewBasePitchRate = 1; // Reset base rate
}

// Update LFO parameters WITHOUT recreating oscillators (prevents phase reset)
function updatePreviewLFOParameters() {
    if (!currentClipEffects || !currentClipEffects.lfos) return;
    
    const now = audioContext.currentTime;
    
    for (let i = 0; i < 4; i++) {
        const lfo = currentClipEffects.lfos[i];
        if (!lfo) continue;
        
        const oscillator = previewLfoOscillators[i];
        const lfoGain = previewLfoGains[i];
        
        if (oscillator && lfoGain) {
            // Update oscillator parameters smoothly WITHOUT recreating
            try {
                // Update waveform if changed
                if (oscillator.type !== lfo.waveform) {
                    oscillator.type = lfo.waveform || 'sine';
                }
                
                // Update frequency (rate) smoothly
                oscillator.frequency.setValueAtTime(lfo.rate || 1, now);
                
                // Update depth based on target type
                const depth = (lfo.depth || 0) / 100;
                
                switch(lfo.target) {
                    case 'volume':
                        lfoGain.gain.setValueAtTime(depth * 0.5, now);
                        break;
                    case 'filter':
                        if (previewFilterNode && previewFilterNode.type !== 'allpass') {
                            const baseFrequency = previewFilterNode.frequency.value || 1000;
                            const maxOctaves = 2;
                            const modulationOctaves = maxOctaves * depth;
                            const minFrequency = baseFrequency / Math.pow(2, modulationOctaves);
                            const maxFrequency = baseFrequency * Math.pow(2, modulationOctaves);
                            const scaleFactor = (maxFrequency - minFrequency) / 2;
                            lfoGain.gain.setValueAtTime(scaleFactor, now);
                        }
                        break;
                    case 'delay-time':
                        lfoGain.gain.setValueAtTime(depth * 0.1, now);
                        break;
                    case 'delay-feedback':
                        lfoGain.gain.setValueAtTime(depth * 0.3, now);
                        break;
                    case 'pan':
                        lfoGain.gain.setValueAtTime(depth, now);
                        break;
                }
                
                // Pitch modulation handled via polling interval - parameters updated automatically
                
            } catch (e) {
            }
        }
    }
}

// ========================================
// AUTOMATION PROCESSING FOR PREVIEW
// ========================================

function initializePreviewAutomations() {
    if (!currentClipEffects || !currentClipEffects.automations) return;

    // Stop any existing automations first
    stopPreviewAutomations();
    
    // Get clip duration for automation timing
    const clipDurationInBeats = currentClipForContext?.duration || 4;
    const secondsPerBeat = 60 / arrangementState.tempo;
    const clipDurationInSeconds = clipDurationInBeats * secondsPerBeat;
    
    // Start each automation
    for (let i = 0; i < 4; i++) {
        const auto = currentClipEffects.automations[i];
        
        if (!auto || auto.target === 'none') {
            continue;
        }
        
        // Start automation loop
        startAutomationLoop(i, auto, clipDurationInSeconds);

    }
}

function startAutomationLoop(autoIndex, auto, clipDuration) {
    const duration = auto.duration || 1; // Duration in bars
    const secondsPerBeat = 60 / arrangementState.tempo;
    const automationDuration = duration * 4 * secondsPerBeat; // bars * 4 beats/bar * seconds/beat
    
    const startValue = auto.start !== undefined ? auto.start / 100 : 0.5;
    const endValue = auto.end !== undefined ? auto.end / 100 : 0.5;
    const curve = auto.curve || 'linear';
    
    let startTime = audioContext.currentTime;
    
    // Update function called repeatedly
    const updateAutomation = () => {
        const elapsed = audioContext.currentTime - startTime;
        const progress = (elapsed % automationDuration) / automationDuration; // 0 to 1
        
        // Calculate value based on curve
        let value;
        switch(curve) {
            case 'exponential':
            case 'easeIn':
                value = startValue + (endValue - startValue) * (progress * progress);
                break;
            case 'logarithmic':
            case 'easeOut':
                value = startValue + (endValue - startValue) * (1 - (1 - progress) * (1 - progress));
                break;
            case 'linear':
            default:
                value = startValue + (endValue - startValue) * progress;
                break;
        }
        
        // Apply to target
        applyAutomationToTarget(auto.target, value);
    };
    
    // Call update at 20fps (was 60fps - way too fast, causes massive lag)
    const intervalId = setInterval(updateAutomation, 50);
    previewAutomationIntervals[autoIndex] = intervalId;
}

function applyAutomationToTarget(target, value) {
    const now = audioContext.currentTime;
    
    switch(target) {
        case 'volume':
            if (previewGainNode) {
                previewGainNode.gain.setValueAtTime(value, now);
            }
            break;
            
        case 'filter':
            if (previewFilterNode && previewFilterNode.type !== 'allpass') {
                const minFreq = 20;
                const maxFreq = 20000;
                const frequency = minFreq + (maxFreq - minFreq) * value;
                previewFilterNode.frequency.setValueAtTime(frequency, now);
            }
            break;
            
        case 'pitch':
            // Pitch automation not possible with BufferSourceNode in real-time
            break;
            
        case 'delay-time':
            if (previewDelayNode) {
                const maxDelay = 1.0; // 1 second max
                previewDelayNode.delayTime.setValueAtTime(value * maxDelay, now);
            }
            break;
            
        case 'delay-feedback':
            if (previewFeedbackNode) {
                previewFeedbackNode.gain.setValueAtTime(value * 0.9, now); // Max 90% feedback
            }
            break;
            
        case 'reverb-mix':
            if (previewReverbMixNode) {
                previewReverbMixNode.gain.setValueAtTime(value, now);
            }
            break;
            
        case 'pan':
            // Panning would require stereo panner
            break;
    }
}

function updatePreviewAutomations() {
    // Re-initialize automations with new settings
    initializePreviewAutomations();
}

function stopPreviewAutomations() {
    // Clear all automation intervals
    for (let i = 0; i < previewAutomationIntervals.length; i++) {
        if (previewAutomationIntervals[i]) {
            clearInterval(previewAutomationIntervals[i]);
        }
    }
    
    previewAutomationIntervals = [];
}

// Stop preview playback
function stopEffectsPreview() {
    
    // Clear cached waveform
    cachedWaveformImage = null;
    
    // Clear the preview clip reference
    currentPreviewClip = null;
    
    // Stop LFOs and Automations FIRST
    stopPreviewLFOs();
    stopPreviewAutomations();
    
    // Stop pattern preview loop interval
    if (pianoRollLoopInterval) {
        clearInterval(pianoRollLoopInterval);

        pianoRollLoopInterval = null;
    }
    
    // Stop all active pattern voices
    if (pianoRollPreviewActiveVoices) {
        Object.values(pianoRollPreviewActiveVoices).forEach(voice => {
            if (voice && voice.source) {
                try {
                    voice.source.stop();
                    voice.source.disconnect();
                } catch (e) {}
            }
            if (voice && voice.source2) {
                try {
                    voice.source2.stop();
                    voice.source2.disconnect();
                } catch (e) {}
            }
            if (voice && voice.gain) {
                try {
                    voice.gain.disconnect();
                } catch (e) {}
            }
        });
        pianoRollPreviewActiveVoices = {};
    }
    
    previewInterval = null;
    
    // Stop and disconnect source (for sample clips)
    if (previewSource) {
        try {

            previewSource.stop();
            previewSource.disconnect();
        } catch (e) {
        }
        previewSource = null;
    }
    
    // Disconnect all effect nodes
    if (previewGainNode) {
        try {
            previewGainNode.disconnect();
        } catch (e) {}
        previewGainNode = null;
    }
    
    if (previewFilterNode) {
        try {
            previewFilterNode.disconnect();
        } catch (e) {}
        previewFilterNode = null;
    }
    
    if (previewEqNodes.low) {
        try {
            previewEqNodes.low.disconnect();
            previewEqNodes.lowmid.disconnect();
            previewEqNodes.mid.disconnect();
            previewEqNodes.highmid.disconnect();
            previewEqNodes.high.disconnect();
        } catch (e) {}
        previewEqNodes = {};
    }
    
    if (previewDelayNode) {
        try {
            previewDelayNode.disconnect();
        } catch (e) {}
        previewDelayNode = null;
    }
    
    if (previewDelayWetGain) {
        try {
            previewDelayWetGain.disconnect();
        } catch (e) {}
        previewDelayWetGain = null;
    }
    
    if (previewFeedbackNode) {
        try {
            previewFeedbackNode.disconnect();
        } catch (e) {}
        previewFeedbackNode = null;
    }
    
    if (previewReverbNode) {
        try {
            previewReverbNode.disconnect();
        } catch (e) {}
        previewReverbNode = null;
    }
    
    if (previewReverbMixNode) {
        try {
            previewReverbMixNode.disconnect();
        } catch (e) {}
        previewReverbMixNode = null;
    }
    
    if (previewDryNode) {
        try {
            previewDryNode.disconnect();
        } catch (e) {}
        previewDryNode = null;
    }
    
    // Disconnect reverb convolver nodes
    if (previewReverbConvolver) {
        try {
            previewReverbConvolver.disconnect();
        } catch (e) {}
        previewReverbConvolver = null;
    }
    
    if (previewReverbWetGain) {
        try {
            previewReverbWetGain.disconnect();
        } catch (e) {}
        previewReverbWetGain = null;
    }
    
    previewLastReverbDecay = null;
    
    // Cleanup LFO
    cleanupLfo();
    
    // Stop waveform rendering animation
    stopEffectsWaveformAnimation();

}

// Initialize waveform canvas for effects preview
function initEffectsWaveformCanvas() {
    try {
        const canvas = document.getElementById('arr-effects-waveform-canvas');
        if (!canvas) {
            return;
        }
        
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = 80;
        
        effectsWaveformCanvas = canvas;
        effectsWaveformCtx = canvas.getContext('2d');

    } catch (e) {
    }
}

// Draw static waveform (cached to avoid redrawing every frame)
function drawStaticWaveform(buffer) {
    if (!effectsWaveformCanvas || !effectsWaveformCtx || !buffer) return null;
    
    const canvas = effectsWaveformCanvas;
    const ctx = effectsWaveformCtx;
    const width = canvas.width;
    const height = canvas.height;
    
    // Create offscreen canvas for caching
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offscreenCtx = offscreen.getContext('2d');
    
    // Clear canvas
    offscreenCtx.fillStyle = 'rgba(15, 15, 15, 1)';
    offscreenCtx.fillRect(0, 0, width, height);
    
    // Draw gradient background
    const gradient = offscreenCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(26, 26, 26, 1)');
    gradient.addColorStop(1, 'rgba(15, 15, 15, 1)');
    offscreenCtx.fillStyle = gradient;
    offscreenCtx.fillRect(0, 0, width, height);
    
    // Draw waveform
    const rawData = buffer.getChannelData(0);
    const blockSize = Math.ceil(rawData.length / width);
    const scaleFactor = 0.8;
    
    offscreenCtx.fillStyle = '#ca006c';
    offscreenCtx.strokeStyle = '#ca006c';
    offscreenCtx.lineWidth = 1;
    
    offscreenCtx.beginPath();
    offscreenCtx.moveTo(0, height / 2);
    
    for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j] || 0);
        }
        const average = sum / blockSize;
        const y = (height / 2) - (average * height * scaleFactor / 2);
        offscreenCtx.lineTo(i, y);
    }
    
    offscreenCtx.stroke();
    
    // Draw filled waveform
    offscreenCtx.lineTo(width, height / 2);
    offscreenCtx.lineTo(0, height / 2);
    offscreenCtx.fillStyle = 'rgba(202, 0, 108, 0.2)';
    offscreenCtx.fill();
    
    // Draw center line
    offscreenCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    offscreenCtx.lineWidth = 1;
    offscreenCtx.setLineDash([3, 3]);
    offscreenCtx.beginPath();
    offscreenCtx.moveTo(0, height / 2);
    offscreenCtx.lineTo(width, height / 2);
    offscreenCtx.stroke();
    offscreenCtx.setLineDash([]);
    
    return offscreen;
}

// Draw waveform on canvas with playhead indicator (uses cached waveform)
function drawEffectsWaveform(buffer, currentTime, duration) {
    if (!effectsWaveformCanvas || !effectsWaveformCtx || !buffer) return;
    
    const canvas = effectsWaveformCanvas;
    const ctx = effectsWaveformCtx;
    const width = canvas.width;
    const height = canvas.height;
    
    // Use cached waveform image if available, otherwise create it
    if (!cachedWaveformImage) {
        cachedWaveformImage = drawStaticWaveform(buffer);
    }
    
    // Draw cached waveform (FAST - just copying image data)
    if (cachedWaveformImage) {
        ctx.drawImage(cachedWaveformImage, 0, 0);
    } else {
        // Fallback: clear canvas
        ctx.fillStyle = 'rgba(15, 15, 15, 1)';
        ctx.fillRect(0, 0, width, height);
    }
    
    // Draw playhead
    if (duration > 0 && previewSource) {
        const playheadPosition = (currentTime % duration) / duration;
        const playheadX = playheadPosition * width;
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
        
        // Playhead circle at top
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(playheadX, 5, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Animate waveform visualization
let lastWaveformFrameTime = 0;
const waveformFrameInterval = 60; // ~16 FPS - only playhead moves, waveform is cached
function animateEffectsWaveform(timestamp) {
    if (!previewSource || !effectsPreviewBuffer) return;
    
    if (!effectsWaveformCanvas) {
        initEffectsWaveformCanvas();
    }
    
    // Throttle to 30 FPS for better performance
    if (timestamp - lastWaveformFrameTime < waveformFrameInterval) {
        effectsWaveformAnimationId = requestAnimationFrame(animateEffectsWaveform);
        return;
    }
    lastWaveformFrameTime = timestamp;
    
    // Calculate real-time elapsed, then adjust for tempo/speed
    const realTimeElapsed = audioContext.currentTime - effectsPreviewStartTime;
    
    // Apply tempo multiplier to playhead movement (match audio playback speed)
    const tempoMultiplier = arrangementState.tempo / 120;
    const speed = (currentClipEffects && currentClipEffects.speed) ? currentClipEffects.speed : 1;
    
    // Calculate stretch ratio if clip is stretched
    let stretchRatio = 1;
    if (currentPreviewClip && currentPreviewClip.stretchMode === true && 
        currentPreviewClip.stretchedLength && currentPreviewClip.originalLength) {
        stretchRatio = currentPreviewClip.originalLength / currentPreviewClip.stretchedLength;
    }
    
    const playbackSpeed = tempoMultiplier * speed * stretchRatio;
    
    // Playhead moves at the same speed as audio playback
    const currentTime = realTimeElapsed * playbackSpeed;
    const bufferDuration = effectsPreviewBuffer.duration;
    
    drawEffectsWaveform(effectsPreviewBuffer, currentTime, bufferDuration);
    
    // Update time labels
    updateWaveformTimeLabels(currentTime, bufferDuration);
    
    effectsWaveformAnimationId = requestAnimationFrame(animateEffectsWaveform);
}

// Update time labels on waveform
function updateWaveformTimeLabels(currentTime, duration) {
    const currentEl = document.getElementById('arr-waveform-time-current');
    const durationEl = document.getElementById('arr-waveform-time-duration');
    
    if (currentEl) {
        currentEl.textContent = formatTime(currentTime);
    }
    if (durationEl) {
        durationEl.textContent = formatTime(duration);
    }
}

// Helper function to format time as MM:SS
function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Stop waveform animation
function stopEffectsWaveformAnimation() {
    if (effectsWaveformAnimationId) {
        cancelAnimationFrame(effectsWaveformAnimationId);
        effectsWaveformAnimationId = null;
    }
}

// Setup waveform scrubbing (click/drag to seek)
function setupWaveformScrubbing() {
    const canvas = document.getElementById('arr-effects-waveform-canvas');
    if (!canvas) return;
    
    let isScrubbing = false;
    
    // Mouse down - start scrubbing
    canvas.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        scrubWaveform(e);
    });
    
    // Mouse move - scrub while dragging
    document.addEventListener('mousemove', (e) => {
        if (isScrubbing && effectsWaveformCanvas) {
            const rect = effectsWaveformCanvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                scrubWaveform(e);
            }
        }
    });
    
    // Mouse up - stop scrubbing
    document.addEventListener('mouseup', () => {
        isScrubbing = false;
    });
    
    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
        isScrubbing = true;
        const touch = e.touches[0];
        scrubWaveform({ clientX: touch.clientX, clientY: touch.clientY });
    });
    
    document.addEventListener('touchmove', (e) => {
        if (isScrubbing && effectsWaveformCanvas) {
            const touch = e.touches[0];
            const rect = effectsWaveformCanvas.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                scrubWaveform({ clientX: touch.clientX, clientY: touch.clientY });
            }
        }
    });
    
    document.addEventListener('touchend', () => {
        isScrubbing = false;
    });
}

// Scrub to a specific position in the waveform
function scrubWaveform(event) {
    if (!effectsWaveformCanvas || !previewSource || !effectsPreviewBuffer) return;
    
    const rect = effectsWaveformCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    
    const newTime = percentage * effectsPreviewBuffer.duration;
    
    // Stop current playback
    try {
        previewSource.stop();
        previewSource.disconnect();
    } catch (e) {}
    
    // Create new source at scrubbed position
    previewSource = audioContext.createBufferSource();
    previewSource.buffer = effectsPreviewBuffer;
    
    // Apply current effects
    const effects = currentClipEffects || {};
    let playbackRate = effects.speed || 1;
    
    // Apply stretch ratio if clip is stretched
    if (currentPreviewClip && currentPreviewClip.stretchMode === true && 
        currentPreviewClip.stretchedLength && currentPreviewClip.originalLength) {
        const stretchRatio = currentPreviewClip.originalLength / currentPreviewClip.stretchedLength;
        playbackRate *= stretchRatio;
    }
    
    previewSource.playbackRate.value = playbackRate;
    previewSource.loop = true;
    previewSource.loopStart = 0;
    previewSource.loopEnd = effectsPreviewBuffer.duration;
    
    // Connect to effect chain
    previewSource.connect(previewEqNodes.low);
    
    // Start from new position
    const startTime = audioContext.currentTime;
    previewSource.start(startTime, newTime);
    
    // Update visualization start time
    effectsPreviewStartTime = startTime - newTime;
    
    // CRITICAL: Clear and recreate delay node to prevent accumulation
    if (previewDelayNode) {
        try {
            previewDelayNode.disconnect();
            previewFeedbackGainNode.disconnect();
            previewDelayWetGain.disconnect();
            previewDryNode.disconnect();
        } catch (e) {}
    }
    
    // Recreate delay nodes fresh
    const delayEffects = currentClipEffects || {};
    if (delayEffects.delay && delayEffects.delay.time > 0) {
        previewDelayNode = audioContext.createDelay(5.0);
        previewFeedbackGainNode = audioContext.createGain();
        previewDelayWetGain = audioContext.createGain();
        previewDryNode = audioContext.createGain();
        
        previewDelayNode.delayTime.value = delayEffects.delay.time / 1000;
        previewFeedbackGainNode.gain.value = delayEffects.delay.feedback / 100;
        previewDelayWetGain.gain.value = 0.5;
        previewDryNode.gain.value = 1.0;
        
        // Reconnect delay in chain: filter -> delay -> feedback -> delay
        previewFilterNode.disconnect();
        previewFilterNode.connect(previewDelayNode);
        previewDelayNode.connect(previewFeedbackGainNode);
        previewFeedbackGainNode.connect(previewDelayNode);
        
        previewDelayNode.connect(previewDelayWetGain);
        previewFilterNode.connect(previewDryNode);
        
        previewDelayWetGain.connect(previewGainNode);
        previewDryNode.connect(previewGainNode);
    } else {
        // No delay - direct connection
        previewFilterNode.disconnect();
        previewFilterNode.connect(previewGainNode);
    }
    
    // CRITICAL: Reinitialize LFOs because pitch LFO needs the new source reference
    // Stop old LFOs first
    stopPreviewLFOs();
    // Restart with new source
    initializePreviewLFOs();
    
    // Update base pitch rate for new source
    previewBasePitchRate = previewSource.playbackRate.value;
}

// Start looping preview for pattern clips
function startPatternEffectsPreview(clip) {

    // IMPORTANT: Stop any existing preview COMPLETELY first
    stopEffectsPreview();
    
    if (!audioContext) {
        initAudioContext();
    }
    
    const pattern = arrangementState.patterns[clip.data];
    if (!pattern || !pattern.notes || pattern.notes.length === 0) {
        return;
    }
    
    // Log what's in the saved pattern



    if (pattern.soundDesign && pattern.soundDesign.envelope && pattern.soundDesign.envelope.pitchMod) {

    } else {

        if (pattern.soundDesign && pattern.soundDesign.envelope) {
        }
    }
    
    // Initialize pianoRollData for this pattern if it doesn't exist
    // This ensures we have the latest sound design settings including pitch modulation
    if (!pianoRollData[clip.data]) {

        pianoRollData[clip.data] = {
            notes: pattern.notes || [],
            gridWidth: pattern.gridWidth || 16,
            soundSource: pattern.soundSource || 'synth',
            soundDesign: pattern.soundDesign || {
                osc1: { wave: 'sine', detune: 0, level: 50 },
                osc2: { wave: 'sawtooth', detune: 0, level: 50 },
                filter: { type: 'lowpass', cutoff: 2000, resonance: 0 },
                envelope: { 
                    attack: 10, 
                    decay: 100, 
                    sustain: 70, 
                    release: 200,
                    pitchMod: { enabled: false, amount: 0 }
                }
            }
        };
    } else {

        // Update with latest pattern data from saved state
        pianoRollData[clip.data].notes = pattern.notes || [];
        pianoRollData[clip.data].gridWidth = pattern.gridWidth || 16;
        if (pattern.soundDesign) {
            pianoRollData[clip.data].soundDesign = JSON.parse(JSON.stringify(pattern.soundDesign));

        } else {

        }
    }




    if (pianoRollData[clip.data].soundDesign.envelope.pitchMod) {

    } else {

    }
    
    // Create master effects chain for pattern playback
    previewEqNodes = {
        low: audioContext.createBiquadFilter(),
        lowmid: audioContext.createBiquadFilter(),
        mid: audioContext.createBiquadFilter(),
        highmid: audioContext.createBiquadFilter(),
        high: audioContext.createBiquadFilter()
    };
    
    previewEqNodes.low.type = 'lowshelf';
    previewEqNodes.low.frequency.value = 200;
    previewEqNodes.lowmid.type = 'peaking';
    previewEqNodes.lowmid.frequency.value = 500;
    previewEqNodes.lowmid.Q.value = 1;
    previewEqNodes.mid.type = 'peaking';
    previewEqNodes.mid.frequency.value = 1500;
    previewEqNodes.mid.Q.value = 1;
    previewEqNodes.highmid.type = 'peaking';
    previewEqNodes.highmid.frequency.value = 4000;
    previewEqNodes.highmid.Q.value = 1;
    previewEqNodes.high.type = 'highshelf';
    previewEqNodes.high.frequency.value = 8000;
    
    // Chain EQ nodes
    previewEqNodes.low.connect(previewEqNodes.lowmid);
    previewEqNodes.lowmid.connect(previewEqNodes.mid);
    previewEqNodes.mid.connect(previewEqNodes.highmid);
    previewEqNodes.highmid.connect(previewEqNodes.high);
    
    // Create filter node
    previewFilterNode = audioContext.createBiquadFilter();
    previewFilterNode.type = 'allpass';
    previewEqNodes.high.connect(previewFilterNode);
    
    // Create delay nodes
    previewDelayNode = audioContext.createDelay(5.0);
    previewFeedbackNode = audioContext.createGain();
    previewFeedbackNode.gain.value = 0;
    const delayWetGain = audioContext.createGain();
    delayWetGain.gain.value = 0;
    
    // Create gain nodes
    previewGainNode = audioContext.createGain();
    previewGainNode.gain.value = 0.3; // Consistent with arrangement playback
    previewDryNode = audioContext.createGain();
    previewDryNode.gain.value = 1.0;
    
    // Setup audio routing with reverb chain (same as sample preview)
    previewFilterNode.connect(previewDelayNode);
    previewDelayNode.connect(delayWetGain);
    previewDelayNode.connect(previewFeedbackNode);
    previewFeedbackNode.connect(previewDelayNode); // Feedback loop
    previewFilterNode.connect(previewDryNode);
    
    // Merge delay wet and dry
    const delayMergeNode = audioContext.createGain();
    delayWetGain.connect(delayMergeNode);
    previewDryNode.connect(delayMergeNode);
    previewDelayWetGain = delayWetGain;
    
    // Create reverb chain
    const initialEffects = pattern.effects || {};
    const reverbDecay = (initialEffects.reverb && initialEffects.reverb.decay) || 2;
    const reverbDamping = (initialEffects.reverb && initialEffects.reverb.damping) || 50;
    const reverbMix = (initialEffects.reverb && initialEffects.reverb.mix) || 0;
    
    previewReverbConvolver = audioContext.createConvolver();
    const sampleRate = audioContext.sampleRate;
    const safeReverbDecay = Math.max(0.1, reverbDecay || 2);
    const length = Math.max(1, Math.floor(sampleRate * safeReverbDecay));
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const n = length - i;
        const decay = Math.pow(n / length, reverbDamping / 50);
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    previewReverbConvolver.buffer = impulse;
    
    previewReverbWetGain = audioContext.createGain();
    previewReverbWetGain.gain.value = reverbMix / 100;
    const reverbDryGain = audioContext.createGain();
    reverbDryGain.gain.value = 1.0;
    
    // Connect reverb chain
    delayMergeNode.connect(previewReverbConvolver);
    previewReverbConvolver.connect(previewReverbWetGain);
    delayMergeNode.connect(reverbDryGain);
    previewReverbWetGain.connect(previewGainNode);
    reverbDryGain.connect(previewGainNode);
    
    // Connect through both analyzers for visualization
    // Disconnect first to avoid double connections
    if (waveformAnalyzer) {
        try {
            waveformAnalyzer.disconnect();
        } catch (e) {}
    } else {
        waveformAnalyzer = audioContext.createAnalyser();
        waveformAnalyzer.fftSize = 4096;
        waveformAnalyzer.smoothingTimeConstant = 0.7;
    }
    
    if (pianoRollVisualizerAnalyzer) {
        try {
            pianoRollVisualizerAnalyzer.disconnect();
        } catch (e) {}
    } else {
        pianoRollVisualizerAnalyzer = audioContext.createAnalyser();
        pianoRollVisualizerAnalyzer.fftSize = 256;
    }
    
    // Chain: previewGainNode -> pianoRollAnalyzer -> waveformAnalyzer -> destination
    previewGainNode.connect(pianoRollVisualizerAnalyzer);
    pianoRollVisualizerAnalyzer.connect(waveformAnalyzer);
    waveformAnalyzer.connect(audioContext.destination);
    
    // Apply initial effects
    updatePreviewEffects();
    
    // Calculate timing
    const tempo = arrangementState.tempo;
    const beatDuration = 60 / tempo;
    const stepDuration = beatDuration / 4; // 16th note
    const gridWidth = pattern.gridWidth || 16;
    
    let currentStep = 0;
    
    // Store active voices for cleanup
    pianoRollPreviewActiveVoices = {};
    
    // Store preview start time for LFO/Automation calculations
    const previewStartTime = audioContext.currentTime;
    
    // Create loop interval
    const loopPattern = () => {
        // Find notes at current step
        const notesAtStep = pattern.notes.filter(n => n.col === currentStep);
        
        notesAtStep.forEach(note => {
            const noteDuration = (note.length || 1) * stepDuration;
            playPatternNoteWithEffects(note.row, audioContext.currentTime, noteDuration, pattern, previewStartTime);
        });
        
        currentStep++;
        if (currentStep >= gridWidth) {
            currentStep = 0; // Loop
        }
    };
    
    // Start loop
    pianoRollLoopInterval = setInterval(loopPattern, stepDuration * 1000);
    previewInterval = pianoRollLoopInterval; // Store for cleanup






}

// Play a single pattern note through the effects chain
function playPatternNoteWithEffects(noteRow, time, duration, pattern, previewStartTime) {
    // Calculate frequency from row using the SAME method as arrangement playback
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(noteRow / 12);
    const noteIndex = noteRow % 12;
    
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    
    const noteName = noteNames[noteIndex];
    const baseFreq = noteFrequencies[noteName];
    const frequency = baseFreq * Math.pow(2, octave);
    
    
    // ALWAYS use pattern.soundDesign and pattern.effects (canonical source)
    let soundDesign = pattern.soundDesign;
    let effects = pattern.effects || {};
    if (soundDesign && soundDesign.envelope && soundDesign.envelope.pitchMod) {

    } else {

    }
    
    if (pattern.soundSource === 'sample') {
        // Play sample at pitch through effects chain
        playPatternSampleWithEffects(frequency, duration, previewStartTime);
    } else {
        // Play synth note through effects chain
        playPatternSynthWithEffects(frequency, duration, soundDesign, previewStartTime);
    }
}

// Play sample through the effects chain
function playPatternSampleWithEffects(frequency, duration, previewStartTime) {
    const buffer = sampleBuffers[currentSampleNumber];
    if (!buffer) return;
    
    // Start with the note's frequency
    const baseFreq = 261.63; // Middle C
    let playbackRate = frequency / baseFreq;
    
    // Get effects for this clip
    // Use latest pattern.effects for preview
    const effects = soundDesign && soundDesign.effects ? soundDesign.effects : (pattern && pattern.effects ? pattern.effects : currentClipEffects || {});
    
    // Apply speed effect (this is the main pitch/speed setting)
    if (effects.speed) {
        playbackRate *= effects.speed;
    }
    
    // Calculate LFO/Automation modulation
    const currentTime = audioContext.currentTime;
    const elapsedTime = previewStartTime ? (currentTime - previewStartTime) : 0;
    
    // Apply LFO pitch modulation
    if (effects.lfos && Array.isArray(effects.lfos)) {
        effects.lfos.forEach(lfo => {
            if (lfo.enabled && lfo.target === 'pitch' && lfo.depth > 0) {
                const lfoValue = getLFOValue(lfo, currentTime);
                const semitones = lfoValue * 12; // ±1 octave range
                const pitchMultiplier = Math.pow(2, semitones / 12);
                playbackRate *= pitchMultiplier;
            }
        });
    }
    
    // Apply Automation pitch modulation
    if (effects.automations && Array.isArray(effects.automations)) {
        const clipDuration = 16; // Assuming 4 bars default
        effects.automations.forEach(auto => {
            if (auto.enabled && auto.target === 'pitch') {
                const autoValue = getAutomationValue(auto, previewStartTime || 0, currentTime, clipDuration);
                // autoValue is 0-1, convert to -1 to +1 range, then to semitones
                const normalizedValue = (autoValue - 0.5) * 2; // -1 to +1
                const semitones = normalizedValue * 12; // ±1 octave
                const pitchMultiplier = Math.pow(2, semitones / 12);
                playbackRate *= pitchMultiplier;
            }
        });
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    
    // Connect to the master effects chain
    source.connect(previewEqNodes.low);
    
    // Start and schedule stop
    const now = audioContext.currentTime;
    source.start(now);
    source.stop(now + duration);
    
    // Track for cleanup
    const voiceId = `voice_${Date.now()}_${Math.random()}`;
    pianoRollPreviewActiveVoices[voiceId] = { source };
    
    source.onended = () => {
        try {
            source.disconnect();
        } catch (e) {}
        delete pianoRollPreviewActiveVoices[voiceId];
    };
}

// Play synth note through the effects chain - PROFESSIONAL QUALITY with full sound design
function playPatternSynthWithEffects(frequency, duration, soundDesign, previewStartTime) {
    // Check for too many active voices (indicates cleanup issue)
    const activeVoiceCount = Object.keys(pianoRollPreviewActiveVoices || {}).length;
    if (activeVoiceCount > 20) {
        // Force cleanup
        if (pianoRollPreviewActiveVoices) {
            Object.values(pianoRollPreviewActiveVoices).forEach(voice => {
                try {
                    if (voice.oscillators) voice.oscillators.forEach(osc => osc.stop());
                } catch (e) {}
            });
            pianoRollPreviewActiveVoices = {};
        }
        return; // Don't play more notes
    }
    
    const effects = currentClipEffects || {};
    
    // Apply speed effect to match playback
    let finalFrequency = frequency;
    if (effects.speed) {
        finalFrequency *= effects.speed;
    }
    
    // FULL SOUND DESIGN - Match savePatternAsSample quality
    const sd = soundDesign || {
        masterVolume: 70,
        osc1: { wave: 'sine', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
        osc2: { wave: 'sawtooth', detune: 0, level: 50, octave: 0, phase: 0, pan: 0 },
        unison: { voices: 1, detune: 10, pan: 50 },
        filter: { type: 'lowpass', cutoff: 2000, resonance: 0, envAmount: 0 },
        envelope: { attack: 10, decay: 100, sustain: 70, release: 200, pitchMod: { enabled: false, amount: 0 } },
        pwm: { enabled: false, rate: 5, depth: 50 }
    };
    
    // Normalize unison settings
    if (!sd.unison) sd.unison = { voices: 1, detune: 10, pan: 50 };
    if (!sd.pwm) sd.pwm = { enabled: false, rate: 5, depth: 50 };
    
    const now = audioContext.currentTime;
    
    // Apply octave shifts
    const osc1OctaveShift = Math.pow(2, sd.osc1.octave || 0);
    const osc2OctaveShift = Math.pow(2, sd.osc2.octave || 0);
    
    const osc1Frequency = finalFrequency * osc1OctaveShift;
    const osc2Frequency = finalFrequency * osc2OctaveShift;
    
    // Unison support
    const unisonVoices = sd.unison.voices > 1 ? sd.unison.voices : 1;
    const unisonDetune = sd.unison.detune || 10;
    const unisonPan = (sd.unison.pan || 50) / 100;
    
    const allOscillators = []; // Track all oscillators for cleanup
    const osc1Array = [];
    const osc2Array = [];
    const osc1GainArray = [];
    const osc2GainArray = [];
    
    // Helper: Create oscillator with phase offset
    function createOscillatorWithPhase(context, waveType, frequency, phase) {
        const osc = context.createOscillator();
        
        if (phase !== 0) {
            // Create custom PeriodicWave with phase offset
            const phaseRadians = (phase / 360) * Math.PI * 2;
            const size = 4096;
            const real = new Float32Array(size);
            const imag = new Float32Array(size);
            
            if (waveType === 'sine') {
                real[1] = Math.cos(phaseRadians);
                imag[1] = Math.sin(phaseRadians);
            } else if (waveType === 'square') {
                for (let n = 1; n < size; n += 2) {
                    real[n] = (4 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                    imag[n] = (4 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                }
            } else if (waveType === 'sawtooth' || waveType === 'custom') {
                for (let n = 1; n < size; n++) {
                    real[n] = -(2 / (Math.PI * n)) * Math.cos(n * phaseRadians);
                    imag[n] = -(2 / (Math.PI * n)) * Math.sin(n * phaseRadians);
                }
            } else if (waveType === 'triangle') {
                for (let n = 1; n < size; n += 2) {
                    const sign = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
                    real[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.cos(n * phaseRadians);
                    imag[n] = sign * (8 / (Math.PI * Math.PI * n * n)) * Math.sin(n * phaseRadians);
                }
            }
            
            const wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
            osc.setPeriodicWave(wave);
        } else {
            osc.type = waveType === 'custom' ? 'sawtooth' : waveType;
        }
        
        osc.frequency.value = frequency;
        return osc;
    }
    
    // Create unison voices
    for (let v = 0; v < unisonVoices; v++) {
        const voiceDetune = unisonVoices > 1 
            ? ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
            : 0;
        
        const osc1Phase = sd.osc1.phase || 0;
        const osc2Phase = sd.osc2.phase || 0;
        
        const osc1 = createOscillatorWithPhase(audioContext, sd.osc1.wave, osc1Frequency, osc1Phase);
        const osc2 = createOscillatorWithPhase(audioContext, sd.osc2.wave, osc2Frequency, osc2Phase);
        
        osc1.detune.value = (sd.osc1.detune || 0) + voiceDetune;
        osc2.detune.value = (sd.osc2.detune || 0) + voiceDetune;
        
        const osc1Gain = audioContext.createGain();
        const osc2Gain = audioContext.createGain();
        
        // Apply stereo width for unison
        if (unisonVoices > 1 && unisonPan > 0) {
            const panPosition = ((v / (unisonVoices - 1)) - 0.5) * 2 * unisonPan;
            const panner = audioContext.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, panPosition));
            
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
            osc1Gain.connect(panner);
            osc2Gain.connect(panner);
            
            osc1Gain.panner = panner;
            osc2Gain.panner = panner;
        } else {
            osc1.connect(osc1Gain);
            osc2.connect(osc2Gain);
        }
        
        allOscillators.push(osc1, osc2);
        osc1Array.push(osc1);
        osc2Array.push(osc2);
        osc1GainArray.push(osc1Gain);
        osc2GainArray.push(osc2Gain);
    }
    
    // Master gains for osc1 and osc2
    const osc1MasterGain = audioContext.createGain();
    const osc2MasterGain = audioContext.createGain();
    
    osc1GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc1MasterGain);
        } else {
            gain.connect(osc1MasterGain);
        }
    });
    osc2GainArray.forEach(gain => {
        if (gain.panner) {
            gain.panner.connect(osc2MasterGain);
        } else {
            gain.connect(osc2MasterGain);
        }
    });
    
    // Set voice levels
    const voiceLevelScale = 1 / Math.sqrt(unisonVoices);
    osc1GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    osc2GainArray.forEach(gain => {
        gain.gain.value = voiceLevelScale;
    });
    
    // Set master oscillator levels
    const masterVolume = (sd.masterVolume || 70) / 100;
    const osc1Level = (sd.osc1.level || 0) / 100;
    const osc2Level = (sd.osc2.level || 0) / 100;
    const totalLevel = osc1Level + osc2Level;
    const normalizationFactor = totalLevel > 0 ? 1 / Math.max(totalLevel, 1) : 1;
    
    osc1MasterGain.gain.value = osc1Level * normalizationFactor * masterVolume * 0.3; // 0.3 = preview volume
    osc2MasterGain.gain.value = osc2Level * normalizationFactor * masterVolume * 0.3;
    
    // Create filter with envelope support
    const filter = audioContext.createBiquadFilter();
    filter.type = sd.filter.type || 'lowpass';
    const baseCutoff = Math.max(20, sd.filter.cutoff || 2000);
    filter.frequency.value = baseCutoff;
    filter.Q.value = (sd.filter.resonance || 0) / 10;
    
    // Create envelope
    const env = audioContext.createGain();
    
    // Connect audio graph
    osc1MasterGain.connect(filter);
    osc2MasterGain.connect(filter);
    filter.connect(env);
    env.connect(previewEqNodes.low); // Connect to master effects chain
    
    // ADSR envelope - exponential ramps for smooth sound
    const attack = Math.max(0.001, (sd.envelope.attack || 0) / 1000);
    const decay = Math.max(0.001, (sd.envelope.decay || 0) / 1000);
    const sustainLevel = (sd.envelope.sustain || 0) / 100;
    const release = Math.max(0.01, (sd.envelope.release || 0) / 1000);
    
    const minValue = 0.0001;
    env.gain.setValueAtTime(minValue, now);
    env.gain.exponentialRampToValueAtTime(1, now + attack);
    const sustainValue = Math.max(minValue, sustainLevel);
    env.gain.exponentialRampToValueAtTime(sustainValue, now + attack + decay);
    env.gain.setValueAtTime(sustainValue, now + duration);
    env.gain.exponentialRampToValueAtTime(minValue, now + duration + release);
    
    // Apply Filter Envelope if amount is set
    const filterEnvAmount = sd.filter.envAmount || 0;
    if (filterEnvAmount !== 0) {
        const filterEnvRange = Math.abs(filterEnvAmount) / 100 * 10000;
        const filterTargetCutoff = filterEnvAmount > 0 
            ? Math.min(20000, baseCutoff + filterEnvRange)
            : Math.max(20, baseCutoff - filterEnvRange);
        
        filter.frequency.setValueAtTime(filterTargetCutoff, now);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + attack);
        filter.frequency.setValueAtTime(baseCutoff, now + attack + decay);
        filter.frequency.setValueAtTime(baseCutoff, now + duration);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff * 0.5, now + duration + release);
    }
    
    // Pitch envelope modulation
    if (sd.envelope.pitchMod && sd.envelope.pitchMod.enabled && sd.envelope.pitchMod.amount !== 0) {
        const pitchAmount = sd.envelope.pitchMod.amount;
        const maxDetune = pitchAmount * 100;
        
        osc1Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            osc.detune.setValueAtTime((sd.osc1.detune || 0) + voiceDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime((sd.osc1.detune || 0) + voiceDetune, now + attack);
        });
        
        osc2Array.forEach((osc, idx) => {
            const voiceDetune = unisonVoices > 1 
                ? ((idx / (unisonVoices - 1)) - 0.5) * 2 * unisonDetune 
                : 0;
            osc.detune.setValueAtTime((sd.osc2.detune || 0) + voiceDetune + maxDetune, now);
            osc.detune.linearRampToValueAtTime((sd.osc2.detune || 0) + voiceDetune, now + attack);
        });
    }
    
    // PWM (Pulse Width Modulation)
    if (sd.pwm && sd.pwm.enabled && sd.pwm.rate > 0 && sd.pwm.depth > 0) {
        osc1Array.forEach((osc) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.type = 'sine';
            pwmLFO.frequency.value = sd.pwm.rate;
            pwmGain.gain.value = (sd.pwm.depth / 100) * 50; // Max 50 cents modulation
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(now + duration + release);
            allOscillators.push(pwmLFO);
        });
        
        osc2Array.forEach((osc) => {
            const pwmLFO = audioContext.createOscillator();
            const pwmGain = audioContext.createGain();
            
            pwmLFO.type = 'sine';
            pwmLFO.frequency.value = sd.pwm.rate;
            pwmGain.gain.value = (sd.pwm.depth / 100) * 50;
            
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune);
            
            pwmLFO.start(now);
            pwmLFO.stop(now + duration + release);
            allOscillators.push(pwmLFO);
        });
    }
    
    // Start all oscillators
    allOscillators.forEach(osc => {
        osc.start(now);
        osc.stop(now + duration + release);
    });
    
    // Track for cleanup
    const voiceId = `voice_${Date.now()}_${Math.random()}`;
    pianoRollPreviewActiveVoices[voiceId] = { oscillators: allOscillators, gain: env };
    
    allOscillators[0].onended = () => {
        try {
            allOscillators.forEach(osc => osc.disconnect());
            osc1GainArray.forEach(g => g.disconnect());
            osc2GainArray.forEach(g => g.disconnect());
            osc1MasterGain.disconnect();
            osc2MasterGain.disconnect();
            filter.disconnect();
            env.disconnect();
        } catch (e) {}
        delete pianoRollPreviewActiveVoices[voiceId];
    };
}

function hideEffectsPopup() {


    stopEffectsPreview(); // Stop preview playback
    stopWaveformAnimation(); // Stop EQ waveform animation
    
    // Log final state before closing
    if (currentClipForContext) {
        const clip = arrangementState.clips.find(c => c.id === currentClipForContext.id);
        if (clip && clip.effects) {

        } else {
        }
    }
    
    if (effectsPopup) {
        effectsPopup.style.display = 'none';

    } else {
    }
    
    currentClipForContext = null;
    currentClipEffects = null;
    originalClipEffects = null;
    
}

function getDefaultEffects() {
    return {
        volume: 100,
        speed: 1,
        delay: {
            time: 0,
            feedback: 0
        },
        reverb: {
            decay: 0,
            predelay: 0,
            diffusion: 50,
            lowcut: 20,
            highcut: 20000,
            damping: 50,
            mix: 0
        },
        // EQ as ARRAY of points (matching PsychologicalStudio format)
        eq: [
            { frequency: 200, gain: 0, type: 'lowshelf', q: 1 },
            { frequency: 500, gain: 0, type: 'peaking', q: 1 },
            { frequency: 1500, gain: 0, type: 'peaking', q: 1 },
            { frequency: 4000, gain: 0, type: 'peaking', q: 1 },
            { frequency: 8000, gain: 0, type: 'highshelf', q: 1 }
        ],
        filter: {
            type: 'none',
            cutoff: 1000,
            resonance: 0
        },
        pitch: 0,
        // Legacy LFO/Automation for compatibility
        lfo: {
            enabled: false,
            target: 'filter',
            waveform: 'sine',
            rate: 1,
            depth: 0
        },
        automation: {
            enabled: false,
            target: 'volume',
            points: [
                { time: 0, value: 50 },
                { time: 1, value: 50 }
            ]
        },
        // Arrays for 4 LFOs and 4 Automations (PsychologicalStudio format)
        lfos: [
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 }
        ],
        automations: [
            { enabled: false, target: 'none', start: 50, end: 50, duration: 1, curve: 'linear' },
            { enabled: false, target: 'none', start: 50, end: 50, duration: 1, curve: 'linear' },
            { enabled: false, target: 'none', start: 50, end: 50, duration: 1, curve: 'linear' },
            { enabled: false, target: 'none', start: 50, end: 50, duration: 1, curve: 'linear' }
        ]
    };
}

function loadEffectsIntoControls(effects) {
    // Ensure all effect objects exist with defaults
    if (!effects.delay) effects.delay = { time: 0, feedback: 0 };
    if (!effects.reverb) effects.reverb = { decay: 0, predelay: 0, diffusion: 50, lowcut: 20, highcut: 20000, damping: 50, mix: 0 };
    if (!effects.filter) effects.filter = { type: 'none', cutoff: 1000, resonance: 0 };
    if (!effects.eq) effects.eq = { bands: [0, 0, 0, 0, 0, 0, 0, 0] };
    
    // Volume
    document.getElementById('arr-sample-volume').value = effects.volume || 100;
    document.getElementById('arr-sample-volume-value').textContent = `${effects.volume || 100}%`;
    
    // Speed
    document.getElementById('arr-speed-select').value = effects.speed || 1;
    
    // Delay
    document.getElementById('arr-delay-time').value = effects.delay.time || 0;
    document.getElementById('arr-delay-time-value').textContent = effects.delay.time || 0;
    document.getElementById('arr-delay-feedback').value = effects.delay.feedback || 0;
    document.getElementById('arr-delay-feedback-value').textContent = effects.delay.feedback || 0;
    
    // Reverb
    document.getElementById('arr-reverb-decay').value = effects.reverb.decay || 0;
    document.getElementById('arr-reverb-decay-value').textContent = effects.reverb.decay || 0;
    document.getElementById('arr-reverb-predelay').value = effects.reverb.predelay || 0;
    document.getElementById('arr-reverb-predelay-value').textContent = effects.reverb.predelay || 0;
    document.getElementById('arr-reverb-diffusion').value = effects.reverb.diffusion || 50;
    document.getElementById('arr-reverb-diffusion-value').textContent = effects.reverb.diffusion || 50;
    document.getElementById('arr-reverb-lowcut').value = effects.reverb.lowcut || 20;
    document.getElementById('arr-reverb-lowcut-value').textContent = effects.reverb.lowcut || 20;
    document.getElementById('arr-reverb-highcut').value = effects.reverb.highcut || 20000;
    document.getElementById('arr-reverb-highcut-value').textContent = effects.reverb.highcut || 20000;
    document.getElementById('arr-reverb-damping').value = effects.reverb.damping || 50;
    document.getElementById('arr-reverb-damping-value').textContent = effects.reverb.damping || 50;
    document.getElementById('arr-reverb-mix').value = effects.reverb.mix || 0;
    document.getElementById('arr-reverb-mix-value').textContent = effects.reverb.mix || 0;
    
    // NOTE: EQ is now handled by interactive canvas - no sliders to load
    
    // Filter
    document.getElementById('arr-filter-type').value = effects.filter.type || 'none';
    document.getElementById('arr-filter-cutoff').value = effects.filter.cutoff || 1000;
    document.getElementById('arr-filter-cutoff-value').textContent = effects.filter.cutoff || 1000;
    document.getElementById('arr-filter-resonance').value = effects.filter.resonance || 0;
    document.getElementById('arr-filter-resonance-value').textContent = effects.filter.resonance || 0;
    
    // NOTE: Pitch Shift section removed - use Speed or LFO Pitch instead
    
    // Load LFOs (4 independent LFOs)
    if (effects.lfos && Array.isArray(effects.lfos)) {
        // Ensure effects.lfos has 4 slots
        while (effects.lfos.length < 4) {
            effects.lfos.push({ enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 });
        }
        for (let i = 0; i < 4; i++) {
            const lfo = effects.lfos[i] || { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 };
            const lfoNum = i + 1;
            
            const targetEl = document.getElementById(`arr-lfo-${lfoNum}-target`);
            const waveformEl = document.getElementById(`arr-lfo-${lfoNum}-waveform`);
            const rateEl = document.getElementById(`arr-lfo-${lfoNum}-rate`);
            const depthEl = document.getElementById(`arr-lfo-${lfoNum}-depth`);
            
            if (targetEl) targetEl.value = lfo.target || 'none';
            if (waveformEl) waveformEl.value = lfo.waveform || 'sine';
            if (rateEl) {
                rateEl.value = lfo.rate || 1;
                document.getElementById(`arr-lfo-${lfoNum}-rate-value`).textContent = (lfo.rate || 1).toFixed(1);
            }
            if (depthEl) {
                depthEl.value = lfo.depth || 0;
                document.getElementById(`arr-lfo-${lfoNum}-depth-value`).textContent = `${lfo.depth || 0}%`;
            }
            // Ensure enabled flag exists and matches UI-derived state
            if (typeof lfo.enabled === 'undefined') {
                lfo.enabled = (lfo.target && lfo.target !== 'none' && (lfo.depth || 0) > 0);
            }
            // Write normalized back to effects to keep the canonical structure
            effects.lfos[i] = lfo;
        }
    }
    
    // Load Automations (4 independent automations)
    if (effects.automations && Array.isArray(effects.automations)) {
        for (let i = 0; i < 4; i++) {
            const auto = effects.automations[i] || { target: 'none', start: 50, end: 50, duration: 1, curve: 'linear' };
            const autoNum = i + 1;
            
            const targetEl = document.getElementById(`arr-automation-${autoNum}-target`);
            const startEl = document.getElementById(`arr-automation-${autoNum}-start`);
            const endEl = document.getElementById(`arr-automation-${autoNum}-end`);
            const durationEl = document.getElementById(`arr-automation-${autoNum}-duration`);
            const curveEl = document.getElementById(`arr-automation-${autoNum}-curve`);
            
            if (targetEl) targetEl.value = auto.target || 'none';
            if (startEl) {
                startEl.value = auto.start !== undefined ? auto.start : 50;
                document.getElementById(`arr-automation-${autoNum}-start-value`).textContent = startEl.value;
            }
            if (endEl) {
                endEl.value = auto.end !== undefined ? auto.end : 50;
                document.getElementById(`arr-automation-${autoNum}-end-value`).textContent = endEl.value;
            }
            if (durationEl) {
                durationEl.value = auto.duration !== undefined ? auto.duration : 1;
                document.getElementById(`arr-automation-${autoNum}-duration-value`).textContent = durationEl.value;
            }
            if (curveEl) curveEl.value = auto.curve || 'linear';
        }
    }
}

// Apply effects in real-time while adjusting (for live preview during playback)
// Throttle applyEffectsRealTime to prevent lag from rapid slider changes
let applyEffectsTimeout = null;
function applyEffectsRealTime() {
    if (!currentClipForContext || !currentClipEffects) {
        return;
    }
    
    // Throttle: only apply once every 50ms to prevent lag
    if (applyEffectsTimeout) {
        clearTimeout(applyEffectsTimeout);
    }
    
    applyEffectsTimeout = setTimeout(() => {
        // Update the clip's effects in the arrangement state immediately
        const clip = arrangementState.clips.find(c => c.id === currentClipForContext.id);
        if (clip) {
            clip.effects = JSON.parse(JSON.stringify(currentClipEffects));
        }
        
        // Update preview playback in real-time WITHOUT reinitializing LFOs
        updatePreviewEffects();
    }, 50);
}

function setupEffectsControls() {
    // Volume
    const volumeSlider = document.getElementById('arr-sample-volume');
    const volumeValue = document.getElementById('arr-sample-volume-value');
    volumeSlider.oninput = () => {
        const val = volumeSlider.value;
        volumeValue.textContent = `${val}%`;
        if (currentClipEffects) {
            currentClipEffects.volume = +val;
            applyEffectsRealTime();
        }
    };
    
    // Speed
    const speedSelect = document.getElementById('arr-speed-select');
    speedSelect.onchange = () => {
        if (currentClipEffects) {
            currentClipEffects.speed = +speedSelect.value;
            applyEffectsRealTime();
            
            // Speed change requires restarting the audio source with new playbackRate
            if (currentClipForContext) {

                startEffectsPreview(currentClipForContext);
            }
        }
    };
    
    // Delay Time
    const delayTimeSlider = document.getElementById('arr-delay-time');
    const delayTimeValue = document.getElementById('arr-delay-time-value');
    delayTimeSlider.oninput = () => {
        const val = delayTimeSlider.value;
        delayTimeValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.delay.time = +val;
            applyEffectsRealTime();
        }
    };
    
    // Delay Feedback
    const delayFeedbackSlider = document.getElementById('arr-delay-feedback');
    const delayFeedbackValue = document.getElementById('arr-delay-feedback-value');
    delayFeedbackSlider.oninput = () => {
        const val = delayFeedbackSlider.value;
        delayFeedbackValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.delay.feedback = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Decay
    const reverbDecaySlider = document.getElementById('arr-reverb-decay');
    const reverbDecayValue = document.getElementById('arr-reverb-decay-value');
    reverbDecaySlider.oninput = () => {
        const val = reverbDecaySlider.value;
        reverbDecayValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.decay = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Predelay
    const reverbPredelaySlider = document.getElementById('arr-reverb-predelay');
    const reverbPredelayValue = document.getElementById('arr-reverb-predelay-value');
    reverbPredelaySlider.oninput = () => {
        const val = reverbPredelaySlider.value;
        reverbPredelayValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.predelay = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Diffusion
    const reverbDiffusionSlider = document.getElementById('arr-reverb-diffusion');
    const reverbDiffusionValue = document.getElementById('arr-reverb-diffusion-value');
    reverbDiffusionSlider.oninput = () => {
        const val = reverbDiffusionSlider.value;
        reverbDiffusionValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.diffusion = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Low Cut
    const reverbLowcutSlider = document.getElementById('arr-reverb-lowcut');
    const reverbLowcutValue = document.getElementById('arr-reverb-lowcut-value');
    reverbLowcutSlider.oninput = () => {
        const val = reverbLowcutSlider.value;
        reverbLowcutValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.lowcut = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb High Cut
    const reverbHighcutSlider = document.getElementById('arr-reverb-highcut');
    const reverbHighcutValue = document.getElementById('arr-reverb-highcut-value');
    reverbHighcutSlider.oninput = () => {
        const val = reverbHighcutSlider.value;
        reverbHighcutValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.highcut = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Damping
    const reverbDampingSlider = document.getElementById('arr-reverb-damping');
    const reverbDampingValue = document.getElementById('arr-reverb-damping-value');
    reverbDampingSlider.oninput = () => {
        const val = reverbDampingSlider.value;
        reverbDampingValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.damping = +val;
            applyEffectsRealTime();
        }
    };
    
    // Reverb Mix
    const reverbMixSlider = document.getElementById('arr-reverb-mix');
    const reverbMixValue = document.getElementById('arr-reverb-mix-value');
    reverbMixSlider.oninput = () => {
        const val = reverbMixSlider.value;
        reverbMixValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.reverb.mix = +val;
            applyEffectsRealTime();
        }
    };
    
    // Filter Type
    const filterTypeSelect = document.getElementById('arr-filter-type');
    filterTypeSelect.onchange = () => {
        if (currentClipEffects) {
            currentClipEffects.filter.type = filterTypeSelect.value;
            applyEffectsRealTime();
        }
    };
    
    // Filter Cutoff
    const filterCutoffSlider = document.getElementById('arr-filter-cutoff');
    const filterCutoffValue = document.getElementById('arr-filter-cutoff-value');
    filterCutoffSlider.oninput = () => {
        const val = filterCutoffSlider.value;
        filterCutoffValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.filter.cutoff = +val;
            applyEffectsRealTime();
        }
    };
    
    // Filter Resonance
    const filterResonanceSlider = document.getElementById('arr-filter-resonance');
    const filterResonanceValue = document.getElementById('arr-filter-resonance-value');
    filterResonanceSlider.oninput = () => {
        const val = filterResonanceSlider.value;
        filterResonanceValue.textContent = val;
        if (currentClipEffects) {
            currentClipEffects.filter.resonance = +val;
            applyEffectsRealTime();
        }
    };
    
    // NOTE: Old EQ sliders removed - now using interactive canvas
    // EQ is handled by initVisualEQ() and drag handlers
    
    // NOTE: Old single LFO/Automation controls removed - now using tabbed LFO MODULATORS system
    // Event listeners for LFO 1-4 and Automation 1-4 should be set up separately if needed
    
    // NOTE: Pitch Shift section removed - use Speed or LFO Pitch instead

}

// LFO TAB SWITCHING (robust, idempotent, uses event delegation)
function setupLFOTabs() {
    // Setup ALL .lfo-tabs containers (piano roll and main effects popup)
    const allTabsContainers = document.querySelectorAll('.lfo-tabs');
    
    allTabsContainers.forEach(tabsContainer => {
        // Remove previous handler if present to avoid duplicate listeners
        if (tabsContainer._lfoHandler) {
            tabsContainer.removeEventListener('click', tabsContainer._lfoHandler);
            tabsContainer._lfoHandler = null;
        }

        const handler = function(e) {
            const btn = e.target.closest('.lfo-tab');
            if (!btn || !tabsContainer.contains(btn)) return;

            const lfoNum = btn.getAttribute('data-lfo') || btn.getAttribute('data-pr-lfo');
            if (!lfoNum) return;

            // Update tab buttons within this container only
            tabsContainer.querySelectorAll('.lfo-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            // Find the corresponding panel container (could be piano-roll or effects popup)
            const parentSection = tabsContainer.closest('[id*="lfo"], [class*="lfo"]');
            
            // Look for panels - try piano roll first, then main effects
            let panels;
            if (parentSection && parentSection.id.includes('piano-roll')) {
                // Piano roll panels
                panels = parentSection.querySelectorAll('.lfo-panel');
            } else {
                // Main effects popup panels - use the LFO section containing the tabs
                const lfoSection = tabsContainer.closest('.effects-section, [class*="lfo-section"]');
                if (lfoSection) {
                    panels = lfoSection.querySelectorAll('.lfo-panel');
                } else {
                    panels = document.querySelectorAll('.lfo-panel');
                }
            }
            
            panels.forEach(p => p.classList.remove('active'));
            
            // Determine which panel ID to look for
            let panelId;
            if (tabsContainer.closest('[id*="piano-roll"]')) {
                panelId = `pr-lfo-panel-${lfoNum}`;
            } else {
                panelId = `arr-lfo-panel-${lfoNum}`;
            }
            
            const panel = document.getElementById(panelId);
            if (panel) panel.classList.add('active');

            // Initialize visualizer for this LFO when its tab is shown
            try { initSingleLFOVisualizer(parseInt(lfoNum)); } catch (err) { /* ignore */ }
        };

        tabsContainer.addEventListener('click', handler);
        tabsContainer._lfoHandler = handler;

        // Ensure at least one LFO tab/panel is active
        const anyActive = tabsContainer.querySelector('.lfo-tab.active');
        if (!anyActive) {
            const first = tabsContainer.querySelector('.lfo-tab');
            if (first) {
                first.classList.add('active');
                const id = first.getAttribute('data-lfo') || first.getAttribute('data-pr-lfo');
                
                // Determine which panel ID to activate
                let panelId;
                if (tabsContainer.closest('[id*="piano-roll"]')) {
                    panelId = `pr-lfo-panel-${id}`;
                } else {
                    panelId = `arr-lfo-panel-${id}`;
                }
                
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
                try { initSingleLFOVisualizer(parseInt(id)); } catch (err) {}
            }
        }
    });
}

// AUTOMATION TAB SWITCHING (robust, idempotent)
function setupAutomationTabs() {
    const tabsContainer = document.querySelector('.automation-tabs, #automation-tabs');
    if (!tabsContainer) return;

    // Remove previous handler if present
    if (tabsContainer._autoHandler) {
        tabsContainer.removeEventListener('click', tabsContainer._autoHandler);
        tabsContainer._autoHandler = null;
    }

    const handler = function(e) {
        const btn = e.target.closest('.automation-tab');
        if (!btn || !tabsContainer.contains(btn)) return;

        const autoNum = btn.getAttribute('data-automation');
        if (!autoNum) return;

        // Update tab buttons
        tabsContainer.querySelectorAll('.automation-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');

        // Update panels
        document.querySelectorAll('.automation-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`arr-automation-panel-${autoNum}`);
        if (panel) panel.classList.add('active');

        try { initSingleAutomationVisualizer(parseInt(autoNum)); } catch (err) { /* ignore */ }
    };

    tabsContainer.addEventListener('click', handler);
    tabsContainer._autoHandler = handler;

    // Ensure at least one automation tab/panel is active
    const anyActive = tabsContainer.querySelector('.automation-tab.active');
    if (!anyActive) {
        const first = tabsContainer.querySelector('.automation-tab');
        if (first) {
            first.classList.add('active');
            const id = first.getAttribute('data-automation');
            const panel = document.getElementById(`arr-automation-panel-${id}`);
            if (panel) panel.classList.add('active');
            try { initSingleAutomationVisualizer(parseInt(id)); } catch (err) {}
        }
    }
}

// DRAW LFO WAVEFORM
function drawLFOWaveform(lfoIndex) {
    throttleCanvasRender(`arr-lfo-${lfoIndex}`, () => {
        const canvas = document.getElementById(`arr-lfo-${lfoIndex}-wave`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
        
        // Get LFO settings
        const waveform = document.getElementById(`arr-lfo-${lfoIndex}-waveform`).value;
        const depth = parseFloat(document.getElementById(`arr-lfo-${lfoIndex}-depth`).value);
        
        if (depth === 0) return; // Don't draw if depth is 0
        
        // Draw grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        
        // Draw waveform
        ctx.strokeStyle = '#533483';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const amplitude = (height / 2) * (depth / 100);
        const cycles = 2; // Show 2 cycles
        
        for (let x = 0; x < width; x++) {
            const phase = (x / width) * cycles * Math.PI * 2;
            let y;
            
            switch(waveform) {
                case 'sine':
                    y = centerY - Math.sin(phase) * amplitude;
                    break;
                case 'square':
                    y = centerY - (Math.sin(phase) > 0 ? amplitude : -amplitude);
                    break;
                case 'triangle':
                    y = centerY - ((2 / Math.PI) * Math.asin(Math.sin(phase))) * amplitude;
                    break;
                case 'sawtooth':
                    y = centerY - ((phase % (Math.PI * 2)) / (Math.PI * 2) * 2 - 1) * amplitude;
                    break;
                default:
                    y = centerY;
            }
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }); // Close throttleCanvasRender callback
}

// DRAW AUTOMATION CURVE
function drawAutomationCurve(autoIndex) {
    throttleCanvasRender(`arr-automation-${autoIndex}`, () => {
        const canvas = document.getElementById(`arr-automation-${autoIndex}-canvas`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
        
        // Get automation settings
        const startVal = parseFloat(document.getElementById(`arr-automation-${autoIndex}-start`).value);
        const endVal = parseFloat(document.getElementById(`arr-automation-${autoIndex}-end`).value);
        const curve = document.getElementById(`arr-automation-${autoIndex}-curve`).value;
        
        // Draw grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw automation curve
        ctx.strokeStyle = '#533483';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let x = 0; x < width; x++) {
            const t = x / width; // 0 to 1
            let value;
            
            switch(curve) {
                case 'linear':
                    value = startVal + (endVal - startVal) * t;
                    break;
                case 'exponential':
                    value = startVal + (endVal - startVal) * (t * t);
                    break;
                case 'logarithmic':
                    value = startVal + (endVal - startVal) * Math.sqrt(t);
                    break;
                default:
                    value = startVal + (endVal - startVal) * t;
            }
            
            const y = height - (value / 100) * height;
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw start and end points
        ctx.fillStyle = '#6644a0';
        const startY = height - (startVal / 100) * height;
        const endY = height - (endVal / 100) * height;
        ctx.beginPath();
        ctx.arc(0, startY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(width, endY, 4, 0, Math.PI * 2);
        ctx.fill();
    }); // Close throttleCanvasRender callback
}

// SETUP ALL LFO LISTENERS
function setupAllLFOListeners() {
    for (let i = 1; i <= 4; i++) {
        // Target
        const target = document.getElementById(`arr-lfo-${i}-target`);
        target.addEventListener('change', () => {
            if (currentClipEffects) {
                currentClipEffects.lfos[i-1].target = target.value;
            }
        });
        
        // Waveform
        const waveform = document.getElementById(`arr-lfo-${i}-waveform`);
        waveform.addEventListener('change', () => {
            if (currentClipEffects) {
                currentClipEffects.lfos[i-1].waveform = waveform.value;
            }
            drawLFOWaveform(i);
        });
        
        // Rate
        const rate = document.getElementById(`arr-lfo-${i}-rate`);
        const rateValue = document.getElementById(`arr-lfo-${i}-rate-value`);
        rate.addEventListener('input', () => {
            const val = parseFloat(rate.value);
            rateValue.textContent = val.toFixed(1);
            if (currentClipEffects) {
                currentClipEffects.lfos[i-1].rate = val;
            }
        });
        
        // Depth
        const depth = document.getElementById(`arr-lfo-${i}-depth`);
        const depthValue = document.getElementById(`arr-lfo-${i}-depth-value`);
        depth.addEventListener('input', () => {
            const val = parseInt(depth.value);
            depthValue.textContent = `${val}%`;
            if (currentClipEffects) {
                currentClipEffects.lfos[i-1].depth = val;
            }
            drawLFOWaveform(i);
        });
    }
}

// SETUP ALL AUTOMATION LISTENERS
function setupAllAutomationListeners() {
    for (let i = 1; i <= 4; i++) {
        // Target
        const target = document.getElementById(`arr-automation-${i}-target`);
        target.addEventListener('change', () => {
            if (currentClipEffects) {
                currentClipEffects.automations[i-1].target = target.value;
            }
        });
        
        // Start
        const start = document.getElementById(`arr-automation-${i}-start`);
        const startValue = document.getElementById(`arr-automation-${i}-start-value`);
        start.addEventListener('input', () => {
            const val = parseInt(start.value);
            startValue.textContent = val;
            if (currentClipEffects) {
                currentClipEffects.automations[i-1].start = val;
            }
            drawAutomationCurve(i);
        });
        
        // End
        const end = document.getElementById(`arr-automation-${i}-end`);
        const endValue = document.getElementById(`arr-automation-${i}-end-value`);
        end.addEventListener('input', () => {
            const val = parseInt(end.value);
            endValue.textContent = val;
            if (currentClipEffects) {
                currentClipEffects.automations[i-1].end = val;
            }
            drawAutomationCurve(i);
        });
        
        // Duration
        const duration = document.getElementById(`arr-automation-${i}-duration`);
        const durationValue = document.getElementById(`arr-automation-${i}-duration-value`);
        duration.addEventListener('input', () => {
            const val = parseInt(duration.value);
            durationValue.textContent = val;
            if (currentClipEffects) {
                currentClipEffects.automations[i-1].duration = val;
            }
        });
        
        // Curve
        const curve = document.getElementById(`arr-automation-${i}-curve`);
        curve.addEventListener('change', () => {
            if (currentClipEffects) {
                currentClipEffects.automations[i-1].curve = curve.value;
            }
            drawAutomationCurve(i);
        });
    }
}

function applyEffects() {


    if (!currentClipForContext || !currentClipEffects) {
        return;
    }
    
    // Find the actual clip in the state and update its effects
    const clip = arrangementState.clips.find(c => c.id === currentClipForContext.id);

    if (clip) {
        const effectsToSave = JSON.parse(JSON.stringify(currentClipEffects));
        // Always save the full EQ array for persistence and playback
        if (effectsToSave.eq && Array.isArray(effectsToSave.eq)) {
            // Save both array and object for compatibility
            const eqObj = {
                low: 0,
                lowmid: 0,
                mid: 0,
                highmid: 0,
                high: 0
            };
            effectsToSave.eq.forEach(point => {
                if (Math.abs(point.frequency - 200) < 1) eqObj.low = point.gain;
                else if (Math.abs(point.frequency - 500) < 1) eqObj.lowmid = point.gain;
                else if (Math.abs(point.frequency - 1500) < 1) eqObj.mid = point.gain;
                else if (Math.abs(point.frequency - 4000) < 1) eqObj.highmid = point.gain;
                else if (Math.abs(point.frequency - 8000) < 1) eqObj.high = point.gain;
            });
            effectsToSave.eqObject = eqObj; // Save object for legacy compatibility
        }
    
    // Save to clip
    clip.effects = JSON.parse(JSON.stringify(effectsToSave));
    
    // If this clip is currently playing/scheduled, update its active nodes so new effects apply immediately
    try { updateActiveClipEffects(clip, clip.effects); } catch (e) { }

    // Update UI immediately so the arrangement shows new settings
    try { renderAllClips(); } catch (e) { }
        // If this is a pattern clip, also update the pattern's effects and pianoRollData
        if (clip.type === 'pattern' && arrangementState.patterns[clip.data]) {
            arrangementState.patterns[clip.data].effects = JSON.parse(JSON.stringify(effectsToSave));

            if (pianoRollData[clip.data]) {
                pianoRollData[clip.data].effects = JSON.parse(JSON.stringify(effectsToSave));

            }
        }
        saveArrangement(false);
    } else {
    }
    
    hideEffectsPopup();
    // After applying, refresh preview to use latest pattern.effects
    if (currentClipForContext && currentClipForContext.type === 'pattern') {
        setTimeout(() => {
            startPatternEffectsPreview(currentClipForContext);
        }, 100);
        // Patch: Force arrangement playback to reload updated pattern effects
        if (arrangementState.isPlaying) {

            stopArrangementPlayback();
            setTimeout(() => {
                startArrangementPlayback();
            }, 200);
        }
    }
}

function resetEffects() {

    if (!currentClipForContext) {
        return;
    }
    
    // Reset to default effects
    const defaultEffects = getDefaultEffects();
    currentClipEffects = JSON.parse(JSON.stringify(defaultEffects));

    loadEffectsIntoControls(currentClipEffects);
    
    // Apply changes immediately in real-time (don't wait for Accept button)
    if (previewSource && audioContext) {
        // Stop and restart preview with default effects
        stopPreviewLFOs();
        stopPreviewAutomations();
        updatePreviewEffects();
        initializePreviewLFOs();
        initializePreviewAutomations();
    }
}

function openPatternEditor(clip) {

    if (clip.type !== 'pattern') {
        return;
    }
    
    const pattern = arrangementState.patterns[clip.data];
    if (!pattern) {
        return;
    }

    // Stop arrangement playback when opening pattern editor
    // Only preview should play while editing patterns
    if (arrangementState.isPlaying) {
        stopArrangement();
    }

    // Set current sample for popup (needed for initPianoRoll)
    currentSampleForPopup = clip.data;
    
    // Set pattern name in input
    const nameInput = document.getElementById('pattern-name-input');
    if (nameInput) {
        nameInput.value = clip.data;
    }
    
    // Initialize piano roll data for this pattern
    if (!pianoRollData[clip.data]) {
        pianoRollData[clip.data] = {
            notes: pattern.notes || [],
            gridWidth: pattern.gridWidth || 16,
            soundSource: pattern.soundSource || 'synth',
            soundDesign: pattern.soundDesign || {
                osc1: { wave: 'sine', detune: 0, level: 50 },
                osc2: { wave: 'sawtooth', detune: 0, level: 50 },
                filter: { type: 'lowpass', cutoff: 2000, resonance: 0 },
                envelope: { 
                    attack: 10, 
                    decay: 100, 
                    sustain: 70, 
                    release: 200,
                    pitchMod: { enabled: false, amount: 0 }
                }
            },
            lfos: pattern.lfos ? JSON.parse(JSON.stringify(pattern.lfos)) : undefined,
            effects: pattern.effects ? JSON.parse(JSON.stringify(pattern.effects)) : undefined
        };
    } else {
        // Update with latest pattern data
        pianoRollData[clip.data].notes = pattern.notes || [];
        pianoRollData[clip.data].gridWidth = pattern.gridWidth || 16;
        pianoRollData[clip.data].soundSource = pattern.soundSource || 'synth';
        pianoRollData[clip.data].soundDesign = pattern.soundDesign;
        pianoRollData[clip.data].lfos = pattern.lfos ? JSON.parse(JSON.stringify(pattern.lfos)) : undefined;
        pianoRollData[clip.data].effects = pattern.effects ? JSON.parse(JSON.stringify(pattern.effects)) : undefined;
        
        // Ensure pitchMod exists in envelope
        if (pianoRollData[clip.data].soundDesign && pianoRollData[clip.data].soundDesign.envelope) {
            if (!pianoRollData[clip.data].soundDesign.envelope.pitchMod) {
                pianoRollData[clip.data].soundDesign.envelope.pitchMod = { enabled: false, amount: 0 };
            }
        }
    }
    
    // Open the pattern editor popup with this pattern's data
    // Use classList.add('active') to match the save/cancel button behavior
    patternEditorPopup.classList.add('active');
    isEditingPattern = true;
    currentEditingPatternName = clip.data;
    
    // Scroll to top when opening
    setTimeout(() => {
        const scrollable = document.getElementById('piano-roll-scrollable');
        if (scrollable) {
            scrollable.scrollTop = 0;
            scrollable.scrollLeft = 0;
        }
    }, 50);

    // Load pattern data into editor
    pianoRollNotes = JSON.parse(JSON.stringify(pattern.notes || []));
    pianoRollGridWidth = pattern.gridWidth || 16;
    
    // Update sound source
    const soundSourceSelect = document.getElementById('piano-roll-sound-source');
    if (soundSourceSelect) {
        soundSourceSelect.value = pattern.soundSource || 'synth';
    }
    
    // Load sound design if available
    if (pattern.soundDesign) {
        loadSoundDesignControls(pattern.soundDesign);
    }
    
    // Initialize piano roll and visualizer
    initPianoRoll();
    initPianoRollVisualizer();
    initSoundDesignControls(); // ← CRITICAL: Missing from edit flow!
    
    // Initialize LFOs from pattern data
    setTimeout(() => {
        initPianoRollLFOs();
        setupPianoRollLFOListeners();
    }, 50);
    
    // Start animation loops for canvases
    startPianoRollVisualizerAnimation();
    drawADSRCanvas();
    
    // Start LFO waveform visualizer animations for all 4 LFOs
    for (let i = 1; i <= 4; i++) {
        drawPianoRollLFOWaveform(i);
    }
    
    // Trigger sound source change to ensure ADSR canvas is drawn
    setTimeout(() => {
        if (soundSourceSelect) {
            soundSourceSelect.dispatchEvent(new Event('change'));
        }
    }, 100);
    
    // Auto-start preview when editing a pattern
    setTimeout(() => {
        if (typeof previewPianoRoll === 'function' && pianoRollNotes.length > 0) {

            previewPianoRoll();
        }
    }, 200);

    // Adjust save UI for edit mode: hide Save as MIDI / Save as Sample and make Save overwrite
    try {
        const saveBtn = document.getElementById('pattern-save-btn');
        const saveMidiBtn = document.getElementById('pattern-save-midi-btn');
        const saveSampleBtn = document.getElementById('pattern-save-sample-btn');
        if (saveMidiBtn) saveMidiBtn.style.display = 'none';
        if (saveSampleBtn) saveSampleBtn.style.display = 'none';
        if (saveBtn) {
            saveBtn.style.display = ''; // Show Save Pattern button for editing
            saveBtn.textContent = 'Save (overwrite)';
            // Replace to clear earlier listeners and attach overwrite handler
            const newSave = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSave, saveBtn);
            newSave.addEventListener('click', () => {
                const name = currentEditingPatternName || (document.getElementById('pattern-name-input') && document.getElementById('pattern-name-input').value.trim()) || null;
                if (!name) {
                    return;
                }
                const data = pianoRollData[currentSampleForPopup];
                // Overwrite existing pattern in-place
                arrangementState.patterns[name] = arrangementState.patterns[name] || {};
                arrangementState.patterns[name].notes = JSON.parse(JSON.stringify(data.notes));
                arrangementState.patterns[name].soundSource = data.soundSource;
                arrangementState.patterns[name].soundDesign = data.soundDesign ? JSON.parse(JSON.stringify(data.soundDesign)) : arrangementState.patterns[name].soundDesign;
                arrangementState.patterns[name].gridWidth = data.gridWidth;
                arrangementState.patterns[name].length = Math.ceil(data.gridWidth / 16);
                // Preserve existing effects unless data has effects
                if (data.effects) {
                    arrangementState.patterns[name].effects = JSON.parse(JSON.stringify(data.effects));
                }
                // Save LFOs if present
                if (data.lfos) {
                    arrangementState.patterns[name].lfos = JSON.parse(JSON.stringify(data.lfos));
                }

                // Update any clips that reference this pattern to reflect new length
                arrangementState.clips.forEach(c => {
                    if (c.type === 'pattern' && c.data === name) {
                        c.length = Math.ceil(data.gridWidth / 16);
                    }
                });

                // Close popup and cleanup
                patternEditorPopup.classList.remove('active');
                stopPianoRollPreview();
                isEditingPattern = false;
                currentEditingPatternName = null;
                renderTimeline();
                updatePatternDropdown();

            });
        }
        
        // Setup Cancel button for edit mode
        const cancelBtn = document.getElementById('pattern-cancel-btn');
        if (cancelBtn) {
            const newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            newCancel.addEventListener('click', () => {
                // Discard changes and close
                patternEditorPopup.classList.remove('active');
                stopPianoRollPreview();
                isEditingPattern = false;
                currentEditingPatternName = null;

            });
        }
    } catch (e) {
    }
}

function loadSoundDesignControls(sd) {
    if (!sd) {
        return;
    }

    // Helper function to safely set element value
    const safeSetValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.value = value;
            } else {
                el.textContent = value;
            }
        } else {
        }
    };
    
    // Load oscillator 1 settings
    if (sd.osc1) {
        safeSetValue('sd-osc1-wave', sd.osc1.wave);
        safeSetValue('sd-osc1-detune', sd.osc1.detune);
        safeSetValue('sd-osc1-detune-val', sd.osc1.detune);
        safeSetValue('sd-osc1-level', sd.osc1.level);
        safeSetValue('sd-osc1-level-val', sd.osc1.level + '%');
    }
    
    // Load oscillator 2 settings
    if (sd.osc2) {
        safeSetValue('sd-osc2-wave', sd.osc2.wave);
        safeSetValue('sd-osc2-detune', sd.osc2.detune);
        safeSetValue('sd-osc2-detune-val', sd.osc2.detune);
        safeSetValue('sd-osc2-level', sd.osc2.level);
        safeSetValue('sd-osc2-level-val', sd.osc2.level + '%');
    }
    
    // Load filter settings
    if (sd.filter) {
        safeSetValue('sd-filter-type', sd.filter.type);
        safeSetValue('sd-filter-cutoff', sd.filter.cutoff);
        safeSetValue('sd-filter-cutoff-val', sd.filter.cutoff + ' Hz');
        safeSetValue('sd-filter-resonance', sd.filter.resonance);
        safeSetValue('sd-filter-resonance-val', sd.filter.resonance);
    }
    
    // Load envelope settings
    if (sd.envelope) {
        safeSetValue('sd-env-attack', sd.envelope.attack);
        safeSetValue('sd-env-attack-val', sd.envelope.attack + ' ms');
        safeSetValue('sd-env-decay', sd.envelope.decay);
        safeSetValue('sd-env-decay-val', sd.envelope.decay + ' ms');
        safeSetValue('sd-env-sustain', sd.envelope.sustain);
        safeSetValue('sd-env-sustain-val', sd.envelope.sustain + '%');
        safeSetValue('sd-env-release', sd.envelope.release);
        safeSetValue('sd-env-release-val', sd.envelope.release + ' ms');
        
        // Load pitch modulation settings
        if (sd.envelope.pitchMod) {
            const pitchEnable = document.getElementById('sd-env-pitch-enable');
            const pitchAmount = document.getElementById('sd-env-pitch-amount');
            const pitchAmountVal = document.getElementById('sd-env-pitch-amount-val');
            
            if (pitchEnable) {
                pitchEnable.checked = sd.envelope.pitchMod.enabled || false;
            }
            if (pitchAmount) {
                pitchAmount.value = sd.envelope.pitchMod.amount || 0;
            }
            if (pitchAmountVal) {
                pitchAmountVal.textContent = (sd.envelope.pitchMod.amount || 0) + '';
            }
        }
    }
    
    // Redraw ADSR canvas after loading
    setTimeout(() => {
        drawADSRCanvas();
    }, 100);

}

// ========================================
// INTERACTIVE EQ SYSTEM
// Copied from PsychologicalStudio
// ========================================

// Interpolate gain using Catmull-Rom spline
function interpolateGainSpline(frequency, sortedPoints) {
    if (sortedPoints.length === 0) return 0;
    if (sortedPoints.length === 1) return sortedPoints[0].gain;
    
    const logPoints = sortedPoints.map(p => ({
        x: Math.log10(p.frequency),
        y: p.gain
    }));
    
    const x = Math.log10(frequency);
    
    if (x <= logPoints[0].x) return logPoints[0].y;
    if (x >= logPoints[logPoints.length - 1].x) return logPoints[logPoints.length - 1].y;
    
    let i = 0;
    for (i = 0; i < logPoints.length - 1; i++) {
        if (x >= logPoints[i].x && x <= logPoints[i + 1].x) {
            break;
        }
    }
    
    const p0 = logPoints[Math.max(0, i - 1)];
    const p1 = logPoints[i];
    const p2 = logPoints[i + 1];
    const p3 = logPoints[Math.min(logPoints.length - 1, i + 2)];
    
    const t = (x - p1.x) / (p2.x - p1.x);
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
        2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
}

// Add a new EQ point
function addEQPoint(frequency, gain) {
    if (!currentClipEffects || !currentClipEffects.eq) return null;
    
    // Check if we already have an EQ array structure
    if (!Array.isArray(currentClipEffects.eq)) {
        // Convert from object structure to array structure
        currentClipEffects.eq = [];
    }
    
    if (currentClipEffects.eq.length >= MAX_EQ_POINTS) return null;
    if (frequency <= 20 || frequency >= 20000) return null;
    
    let type = "peaking";
    if (frequency < 200) type = "lowshelf";
    else if (frequency > 8000) type = "highshelf";
    
    const newPoint = {
        frequency: frequency,
        gain: gain,
        q: 1,
        type: type
    };
    
    currentClipEffects.eq.push(newPoint);
    currentClipEffects.eq.sort((a, b) => a.frequency - b.frequency);
    
    updatePreviewEffects();
    drawEQVisual();
    
    return newPoint;
}

// Initialize visual EQ canvas
function initVisualEQ() {
    eqCanvas = document.getElementById("arr-eq-canvas");
    if (!eqCanvas) {
        return;
    }
    
    eqCtx = eqCanvas.getContext("2d");
    const container = eqCanvas.parentElement;
    eqCanvas.width = container.clientWidth;
    eqCanvas.height = container.clientHeight;
    
    drawEQVisual();
    
    // Add event listeners
    eqCanvas.addEventListener("mousedown", startDraggingEQBand);
    eqCanvas.addEventListener("mousemove", dragEQBand);
    eqCanvas.addEventListener("mouseup", stopDraggingEQBand);
    eqCanvas.addEventListener("mouseleave", stopDraggingEQBand);
    eqCanvas.addEventListener("touchstart", handleEQTouchStart);
    eqCanvas.addEventListener("touchmove", handleEQTouchMove);
    eqCanvas.addEventListener("touchend", stopDraggingEQBand);
    
    initWaveformVisualization();
}

// Initialize waveform visualization
function initWaveformVisualization() {
    if (!previewGainNode) return;
    
    if (!waveformAnalyzer) {
        waveformAnalyzer = audioContext.createAnalyser();
        waveformAnalyzer.fftSize = 4096;
        waveformAnalyzer.smoothingTimeConstant = 0.7;
        
        // Connect to preview output
        if (previewGainNode) {
            previewGainNode.disconnect();
            previewGainNode.connect(waveformAnalyzer);
            waveformAnalyzer.connect(audioContext.destination);
        }
    }
    
    startWaveformAnimation();
}

// Start waveform animation
function startWaveformAnimation() {
    if (waveformAnimationId) {
        cancelAnimationFrame(waveformAnimationId);
    }
    
    const bufferLength = waveformAnalyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function animate() {
        waveformAnimationId = requestAnimationFrame(animate);
        waveformAnalyzer.getByteFrequencyData(dataArray);
        
        waveformHistory.push([...dataArray]);
        if (waveformHistory.length > waveformHistorySize) {
            waveformHistory.shift();
        }
        
        drawEQVisual();
    }
    
    animate();
}

// Stop waveform animation
function stopWaveformAnimation() {
    if (waveformAnimationId) {
        cancelAnimationFrame(waveformAnimationId);
        waveformAnimationId = null;
    }
    waveformHistory = [];
    if (eqCanvas) {
        drawEQVisual();
    }
}

// Draw EQ visual
function drawEQVisual() {
    if (!eqCanvas || !eqCtx) return;
    
    const width = eqCanvas.width;
    const height = eqCanvas.height;
    const padding = 20;
    
    // Clear canvas
    eqCtx.fillStyle = "#0a0a0f";
    eqCtx.fillRect(0, 0, width, height);
    
    // Draw grid
    eqCtx.strokeStyle = "#1a1a2e";
    eqCtx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i <= 4; i++) {
        const y = padding + (i * (height - 2 * padding) / 4);
        eqCtx.beginPath();
        eqCtx.moveTo(padding, y);
        eqCtx.lineTo(width - padding, y);
        eqCtx.stroke();
    }
    
    // Vertical lines
    for (let i = 0; i <= 4; i++) {
        const x = padding + (i * (width - 2 * padding) / 4);
        eqCtx.beginPath();
        eqCtx.moveTo(x, padding);
        eqCtx.lineTo(x, height - padding);
        eqCtx.stroke();
    }
    
    // Draw 0dB line
    eqCtx.strokeStyle = "#333";
    eqCtx.lineWidth = 1;
    eqCtx.setLineDash([5, 3]);
    const zeroDbY = height / 2;
    eqCtx.beginPath();
    eqCtx.moveTo(padding, zeroDbY);
    eqCtx.lineTo(width - padding, zeroDbY);
    eqCtx.stroke();
    eqCtx.setLineDash([]);
    
    // Draw waveform if available
    if (waveformHistory.length > 0) {
        drawEQWaveform();
    }
    
    // Draw EQ curve
    if (!currentClipEffects || !currentClipEffects.eq) return;
    
    // Handle both object and array EQ structures
    let eqPoints = [];
    if (Array.isArray(currentClipEffects.eq)) {
        eqPoints = currentClipEffects.eq;
    } else {
        // Convert object structure to points for visualization
        // This is for backward compatibility
        const eq = currentClipEffects.eq;
        if (eq.low !== undefined && eq.low !== 0) {
            eqPoints.push({ frequency: 200, gain: eq.low, type: 'lowshelf', q: 1 });
        }
        if (eq.lowmid !== undefined && eq.lowmid !== 0) {
            eqPoints.push({ frequency: 500, gain: eq.lowmid, type: 'peaking', q: 1 });
        }
        if (eq.mid !== undefined && eq.mid !== 0) {
            eqPoints.push({ frequency: 1500, gain: eq.mid, type: 'peaking', q: 1 });
        }
        if (eq.highmid !== undefined && eq.highmid !== 0) {
            eqPoints.push({ frequency: 4000, gain: eq.highmid, type: 'peaking', q: 1 });
        }
        if (eq.high !== undefined && eq.high !== 0) {
            eqPoints.push({ frequency: 8000, gain: eq.high, type: 'highshelf', q: 1 });
        }
    }
    
    const sortedPoints = [...eqPoints].sort((a, b) => a.frequency - b.frequency);
    
    // Draw curve
    eqCtx.strokeStyle = "#4CAF50";
    eqCtx.lineWidth = 4;
    eqCtx.shadowColor = "rgba(76, 175, 80, 0.8)";
    eqCtx.shadowBlur = 8;
    eqCtx.beginPath();
    
    const numPoints = 200;
    for (let i = 0; i <= numPoints; i++) {
        const x = padding + (i * (width - 2 * padding) / numPoints);
        const freq = 20 * Math.pow(20000 / 20, (x - padding) / (width - 2 * padding));
        let gain = interpolateGainSpline(freq, sortedPoints);
        const y = height / 2 - (gain / 24) * (height / 2 - padding);
        
        if (i === 0) {
            eqCtx.moveTo(x, y);
        } else {
            eqCtx.lineTo(x, y);
        }
    }
    
    eqCtx.stroke();
    eqCtx.shadowBlur = 0;
    
    // Draw EQ points
    for (let i = 0; i < eqPoints.length; i++) {
        const point = eqPoints[i];
        const x = padding + (Math.log10(point.frequency / 20) / Math.log10(20000 / 20)) * (width - 2 * padding);
        const y = height / 2 - (point.gain / 24) * (height / 2 - padding);
        
        // Point color
        if (point.fixed) {
            eqCtx.fillStyle = "#FFC107";
            eqCtx.shadowColor = "rgba(255, 193, 7, 0.8)";
        } else {
            eqCtx.fillStyle = (point === draggedPoint) ? "#FF5722" : "#4CAF50";
            eqCtx.shadowColor = (point === draggedPoint) ? "rgba(255, 87, 34, 0.8)" : "rgba(76, 175, 80, 0.8)";
        }
        
        eqCtx.shadowBlur = 15;
        eqCtx.beginPath();
        eqCtx.arc(x, y, 9, 0, Math.PI * 2);
        eqCtx.fill();
        
        // Inner circle
        eqCtx.fillStyle = "#fff";
        eqCtx.shadowBlur = 0;
        eqCtx.beginPath();
        eqCtx.arc(x, y, 6, 0, Math.PI * 2);
        eqCtx.fill();
        
        // Frequency label
        eqCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
        eqCtx.fillRect(x - 25, y + 20, 50, 15);
        eqCtx.fillStyle = "#fff";
        eqCtx.font = "bold 10px Arial";
        eqCtx.textAlign = "center";
        
        let freqLabel;
        if (point.frequency < 1000) {
            freqLabel = `${Math.round(point.frequency)}Hz`;
        } else {
            const kHzValue = point.frequency / 1000;
            if (kHzValue === Math.round(kHzValue)) {
                freqLabel = `${Math.round(kHzValue)}k`;
            } else {
                freqLabel = `${kHzValue.toFixed(1)}k`;
            }
        }
        eqCtx.fillText(freqLabel, x, y + 30);
        
        // Gain label
        eqCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
        eqCtx.fillRect(x - 25, y - 35, 50, 15);
        eqCtx.fillStyle = "#fff";
        eqCtx.fillText(`${point.gain > 0 ? '+' : ''}${point.gain.toFixed(1)}dB`, x, y - 25);
    }
}

// Draw EQ waveform visualization
function drawEQWaveform() {
    const width = eqCanvas.width;
    const height = eqCanvas.height;
    const padding = 20;
    
    // Create gradient
    const gradient = eqCtx.createLinearGradient(0, height - padding, 0, padding);
    gradient.addColorStop(0, "rgba(28, 0, 212, 0.9)");
    gradient.addColorStop(0.1, "rgba(0, 191, 255, 0.95)");
    gradient.addColorStop(0.3, "rgba(0, 210, 154, 0.9)");
    gradient.addColorStop(0.5, "rgba(255, 196, 0, 0.85)");
    gradient.addColorStop(0.7, "rgba(255, 0, 0, 0.85)");
    gradient.addColorStop(0.9, "rgba(255, 0, 157, 0.85)");
    gradient.addColorStop(1, "rgba(170, 0, 255, 0.85)");
    
    const sliceWidth = (width - 2 * padding) / waveformHistorySize;
    
    for (let h = 0; h < waveformHistory.length; h++) {
        const dataArray = waveformHistory[h];
        const x = padding + (h * sliceWidth);
        const alpha = 0.4 + (h / waveformHistory.length) * 0.6;
        
        eqCtx.beginPath();
        eqCtx.moveTo(x, height - padding);
        
        const maxFreq = audioContext.sampleRate / 2;
        const minLogFreq = Math.log10(20);
        const maxLogFreq = Math.log10(maxFreq);
        
        for (let i = 0; i < dataArray.length; i++) {
            const freq = (i * maxFreq) / dataArray.length;
            const logFreq = Math.log10(Math.max(20, freq));
            const normalizedLogFreq = (logFreq - minLogFreq) / (maxLogFreq - minLogFreq);
            const freqX = padding + (normalizedLogFreq * (width - 2 * padding));
            
            if (freqX >= x && freqX <= x + sliceWidth) {
                const amplitude = dataArray[i] / 255;
                const enhancedAmplitude = Math.pow(amplitude, 0.4);
                const ampY = height - padding - (enhancedAmplitude * (height - 2 * padding));
                eqCtx.lineTo(freqX, ampY);
            }
        }
        
        eqCtx.lineTo(x + sliceWidth, height - padding);
        eqCtx.closePath();
        
        eqCtx.globalAlpha = alpha;
        eqCtx.fillStyle = gradient;
        eqCtx.fill();
        
        if (h > waveformHistory.length * 0.7) {
            eqCtx.shadowColor = "rgba(0, 255, 170, 0.8)";
            eqCtx.shadowBlur = 10;
            eqCtx.fill();
            eqCtx.shadowBlur = 0;
        }
    }
    
    eqCtx.globalAlpha = 1;
}

// Start dragging EQ band
function startDraggingEQBand(e) {
    if (!currentClipEffects || !currentClipEffects.eq) return;
    
    // Ensure EQ is array format
    if (!Array.isArray(currentClipEffects.eq)) {
        currentClipEffects.eq = [];
    }
    
    const rect = eqCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padding = 20;
    const height = eqCanvas.height;
    
    // Check if clicking on existing point
    for (let i = 0; i < currentClipEffects.eq.length; i++) {
        const point = currentClipEffects.eq[i];
        if (point.fixed) continue;
        
        const pointX = padding + (Math.log10(point.frequency / 20) / Math.log10(20000 / 20)) * (eqCanvas.width - 2 * padding);
        const pointY = height / 2 - (point.gain / 24) * (height / 2 - padding);
        const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
        
        if (distance <= 9) {
            isDraggingEqBand = true;
            draggedPoint = point;
            isCreatingNewPoint = false;
            return;
        }
    }
    
    // Create new point if under max
    if (currentClipEffects.eq.length < MAX_EQ_POINTS) {
        const frequency = 20 * Math.pow(20000 / 20, (x - padding) / (eqCanvas.width - 2 * padding));
        if (frequency <= 20 || frequency >= 20000) return;
        
        const gain = -(y - height / 2) / (height / 2 - padding) * 24;
        const newPoint = addEQPoint(frequency, gain);
        
        isDraggingEqBand = true;
        draggedPoint = newPoint;
        isCreatingNewPoint = true;
    }
}

// Drag EQ band
function dragEQBand(e) {
    if (!isDraggingEqBand || !draggedPoint || !currentClipEffects || !currentClipEffects.eq) return;
    
    const rect = eqCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padding = 20;
    const height = eqCanvas.height;
    
    // Calculate new gain
    const gain = -(y - height / 2) / (height / 2 - padding) * 24;
    const clampedGain = Math.max(-24, Math.min(24, gain));
    
    // Calculate new frequency
    const freq = 20 * Math.pow(20000 / 20, (x - padding) / (eqCanvas.width - 2 * padding));
    const clampedFreq = Math.max(20, Math.min(20000, freq));
    
    draggedPoint.gain = clampedGain;
    draggedPoint.frequency = clampedFreq;
    
    updatePreviewEffects();
    drawEQVisual();
}

// Stop dragging EQ band
function stopDraggingEQBand() {
    isDraggingEqBand = false;
    draggedPoint = null;
    isCreatingNewPoint = false;
}

// Handle touch start
function handleEQTouchStart(e) {
    e.preventDefault();
    if (!currentClipEffects || !currentClipEffects.eq) return;
    
    // Ensure EQ is array format
    if (!Array.isArray(currentClipEffects.eq)) {
        currentClipEffects.eq = [];
    }
    
    const touch = e.touches[0];
    const rect = eqCanvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const padding = 20;
    const height = eqCanvas.height;
    
    // Check if touching existing point
    for (let i = 0; i < currentClipEffects.eq.length; i++) {
        const point = currentClipEffects.eq[i];
        if (point.fixed) continue;
        
        const pointX = padding + (Math.log10(point.frequency / 20) / Math.log10(20000 / 20)) * (eqCanvas.width - 2 * padding);
        const pointY = height / 2 - (point.gain / 24) * (height / 2 - padding);
        const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
        
        if (distance <= 9) {
            isDraggingEqBand = true;
            draggedPoint = point;
            isCreatingNewPoint = false;
            return;
        }
    }
    
    // Create new point
    if (currentClipEffects.eq.length < MAX_EQ_POINTS) {
        const frequency = 20 * Math.pow(20000 / 20, (x - padding) / (eqCanvas.width - 2 * padding));
        if (frequency <= 20 || frequency >= 20000) return;
        
        const gain = -(y - height / 2) / (height / 2 - padding) * 24;
        const newPoint = addEQPoint(frequency, gain);
        
        isDraggingEqBand = true;
        draggedPoint = newPoint;
        isCreatingNewPoint = true;
    }
}

// Handle touch move
function handleEQTouchMove(e) {
    e.preventDefault();
    if (!isDraggingEqBand || !draggedPoint || !currentClipEffects || !currentClipEffects.eq) return;
    
    const touch = e.touches[0];
    const rect = eqCanvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const padding = 20;
    const height = eqCanvas.height;
    
    const gain = -(y - height / 2) / (height / 2 - padding) * 24;
    const clampedGain = Math.max(-24, Math.min(24, gain));
    
    const freq = 20 * Math.pow(20000 / 20, (x - padding) / (eqCanvas.width - 2 * padding));
    const clampedFreq = Math.max(20, Math.min(20000, freq));
    
    draggedPoint.gain = clampedGain;
    draggedPoint.frequency = clampedFreq;
    
    updatePreviewEffects();
    drawEQVisual();
}

// LFO system (canonical setup defined earlier) — duplicate definition removed to avoid conflicts

// Setup all LFO event listeners (call when popup opens)
function setupAllLFOEventListeners() {
    for (let i = 1; i <= 4; i++) {
        setupSingleLFOEventListeners(i);
    }
}

// Setup event listeners for a single LFO
function setupSingleLFOEventListeners(lfoNum) {
    const lfoIndex = lfoNum - 1;
    
    const target = document.getElementById(`arr-lfo-${lfoNum}-target`);
    const waveform = document.getElementById(`arr-lfo-${lfoNum}-waveform`);
    const rate = document.getElementById(`arr-lfo-${lfoNum}-rate`);
    const depth = document.getElementById(`arr-lfo-${lfoNum}-depth`);
    
    if (!target || !waveform || !rate || !depth) {
        return;
    }
    // Use idempotent listeners attached directly to controls.
    // This avoids cloning/replacing DOM nodes (which can break other references)
    // and prevents duplicate listeners when the popup is opened multiple times.
    function addOrReplace(el, eventName, key, handler) {
        if (!el) return;
        el._lfoHandlers = el._lfoHandlers || {};
        if (el._lfoHandlers[key]) {
            el.removeEventListener(eventName, el._lfoHandlers[key]);
        }
        el.addEventListener(eventName, handler);
        el._lfoHandlers[key] = handler;
    }

    addOrReplace(target, 'change', `lfo-${lfoNum}-target`, () => updateSingleLFOInRealTime(lfoNum));
    addOrReplace(waveform, 'change', `lfo-${lfoNum}-waveform`, () => updateSingleLFOInRealTime(lfoNum));
    addOrReplace(rate, 'input', `lfo-${lfoNum}-rate`, () => updateSingleLFOInRealTime(lfoNum));
    addOrReplace(depth, 'input', `lfo-${lfoNum}-depth`, () => updateSingleLFOInRealTime(lfoNum));
}

// Update a single LFO in real-time
function updateSingleLFOInRealTime(lfoNum) {
    if (!currentClipEffects) return;

    const lfoIndex = lfoNum - 1;
    
    const target = document.getElementById(`arr-lfo-${lfoNum}-target`).value;
    const waveform = document.getElementById(`arr-lfo-${lfoNum}-waveform`).value;
    const rate = parseFloat(document.getElementById(`arr-lfo-${lfoNum}-rate`).value);
    const depth = parseInt(document.getElementById(`arr-lfo-${lfoNum}-depth`).value);

    document.getElementById(`arr-lfo-${lfoNum}-rate-value`).textContent = rate.toFixed(1);
    document.getElementById(`arr-lfo-${lfoNum}-depth-value`).textContent = `${depth}%`;
    
    // Ensure lfos array exists
    if (!currentClipEffects.lfos) {
        currentClipEffects.lfos = [
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 },
            { enabled: false, target: 'none', waveform: 'sine', rate: 1, depth: 0 }
        ];
    }
    
    // Set enabled based on whether target is set and depth > 0
    const enabled = target !== 'none' && depth > 0;
    
    currentClipEffects.lfos[lfoIndex] = { 
        enabled, 
        target, 
        waveform, 
        rate, 
        depth 
    };

    // Update visualizer
    drawLFOWaveform(lfoNum);
    
    // Apply effects in real-time (restart LFO with new settings)
    applyEffectsRealTime();
    updatePreviewLFOs(); // Restart LFO oscillators with new settings
}

// Initialize all 4 LFO visualizers
function initAllLFOVisualizers() {
    // Initialize LFO 1 immediately since its panel is active/visible
    initSingleLFOVisualizer(1);
    
    // For LFOs 2-4, set reasonable default dimensions
    // They will be properly initialized when their tabs are clicked
    for (let i = 2; i <= 4; i++) {
        const lfoCanvas = document.getElementById(`arr-lfo-${i}-wave`);
        if (lfoCanvas) {
            // Set a reasonable default size
            lfoCanvas.width = 300;
            lfoCanvas.height = 60;
        }
    }

}

// Initialize a single LFO visualizer
function initSingleLFOVisualizer(lfoNum) {
    const lfoCanvas = document.getElementById(`arr-lfo-${lfoNum}-wave`);
    if (!lfoCanvas) {
        return;
    }
    
    const ctx = lfoCanvas.getContext("2d");
    const container = lfoCanvas.parentElement;
    lfoCanvas.width = container.clientWidth;
    lfoCanvas.height = container.clientHeight;

    drawLFOWaveform(lfoNum);
}

// Draw LFO waveform for a specific LFO (throttled for performance)
function drawLFOWaveform(lfoNum) {
    throttleCanvasRender(`lfo-${lfoNum}`, () => {
        const lfoCanvas = document.getElementById(`arr-lfo-${lfoNum}-wave`);
        if (!lfoCanvas) return;
        
        const ctx = lfoCanvas.getContext("2d");
        const width = lfoCanvas.width;
        const height = lfoCanvas.height;
        
        // Clear canvas
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, height);
        
        // Get current LFO settings
        const waveformSelect = document.getElementById(`arr-lfo-${lfoNum}-waveform`);
        const rateInput = document.getElementById(`arr-lfo-${lfoNum}-rate`);
        const depthInput = document.getElementById(`arr-lfo-${lfoNum}-depth`);
        
        if (!waveformSelect || !rateInput || !depthInput) return;
        
        const waveform = waveformSelect.value;
        const rate = parseFloat(rateInput.value);
        const depth = parseInt(depthInput.value);
    
    // Draw grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Different color for each LFO
    const lfoColors = {
        1: "#3F51B5",  // Indigo
        2: "#E91E63",  // Pink
        3: "#00BCD4",  // Cyan
        4: "#FF9800"   // Orange
    };
    
    // Draw waveform with LFO-specific color
    ctx.strokeStyle = lfoColors[lfoNum] || "#3F51B5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const samples = width;
    const period = samples / (rate * 10);
    const amplitude = (height / 2) * (depth / 100);
    
    for (let x = 0; x < samples; x++) {
        let y;
        const phase = (x % period) / period * Math.PI * 2;
        
        switch (waveform) {
            case "sine":
                y = height / 2 - Math.sin(phase) * amplitude;
                break;
            case "square":
                y = height / 2 - (Math.sin(phase) > 0 ? 1 : -1) * amplitude;
                break;
            case "triangle":
                const t = (phase / Math.PI) % 2;
                y = height / 2 - (t < 1 ? 2 * t - 1 : 3 - 2 * t) * amplitude;
                break;
            case "sawtooth":
                y = height / 2 - (2 * ((phase / Math.PI) % 1) - 1) * amplitude;
                break;
            default:
                y = height / 2;
        }
        
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    }); // Close throttleCanvasRender callback
}

// ========================================
// AUTOMATION SYSTEM (4 Independent Automations)
// Copied from PsychologicalStudio
// ========================================

// Note: setupAutomationTabs implemented earlier in file (idempotent)

// Setup all automation event listeners (call when popup opens)
function setupAllAutomationEventListeners() {
    for (let i = 1; i <= 4; i++) {
        setupSingleAutomationEventListeners(i);
    }
}

// Setup event listeners for a single automation
function setupSingleAutomationEventListeners(autoNum) {
    const autoIndex = autoNum - 1;
    
    const target = document.getElementById(`arr-automation-${autoNum}-target`);
    const start = document.getElementById(`arr-automation-${autoNum}-start`);
    const end = document.getElementById(`arr-automation-${autoNum}-end`);
    const duration = document.getElementById(`arr-automation-${autoNum}-duration`);
    const curve = document.getElementById(`arr-automation-${autoNum}-curve`);
    
    if (!target || !start || !end || !duration || !curve) {
        return;
    }
    
    // Load existing values safely (currentClipEffects may be null during init)
    const defaultAuto = { target: "none", start: 50, end: 50, duration: 1, curve: "linear" };
    const auto = (currentClipEffects && Array.isArray(currentClipEffects.automations) && currentClipEffects.automations[autoIndex]) ? currentClipEffects.automations[autoIndex] : defaultAuto;
    target.value = auto.target || "none";
    start.value = (auto.start !== undefined) ? auto.start : 50;
    end.value = (auto.end !== undefined) ? auto.end : 50;
    duration.value = (auto.duration !== undefined) ? auto.duration : 1;
    curve.value = auto.curve || "linear";
    
    document.getElementById(`arr-automation-${autoNum}-start-value`).textContent = start.value;
    document.getElementById(`arr-automation-${autoNum}-end-value`).textContent = end.value;
    document.getElementById(`arr-automation-${autoNum}-duration-value`).textContent = duration.value;

    // Helper to ensure automations array exists on currentClipEffects
    function ensureAutomationsArray() {
        if (!currentClipEffects) currentClipEffects = getDefaultEffects();
        if (!Array.isArray(currentClipEffects.automations)) currentClipEffects.automations = JSON.parse(JSON.stringify(getDefaultEffects().automations));
        if (!currentClipEffects.automations[autoIndex]) currentClipEffects.automations[autoIndex] = JSON.parse(JSON.stringify(defaultAuto));
    }

    // Target change
    target.addEventListener('change', function() {
        ensureAutomationsArray();
        currentClipEffects.automations[autoIndex].target = this.value;
        // Auto-enable when target is set
        currentClipEffects.automations[autoIndex].enabled = this.value !== 'none';

        drawAutomationCurve(autoNum);
        applyEffectsRealTime();
        // Only update preview automations for sample clips, not pattern clips
        if (currentClipForContext && currentClipForContext.type === 'sample') {
            updatePreviewAutomations();
        }
    });

    // Start value change
    start.addEventListener('input', function() {
        ensureAutomationsArray();
        currentClipEffects.automations[autoIndex].start = parseInt(this.value);
        document.getElementById(`arr-automation-${autoNum}-start-value`).textContent = this.value;
        drawAutomationCurve(autoNum);
        applyEffectsRealTime();
        if (currentClipForContext && currentClipForContext.type === 'sample') {
            updatePreviewAutomations();
        }
    });

    // End value change
    end.addEventListener('input', function() {
        ensureAutomationsArray();
        currentClipEffects.automations[autoIndex].end = parseInt(this.value);
        document.getElementById(`arr-automation-${autoNum}-end-value`).textContent = this.value;
        drawAutomationCurve(autoNum);
        applyEffectsRealTime();
        if (currentClipForContext && currentClipForContext.type === 'sample') {
            updatePreviewAutomations();
        }
    });

    // Duration change
    duration.addEventListener('input', function() {
        ensureAutomationsArray();
        currentClipEffects.automations[autoIndex].duration = parseInt(this.value);
        document.getElementById(`arr-automation-${autoNum}-duration-value`).textContent = this.value;
        drawAutomationCurve(autoNum);
        applyEffectsRealTime();
        if (currentClipForContext && currentClipForContext.type === 'sample') {
            updatePreviewAutomations();
        }
    });

    // Curve change
    curve.addEventListener('change', function() {
        ensureAutomationsArray();
        currentClipEffects.automations[autoIndex].curve = this.value;

        drawAutomationCurve(autoNum);
        applyEffectsRealTime();
        if (currentClipForContext && currentClipForContext.type === 'sample') {
            updatePreviewAutomations();
        }
    });
}

// Initialize all automation visualizers
function initAllAutomationVisualizers() {
    // Initialize Automation 1 immediately since its panel is active/visible
    initSingleAutomationVisualizer(1);
    
    // For Automations 2-4, set reasonable default dimensions
    for (let i = 2; i <= 4; i++) {
        const autoCanvas = document.getElementById(`arr-automation-${i}-canvas`);
        if (autoCanvas) {
            autoCanvas.width = 300;
            autoCanvas.height = 80;
        }
    }

}

// Initialize a single automation visualizer
function initSingleAutomationVisualizer(autoNum) {
    const canvas = document.getElementById(`arr-automation-${autoNum}-canvas`);
    if (!canvas) {
        return;
    }
    
    const ctx = canvas.getContext("2d");
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    drawAutomationCurve(autoNum);
}

// Draw automation curve for a specific automation (throttled for performance)
function drawAutomationCurve(autoNum) {
    throttleCanvasRender(`automation-${autoNum}`, () => {
        const canvas = document.getElementById(`arr-automation-${autoNum}-canvas`);
        if (!canvas) return;
        
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, height);
        
        // Get current automation settings
        const autoIndex = autoNum - 1;
        const auto = currentClipEffects.automations[autoIndex] || { target: "none", start: 50, end: 50, duration: 1, curve: "linear" };
    
    // Draw grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Vertical lines (quarters)
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(width * i / 4, 0);
        ctx.lineTo(width * i / 4, height);
        ctx.stroke();
    }
    
    // Different color for each automation
    const autoColors = {
        1: "#3F51B5",  // Indigo
        2: "#E91E63",  // Pink
        3: "#00BCD4",  // Cyan
        4: "#FF9800"   // Orange
    };
    
    // Draw automation curve
    ctx.strokeStyle = autoColors[autoNum] || "#3F51B5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const startY = height - (auto.start / 100 * height);
    const endY = height - (auto.end / 100 * height);
    
    ctx.moveTo(0, startY);
    
    // Draw curve based on type
    switch (auto.curve) {
        case "linear":
            ctx.lineTo(width, endY);
            break;
        case "exponential":
        case "easeIn":
            for (let x = 0; x <= width; x++) {
                const t = x / width;
                const eased = t * t;
                const y = startY + (endY - startY) * eased;
                ctx.lineTo(x, y);
            }
            break;
        case "logarithmic":
        case "easeOut":
            for (let x = 0; x <= width; x++) {
                const t = x / width;
                const eased = 1 - (1 - t) * (1 - t);
                const y = startY + (endY - startY) * eased;
                ctx.lineTo(x, y);
            }
            break;
        case "easeInOut":
            for (let x = 0; x <= width; x++) {
                const t = x / width;
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const y = startY + (endY - startY) * eased;
                ctx.lineTo(x, y);
            }
            break;
    }
    
    ctx.stroke();
    
    // Draw start and end points
    ctx.fillStyle = autoColors[autoNum] || "#3F51B5";
    ctx.beginPath();
    ctx.arc(0, startY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width, endY, 4, 0, Math.PI * 2);
    ctx.fill();
    }); // Close throttleCanvasRender callback
}

// Make automation canvases interactive
function setupInteractiveAutomation() {
    for (let autoNum = 1; autoNum <= 4; autoNum++) {
        const canvas = document.getElementById(`arr-automation-${autoNum}-canvas`);
        if (!canvas) continue;
        
        const autoIndex = autoNum - 1;
        let isDragging = false;
        let dragType = null; // 'start' or 'end'
        
        // Mouse down - start dragging
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const auto = currentClipEffects.automations[autoIndex];
            if (!auto || auto.target === 'none') return;
            
            // Check if clicking near start point (left edge)
            const startY = canvas.height - (auto.start / 100 * canvas.height);
            if (Math.abs(x - 0) < 20 && Math.abs(y - startY) < 15) {
                isDragging = true;
                dragType = 'start';
                canvas.style.cursor = 'grabbing';
                return;
            }
            
            // Check if clicking near end point (right edge)
            const endY = canvas.height - (auto.end / 100 * canvas.height);
            if (Math.abs(x - canvas.width) < 20 && Math.abs(y - endY) < 15) {
                isDragging = true;
                dragType = 'end';
                canvas.style.cursor = 'grabbing';
                return;
            }
            
            // If clicking anywhere else on the curve, update both start and end proportionally
            const normalizedY = 100 - (y / canvas.height * 100);
            const normalizedX = x / canvas.width;
            
            // Interpolate the value based on x position
            if (normalizedX < 0.5) {
                // Closer to start, update start value
                isDragging = true;
                dragType = 'start';
                auto.start = Math.max(0, Math.min(100, normalizedY));
                document.getElementById(`arr-automation-${autoNum}-start`).value = auto.start;
                document.getElementById(`arr-automation-${autoNum}-start-value`).textContent = Math.round(auto.start);
            } else {
                // Closer to end, update end value
                isDragging = true;
                dragType = 'end';
                auto.end = Math.max(0, Math.min(100, normalizedY));
                document.getElementById(`arr-automation-${autoNum}-end`).value = auto.end;
                document.getElementById(`arr-automation-${autoNum}-end-value`).textContent = Math.round(auto.end);
            }
            
            drawAutomationCurve(autoNum);
            applyEffectsRealTime();
        });
        
        // Mouse move - drag point
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const auto = currentClipEffects.automations[autoIndex];
            if (!auto || auto.target === 'none') return;
            
            // Update cursor when hovering over points
            if (!isDragging) {
                const startY = canvas.height - (auto.start / 100 * canvas.height);
                const endY = canvas.height - (auto.end / 100 * canvas.height);
                
                if ((Math.abs(x - 0) < 20 && Math.abs(y - startY) < 15) ||
                    (Math.abs(x - canvas.width) < 20 && Math.abs(y - endY) < 15)) {
                    canvas.style.cursor = 'grab';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            }
            
            // If dragging, update the value
            if (isDragging) {
                const normalizedY = 100 - (y / canvas.height * 100);
                const clampedValue = Math.max(0, Math.min(100, normalizedY));
                
                if (dragType === 'start') {
                    auto.start = clampedValue;
                    document.getElementById(`arr-automation-${autoNum}-start`).value = clampedValue;
                    document.getElementById(`arr-automation-${autoNum}-start-value`).textContent = Math.round(clampedValue);
                } else if (dragType === 'end') {
                    auto.end = clampedValue;
                    document.getElementById(`arr-automation-${autoNum}-end`).value = clampedValue;
                    document.getElementById(`arr-automation-${autoNum}-end-value`).textContent = Math.round(clampedValue);
                }
                
                drawAutomationCurve(autoNum);
                applyEffectsRealTime();
            }
        });
        
        // Mouse up - stop dragging
        canvas.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                dragType = null;
                canvas.style.cursor = 'crosshair';
            }
        });
        
        // Mouse leave - stop dragging
        canvas.addEventListener('mouseleave', () => {
            if (isDragging) {
                isDragging = false;
                dragType = null;
                canvas.style.cursor = 'default';
            }
        });
        
        // Set initial cursor
        canvas.style.cursor = 'crosshair';
    }

}

// ========================================
// LEGACY AUTOMATION SYSTEM (OLD)
// Keeping for backward compatibility
// ========================================

// Legacy variables (not used by new 4-automation system)
let automationCanvases = {};
let automationContexts = {};
let automationDragState = {};

// Initialize automation canvas for effects popup (LEGACY - NOT USED)
function initAutomationCanvas() {
    const canvas = document.getElementById('arr-automation-canvas');
    if (!canvas) {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    automationCanvases['main'] = canvas;
    automationContexts['main'] = ctx;
    
    setupAutomationInteraction(canvas);
    drawLegacyAutomationCurve(); // Use the renamed legacy function

}

// Setup mouse/touch interaction for automation canvas
function setupAutomationInteraction(canvas) {
    let isDragging = false;
    let draggedPointIndex = null;
    
    canvas.addEventListener('mousedown', function(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (!currentClipEffects || !currentClipEffects.automation) {
            currentClipEffects.automation = {
                enabled: false,
                target: 'volume',
                points: [
                    { time: 0, value: 50 },
                    { time: 1, value: 50 }
                ]
            };
        }
        
        const auto = currentClipEffects.automation;
        
        // Initialize points if they don't exist
        if (!auto.points || auto.points.length < 2) {
            auto.points = [
                { time: 0, value: 50 },
                { time: 1, value: 50 }
            ];
        }
        
        // Check if clicking near an existing point
        let clickedPoint = -1;
        for (let i = 0; i < auto.points.length; i++) {
            const point = auto.points[i];
            const pointX = point.time * canvas.width;
            const pointY = canvas.height - (point.value / 100 * canvas.height);
            
            if (Math.abs(x - pointX) < 10 && Math.abs(y - pointY) < 10) {
                clickedPoint = i;
                break;
            }
        }
        
        if (clickedPoint !== -1) {
            // Right click or Ctrl+click to delete point (except first and last)
            if (e.button === 2 || e.ctrlKey) {
                if (clickedPoint !== 0 && clickedPoint !== auto.points.length - 1) {
                    auto.points.splice(clickedPoint, 1);
                    drawLegacyAutomationCurve(); // LEGACY
                }
                e.preventDefault();
                return;
            }
            
            // Start dragging existing point
            isDragging = true;
            draggedPointIndex = clickedPoint;
        } else {
            // Add new point at clicked position
            const time = x / canvas.width;
            const value = ((canvas.height - y) / canvas.height) * 100;
            
            // Find where to insert the new point to keep time order
            let insertIndex = auto.points.findIndex(p => p.time > time);
            if (insertIndex === -1) insertIndex = auto.points.length;
            
            auto.points.splice(insertIndex, 0, { time: time, value: value });
            
            // Start dragging the new point
            isDragging = true;
            draggedPointIndex = insertIndex;
            
            drawLegacyAutomationCurve(); // LEGACY
        }
    });
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
    
    canvas.addEventListener('mousemove', function(e) {
        if (!isDragging || draggedPointIndex === null) {
            // Change cursor on hover
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (!currentClipEffects || !currentClipEffects.automation || !currentClipEffects.automation.points) {
                canvas.style.cursor = 'crosshair';
                return;
            }
            
            const auto = currentClipEffects.automation;
            let nearPoint = false;
            for (let i = 0; i < auto.points.length; i++) {
                const point = auto.points[i];
                const pointX = point.time * canvas.width;
                const pointY = canvas.height - (point.value / 100 * canvas.height);
                
                if (Math.abs(x - pointX) < 10 && Math.abs(y - pointY) < 10) {
                    nearPoint = true;
                    break;
                }
            }
            
            canvas.style.cursor = nearPoint ? 'pointer' : 'crosshair';
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const auto = currentClipEffects.automation;
        
        // Calculate new value
        let value = ((canvas.height - y) / canvas.height) * 100;
        value = Math.max(0, Math.min(100, value));
        
        // Calculate new time position
        let time = x / canvas.width;
        time = Math.max(0, Math.min(1, time));
        
        // Don't allow moving first or last point horizontally
        if (draggedPointIndex === 0) {
            time = 0;
        } else if (draggedPointIndex === auto.points.length - 1) {
            time = 1;
        } else {
            // Constrain time to be between neighbors
            const prevTime = auto.points[draggedPointIndex - 1].time;
            const nextTime = auto.points[draggedPointIndex + 1].time;
            time = Math.max(prevTime + 0.01, Math.min(nextTime - 0.01, time));
        }
        
        // Update point
        auto.points[draggedPointIndex].time = time;
        auto.points[draggedPointIndex].value = value;
        
        // Redraw
        drawLegacyAutomationCurve(); // LEGACY
    });
    
    canvas.addEventListener('mouseup', function() {
        isDragging = false;
        draggedPointIndex = null;
    });
    
    canvas.addEventListener('mouseleave', function() {
        isDragging = false;
        draggedPointIndex = null;
    });
    
    // Touch support
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    });
}

// Draw automation curve on canvas (LEGACY - single automation)
function drawLegacyAutomationCurve() {
    // This is the old single automation curve drawer - NOT USED ANYMORE
    // Keeping for reference only
    return;
    
    const canvas = automationCanvases['main'];
    const ctx = automationContexts['main'];
    
    if (!canvas || !ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    
    // Horizontal lines (25%, 50%, 75%)
    for (let i = 1; i <= 3; i++) {
        const y = height * (i / 4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Vertical lines (beat markers - 4 beats)
    for (let i = 1; i <= 3; i++) {
        const x = width * (i / 4);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Draw 50% line (center reference)
    ctx.strokeStyle = '#333';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    if (!currentClipEffects || !currentClipEffects.automation || !currentClipEffects.automation.points) return;
    
    const auto = currentClipEffects.automation;
    const sortedPoints = [...auto.points].sort((a, b) => a.time - b.time);
    
    // Draw automation curve - Purple color
    ctx.strokeStyle = '#9C27B0';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(156, 39, 176, 0.8)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    
    for (let i = 0; i < sortedPoints.length; i++) {
        const point = sortedPoints[i];
        const x = point.time * width;
        const y = height - (point.value / 100 * height);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw points as circles
    ctx.fillStyle = '#9C27B0';
    for (let i = 0; i < sortedPoints.length; i++) {
        const point = sortedPoints[i];
        const x = point.time * width;
        const y = height - (point.value / 100 * height);
        
        ctx.shadowColor = 'rgba(156, 39, 176, 0.8)';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        
        // White inner circle
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9C27B0';
    }
    
    // Draw labels for start and end
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.shadowBlur = 0;
    
    if (sortedPoints.length > 0) {
        const startPoint = sortedPoints[0];
        const startX = startPoint.time * width;
        const startY = height - (startPoint.value / 100 * height);
        ctx.fillText('Start', startX + 10, startY - 10);
        
        const endPoint = sortedPoints[sortedPoints.length - 1];
        const endX = endPoint.time * width;
        const endY = height - (endPoint.value / 100 * height);
        ctx.fillText('End', endX - 40, endY - 10);
    }
    
    // Draw target label
    const targetName = auto.target || 'volume';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '11px Arial';
    ctx.fillText(`Target: ${targetName.toUpperCase()}`, 10, height - 5);
}

// Apply automation to preview playback
function applyAutomationToPreview() {
    if (!currentClipEffects || !currentClipEffects.automation || !previewSource) return;
    
    const auto = currentClipEffects.automation;
    if (!auto.enabled || !auto.points || auto.points.length < 2) return;
    
    const target = auto.target || 'volume';
    const sortedPoints = [...auto.points].sort((a, b) => a.time - b.time);
    const duration = previewSource.buffer.duration;
    const now = audioContext.currentTime;
    
    // Cancel any previous automation
    if (target === 'volume' && previewGainNode) {
        previewGainNode.gain.cancelScheduledValues(now);
        previewGainNode.gain.setValueAtTime(previewGainNode.gain.value, now);
    } else if (target === 'filter' && previewFilterNode) {
        previewFilterNode.frequency.cancelScheduledValues(now);
        previewFilterNode.frequency.setValueAtTime(previewFilterNode.frequency.value, now);
    } else if (target === 'pitch' && previewSource.playbackRate) {
        previewSource.playbackRate.cancelScheduledValues(now);
        previewSource.playbackRate.setValueAtTime(previewSource.playbackRate.value, now);
    }
    
    // Schedule automation points
    for (let i = 0; i < sortedPoints.length; i++) {
        const point = sortedPoints[i];
        const timeInSeconds = point.time * duration;
        const value = point.value / 100; // Normalize to 0-1
        
        if (target === 'volume' && previewGainNode) {
            const gainValue = value * 2; // 0-2 range for volume
            if (i === 0) {
                previewGainNode.gain.setValueAtTime(gainValue, now + timeInSeconds);
            } else {
                previewGainNode.gain.linearRampToValueAtTime(gainValue, now + timeInSeconds);
            }
        } else if (target === 'filter' && previewFilterNode) {
            const freqValue = 20 + (value * 19980); // 20Hz - 20kHz range
            if (i === 0) {
                previewFilterNode.frequency.setValueAtTime(freqValue, now + timeInSeconds);
            } else {
                previewFilterNode.frequency.exponentialRampToValueAtTime(freqValue, now + timeInSeconds);
            }
        } else if (target === 'pitch' && previewSource.playbackRate) {
            const pitchValue = 0.5 + (value * 1.5); // 0.5x - 2x range
            if (i === 0) {
                previewSource.playbackRate.setValueAtTime(pitchValue, now + timeInSeconds);
            } else {
                previewSource.playbackRate.exponentialRampToValueAtTime(pitchValue, now + timeInSeconds);
            }
        }
    }
}

// ========================================
// LFO SYSTEM
// ========================================

// Initialize LFO for preview playback
function initLfoForPreview() {
    if (!currentClipEffects || !currentClipEffects.lfo) return;
    
    const lfo = currentClipEffects.lfo;
    if (!lfo.enabled || lfo.depth === 0) {
        cleanupLfo();
        return;
    }
    
    // Create LFO oscillator
    if (!previewLfoNode) {
        previewLfoNode = audioContext.createOscillator();
        previewLfoGainNode = audioContext.createGain();
        
        previewLfoNode.connect(previewLfoGainNode);
        previewLfoNode.start();
    }
    
    // Update LFO parameters
    previewLfoNode.type = lfo.waveform || 'sine';
    previewLfoNode.frequency.value = lfo.rate || 1;
    previewLfoGainNode.gain.value = lfo.depth / 100;
    
    // Connect to target
    const target = lfo.target || 'filter';
    
    // Disconnect previous connections
    try {
        previewLfoGainNode.disconnect();
    } catch (e) {}
    
    if (target === 'filter' && previewFilterNode) {
        // Modulate filter cutoff frequency
        const baseFreq = previewFilterNode.frequency.value || 1000;
        const modulationRange = baseFreq * 0.5; // ±50% modulation
        
        previewLfoGainNode.gain.value = modulationRange * (lfo.depth / 100);
        previewLfoGainNode.connect(previewFilterNode.frequency);
        
    } else if (target === 'volume' && previewGainNode) {
        // Modulate volume (tremolo effect)
        const modulationRange = 0.5; // ±50% volume modulation
        
        previewLfoGainNode.gain.value = modulationRange * (lfo.depth / 100);
        previewLfoGainNode.connect(previewGainNode.gain);
        
    } else if (target === 'pitch' && previewSource && previewSource.detune) {
        // Modulate pitch using detune
        updatePitchLfo();
    }

}

// Update pitch LFO (manual implementation for detune)
function updatePitchLfo() {
    if (!currentClipEffects || !currentClipEffects.lfo || !previewSource) return;
    
    const lfo = currentClipEffects.lfo;
    if (!lfo.enabled || lfo.depth === 0 || lfo.target !== 'pitch') {
        if (previewLfoUpdateTimeout) {
            clearTimeout(previewLfoUpdateTimeout);
            previewLfoUpdateTimeout = null;
        }
        return;
    }
    
    const time = audioContext.currentTime;
    const lfoRate = lfo.rate || 1;
    const lfoDepth = lfo.depth / 100;
    const waveform = lfo.waveform || 'sine';
    
    const lfoDuration = 1 / lfoRate;
    const phase = (time % lfoDuration) / lfoDuration * Math.PI * 2;
    
    let modulationValue = 0;
    switch (waveform) {
        case 'sine':
            modulationValue = Math.sin(phase);
            break;
        case 'square':
            modulationValue = Math.sin(phase) > 0 ? 1 : -1;
            break;
        case 'triangle':
            const t = (phase / Math.PI) % 2;
            modulationValue = t < 1 ? 2 * t - 1 : 3 - 2 * t;
            break;
        case 'sawtooth':
            modulationValue = 2 * ((phase / Math.PI) % 1) - 1;
            break;
    }
    
    // Calculate detune value in cents (max ±1200 cents = 1 octave)
    const maxDetune = 1200;
    const detuneValue = maxDetune * lfoDepth * modulationValue;
    
    // Apply detune
    if (previewSource.detune) {
        previewSource.detune.setValueAtTime(detuneValue, time);
    }
    
    // Schedule next update
    previewLfoUpdateTimeout = setTimeout(updatePitchLfo, 50); // Update every 50ms
}

// Cleanup LFO on preview stop
function cleanupLfo() {
    if (previewLfoNode) {
        try {
            previewLfoNode.stop();
            previewLfoNode.disconnect();
        } catch (e) {}
        previewLfoNode = null;
    }
    
    if (previewLfoGainNode) {
        try {
            previewLfoGainNode.disconnect();
        } catch (e) {}
        previewLfoGainNode = null;
    }
    
    if (previewLfoUpdateTimeout) {
        clearTimeout(previewLfoUpdateTimeout);
        previewLfoUpdateTimeout = null;
    }
}

// ========================================
// THEME SYSTEM - Sync with PsychologicalStudio
// ========================================

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 123, 255';
}

const arrangeThemes = {
    default: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#4a4a4a',
        buttonHover: '#5a5a5a',
        accent: '#007bff',
        text: '#f0f0f0',
        border: '#333',
        trackBg: '#151515',     // Very dark for tracks
        clipBg: '#3a3a5e',
        gridLine: '#222',       // Dark grid lines
        timelineBg: '#1a1a1a',  // Dark grey timeline
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',    // Dark grey beat lines
        stepLine: '#1a1a1a'     // Darker step lines
    },
    dark: {
        background: '#000000',  // Pure black
        controlsBg: '#0f0f0f',
        buttonBg: '#2a2a2a',
        buttonHover: '#3a3a3a',
        accent: '#666666',
        text: '#cccccc',
        border: '#222',
        trackBg: '#0a0a0a',
        clipBg: '#2a2a2a',
        gridLine: '#1a1a1a',
        timelineBg: '#0f0f0f',
        barLine: '#333',
        beatLine: '#222222',
        stepLine: '#111111'
    },
    blue: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#2c3e50',
        buttonHover: '#34495e',
        accent: '#3498db',
        text: '#ecf0f1',
        border: '#34495e',
        trackBg: '#0f0f0f',
        clipBg: '#2c4e70',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    green: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#2c5f2c',
        buttonHover: '#3d7a3d',
        accent: '#27ae60',
        text: '#d5f4e6',
        border: '#2c5f2c',
        trackBg: '#0f0f0f',
        clipBg: '#2c6f2c',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    purple: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#5f2c5f',
        buttonHover: '#7a3d7a',
        accent: '#9b59b6',
        text: '#f4d5f4',
        border: '#5f2c5f',
        trackBg: '#0f0f0f',
        clipBg: '#5f2c7f',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    red: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#5f2c2c',
        buttonHover: '#7a3d3d',
        accent: '#e74c3c',
        text: '#f4d5d5',
        border: '#5f2c2c',
        trackBg: '#0f0f0f',
        clipBg: '#7f2c2c',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    orange: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#5f4a2c',
        buttonHover: '#7a623d',
        accent: '#e67e22',
        text: '#f4e6d5',
        border: '#5f4a2c',
        trackBg: '#0f0f0f',
        clipBg: '#7f6a2c',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    pink: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#5f2c4a',
        buttonHover: '#7a3d63',
        accent: '#e91e63',
        text: '#f4d5e1',
        border: '#5f2c4a',
        trackBg: '#0f0f0f',
        clipBg: '#7f2c6a',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    },
    cyan: {
        background: '#0a0a0a',  // Dark black for main interface
        controlsBg: '#1a1a1a',  // Dark grey for controls
        buttonBg: '#2c5f5f',
        buttonHover: '#3d7a7a',
        accent: '#00bcd4',
        text: '#d5f4f4',
        border: '#2c5f5f',
        trackBg: '#0f0f0f',
        clipBg: '#2c7f7f',
        gridLine: '#1a1a1a',
        timelineBg: '#1a1a1a',
        barLine: '#444',        // Dark grey bar lines
        beatLine: '#2a2a2a',
        stepLine: '#1a1a1a'
    }
};

// Get current theme object
function getCurrentTheme() {
    const themeName = document.body.dataset.currentTheme || 'default';
    return arrangeThemes[themeName] || arrangeThemes.default;
}

function applyArrangementTheme(themeName) {
    const theme = arrangeThemes[themeName];
    if (!theme) {
        return;
    }

    // Apply to body and main container
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
    
    // Apply CSS variables
    document.documentElement.style.setProperty('--button-hover-bg', theme.buttonHover);
    document.documentElement.style.setProperty('--accent-color', theme.accent);
    document.documentElement.style.setProperty('--text-color', theme.text);
    document.documentElement.style.setProperty('--border-color', theme.border);
    document.documentElement.style.setProperty('--track-bg', theme.trackBg);
    document.documentElement.style.setProperty('--clip-bg', theme.clipBg);
    document.documentElement.style.setProperty('--grid-line', theme.gridLine);
    document.documentElement.style.setProperty('--header-gradient-start', theme.controlsBg);
    document.documentElement.style.setProperty('--header-gradient-end', theme.background);
    
    // Apply to header
    const header = document.querySelector('.arrangement-header');
    if (header) {
        header.style.background = `linear-gradient(135deg, ${theme.controlsBg} 0%, ${theme.background} 100%)`;
        header.style.borderColor = theme.accent;
        header.style.color = theme.text;
    }
    
    // Apply to all buttons
    const buttons = document.querySelectorAll('.arr-btn, .arr-play-btn, .arr-stop-btn, .arr-loop-btn, .arr-back-btn, .arr-save-btn, button');
    buttons.forEach(btn => {
        // Skip if it's a specific color button (play, stop, etc)
        if (!btn.classList.contains('arr-play-btn') && 
            !btn.classList.contains('arr-stop-btn') && 
            !btn.classList.contains('arr-back-btn') &&
            !btn.classList.contains('arr-save-btn')) {
            btn.style.backgroundColor = theme.buttonBg;
            btn.style.color = theme.text;
            btn.style.borderColor = theme.border;
        }
    });
    
    // Apply to sidebar
    const sidebar = document.querySelector('.arr-sidebar');
    if (sidebar) {
        sidebar.style.backgroundColor = theme.controlsBg;
        sidebar.style.borderColor = theme.border;
    }
    
    // Apply to all sections in sidebar
    const sidebarSections = document.querySelectorAll('.arr-sidebar-section');
    sidebarSections.forEach(section => {
        section.style.backgroundColor = theme.controlsBg;
        section.style.borderColor = theme.border;
    });
    
    // Apply to dropdowns
    const selects = document.querySelectorAll('.arr-sample-select, .arr-pattern-select, select');
    selects.forEach(select => {
        select.style.backgroundColor = theme.buttonBg;
        select.style.color = theme.text;
        select.style.borderColor = theme.border;
    });
    
    // Apply to timeline
    const timeline = document.querySelector('.arr-timeline');
    if (timeline) {
        timeline.style.backgroundColor = theme.controlsBg;
        timeline.style.borderColor = theme.border;
        timeline.style.color = theme.text;
    }
    
    // Apply to track list
    const trackList = document.querySelector('.arr-track-list');
    if (trackList) {
        trackList.style.backgroundColor = theme.controlsBg;
        trackList.style.borderColor = theme.border;
    }
    
    // Apply to all track headers
    const trackHeaders = document.querySelectorAll('.arr-track');
    trackHeaders.forEach(track => {
        track.style.backgroundColor = theme.trackBg;
        track.style.borderColor = theme.border;
        track.style.color = theme.text;
    });
    
    // Apply to arrangement view container
    const arrView = document.querySelector('.arr-view');
    if (arrView) {
        arrView.style.backgroundColor = theme.background;
    }
    
    // Apply to canvas container
    const canvasContainer = document.querySelector('.arr-canvas-container');
    if (canvasContainer) {
        canvasContainer.style.backgroundColor = theme.background;
    }
    
    // Apply to effects popup
    const popup = document.getElementById('arr-effects-popup');
    if (popup) {
        popup.style.backgroundColor = theme.controlsBg;
        popup.style.borderColor = theme.accent;
        popup.style.color = theme.text;
    }
    
    // Apply to popup header
    const popupHeader = document.querySelector('.arr-popup-header');
    if (popupHeader) {
        popupHeader.style.backgroundColor = theme.buttonBg;
        popupHeader.style.borderColor = theme.border;
        popupHeader.style.color = theme.text;
    }
    
    // Apply to all popup sections
    const sections = document.querySelectorAll('.arr-effects-section, .effects-section');
    sections.forEach(section => {
        section.style.borderColor = theme.border;
        section.style.backgroundColor = theme.controlsBg;
    });
    
    // Apply to all labels
    const labels = document.querySelectorAll('label, .arr-label');
    labels.forEach(label => {
        label.style.color = theme.text;
    });
    
    // Apply to all inputs
    const inputs = document.querySelectorAll('input[type="range"], input[type="number"], input[type="text"]');
    inputs.forEach(input => {
        if (input.type === 'range') {
            input.style.setProperty('--thumb-color', theme.accent);
            input.style.setProperty('--track-color', theme.border);
        } else {
            input.style.backgroundColor = theme.buttonBg;
            input.style.color = theme.text;
            input.style.borderColor = theme.border;
        }
    });
    
    // Apply to tempo slider container
    const tempoContainer = document.querySelector('.arr-tempo');
    if (tempoContainer) {
        tempoContainer.style.color = theme.text;
    }
    
    // Apply to bar counter
    const barCounter = document.querySelector('.arr-bar-counter');
    if (barCounter) {
        barCounter.style.color = theme.text;
        barCounter.style.borderColor = theme.border;
        barCounter.style.backgroundColor = theme.buttonBg;
    }
    
    // Apply to tabs (LFO, Automation, etc)
    const tabs = document.querySelectorAll('.lfo-tab, .automation-tab');
    tabs.forEach(tab => {
        if (!tab.classList.contains('active')) {
            tab.style.backgroundColor = theme.buttonBg;
        } else {
            tab.style.backgroundColor = theme.accent;
        }
        tab.style.color = theme.text;
        tab.style.borderColor = theme.border;
    });
    
    // Apply to panels
    const panels = document.querySelectorAll('.lfo-panel, .automation-panel');
    panels.forEach(panel => {
        panel.style.backgroundColor = theme.controlsBg;
        panel.style.borderColor = theme.border;
    });
    
    // Apply to canvases borders
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        canvas.style.borderColor = theme.border;
    });
    
    // Update playhead color to match theme accent
    const playheadLine = document.getElementById('playhead-line');
    if (playheadLine) {
        playheadLine.style.backgroundColor = theme.accent;
        playheadLine.style.boxShadow = `0 0 8px ${theme.accent}88`;
    }
    const playheadHandle = document.querySelector('.playhead-handle');
    if (playheadHandle) {
        playheadHandle.style.backgroundColor = theme.accent;
        playheadHandle.style.boxShadow = `0 0 8px ${theme.accent}88`;
    }
    
    // Also update CSS variables for playhead
    document.documentElement.style.setProperty('--playhead-color', theme.accent);
    document.documentElement.style.setProperty('--playhead-shadow', `rgba(${hexToRgb(theme.accent)}, 0.8)`);
    
    // Store current theme
    document.body.dataset.currentTheme = themeName;
    
    // Redraw the arrangement grid with new colors
    if (typeof drawArrangement === 'function') {
        drawArrangement();
    }

}

// Initialize theme from localStorage
function initializeArrangementTheme() {
    // Get theme from PsychologicalStudio's localStorage
    const savedTheme = localStorage.getItem('psychologicalStudioTheme') || 'default';

    applyArrangementTheme(savedTheme);
    
    // Listen for storage changes (when theme is changed in PsychologicalStudio)
    window.addEventListener('storage', (e) => {
        if (e.key === 'psychologicalStudioTheme' && e.newValue) {

            applyArrangementTheme(e.newValue);
        }
    });
    
    // Also check periodically in case storage event doesn't fire
    setInterval(() => {
        const currentTheme = localStorage.getItem('psychologicalStudioTheme');
        if (currentTheme && currentTheme !== document.body.dataset.currentTheme) {

            document.body.dataset.currentTheme = currentTheme;
            applyArrangementTheme(currentTheme);
        }
    }, 1000); // Check every second
}

// Call on page load
if (document.readyState === 'loading') {
    // Theme initialization should also be gated behind PsychologicalStudio access
    document.addEventListener('DOMContentLoaded', () => {
        if (checkPsychStudioAccess()) {
            // One-time consume token if present
            try { localStorage.removeItem('psychologicalStudioArrangementAccess'); } catch (e) {}
            initializeArrangementTheme();
        } else {
            // Do not initialize theme when opened directly — overlay will show instead
            showAccessLockedOverlay();
        }
    });
} else {
    initializeArrangementTheme();
}

// ========== BEAUTIFUL POPUP SYSTEM ==========

/**
 * Show save success popup with summary
 */
function showSavePopup(data) {
    const overlay = document.getElementById('save-popup-overlay');
    if (!overlay) return;
    
    // Update popup content
    document.getElementById('save-popup-clips').textContent = data.clips;
    document.getElementById('save-popup-samples').textContent = data.samples;
    document.getElementById('save-popup-patterns').textContent = data.patterns;
    
    // Show overlay
    overlay.classList.add('active');
    
    // Auto-close after 5 seconds (but allow manual close)
    const autoCloseTimer = setTimeout(() => {
        if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
        }
    }, 5000);
    
    // Allow clicking overlay to close (except on popup container)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            clearTimeout(autoCloseTimer);
            overlay.classList.remove('active');
        }
    }, { once: true });
}

/**
 * Close save popup
 */
function closeSavePopup() {
    const overlay = document.getElementById('save-popup-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Show load success popup with summary
 */
function showLoadPopup(data) {
    const overlay = document.getElementById('load-popup-overlay');
    if (!overlay) return;
    
    // Update popup content
    document.getElementById('load-popup-clips').textContent = data.clips;
    document.getElementById('load-popup-samples').textContent = data.samples;
    document.getElementById('load-popup-patterns').textContent = data.patterns;
    
    // Show overlay
    overlay.classList.add('active');
    
    // Auto-close after 5 seconds (but allow manual close)
    const autoCloseTimer = setTimeout(() => {
        if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
        }
    }, 5000);
    
    // Allow clicking overlay to close (except on popup container)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            clearTimeout(autoCloseTimer);
            overlay.classList.remove('active');
        }
    }, { once: true });
}

/**
 * Close load popup
 */
function closeLoadPopup() {
    const overlay = document.getElementById('load-popup-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Close export success popup
 */
function closeExportSuccessPopup() {
    const overlay = document.getElementById('export-success-popup-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Show new sample dialog
 */
function showNewSampleDialog() {
    const overlay = document.getElementById('new-sample-overlay');
    if (!overlay) return;
    
    overlay.classList.add('active');
    
    // Setup button handlers
    const uploadBtn = document.getElementById('new-sample-upload-btn');
    const recordBtn = document.getElementById('new-sample-record-btn');
    
    if (uploadBtn) {
        uploadBtn.onclick = () => {
            closeNewSampleDialog();
            document.getElementById('arr-sample-file-input').click();
        };
    }
    
    if (recordBtn) {
        recordBtn.onclick = () => {
            closeNewSampleDialog();
            startRecording();
        };
    }
    
    // Allow clicking overlay to close (except on popup container)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    }, { once: false });
}

/**
 * Close new sample dialog
 */
function closeNewSampleDialog() {
    const overlay = document.getElementById('new-sample-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Fallback folder selection using Web File API
 */
function useFallbackFolderSelection() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    input.accept = 'audio/*';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // Get folder name from first file path
            const firstFile = files[0];
            const pathParts = firstFile.webkitRelativePath.split('/');
            const folderName = pathParts[0];
            
            // Store folder preference
            localStorage.setItem('psychologicalStudioSampleFolder', folderName);
            currentSampleFolder = folderName;
            
            // Update display
            document.getElementById('arr-current-folder').textContent = folderName;
            
            
            // Load samples from the selected folder
            const loadedCount = await loadSamplesFromFolder(files);
            
            // Show beautiful popup with results
            showFolderLoadedPopup(folderName, loadedCount);
        }
    };
    
    input.click();
}

/**
 * Show custom folder selector (for future use - web browsers limit file system access)
 */
function showFolderSelector() {
    const overlay = document.getElementById('folder-selector-overlay');
    if (!overlay) return;
    
    overlay.classList.add('active');
    
    // Allow clicking overlay to close (except on popup container)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    }, { once: false });
}

/**
 * Close folder selector
 */
function closeFolderSelector() {
    const overlay = document.getElementById('folder-selector-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/**
 * Confirm folder selection (placeholder - web APIs don't allow direct folder access)
 */
function confirmFolderSelection() {
    // Note: Modern web browsers restrict direct folder access for security reasons
    // Users can upload individual files using the upload button
    closeFolderSelector();
}

/**
 * Show folder loaded popup with summary
 */
function showFolderLoadedPopup(folderName, loadedCount) {
    // Create popup overlay
    let overlay = document.getElementById('folder-loaded-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'folder-loaded-overlay';
        overlay.className = 'popup-overlay';
        overlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2>Folder Loaded</h2>
                    <button class="popup-close-btn" onclick="closeFolderLoadedPopup()">×</button>
                </div>
                <div class="popup-body">
                    <div class="popup-success-icon">📁</div>
                    <p><strong>Audio files loaded successfully!</strong></p>
                    <div class="popup-content-summary">
                        <div><strong>Folder:</strong> <span id="folder-name"></span></div>
                        <div><strong>Audio Files:</strong> <span id="loaded-count">0</span></div>
                    </div>
                    <p style="font-size: 12px; color: #999; margin-top: 15px;">All files are ready to use in your arrangement.</p>
                </div>
                <div class="popup-footer">
                    <button class="popup-btn popup-btn-primary" onclick="closeFolderLoadedPopup()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    // Update content
    document.getElementById('folder-name').textContent = folderName;
    document.getElementById('loaded-count').textContent = loadedCount;
    
    // Show overlay
    overlay.classList.add('active');
    
    // Auto-close after 5 seconds
    const autoCloseTimer = setTimeout(() => {
        if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
        }
    }, 5000);
    
    // Allow clicking overlay to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            clearTimeout(autoCloseTimer);
            overlay.classList.remove('active');
        }
    }, { once: true });
}

/**
 * Close folder loaded popup
 */
function closeFolderLoadedPopup() {
    const overlay = document.getElementById('folder-loaded-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
