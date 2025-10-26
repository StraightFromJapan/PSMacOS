document.addEventListener("DOMContentLoaded",function(){let currentSampleForPopup=null;let longPressTimer=null;let isLongPress=false;let eqCanvas=null;let eqCtx=null;const MAX_EQ_POINTS=12;let isDraggingEqBand=false;let draggedPoint=null;let isCreatingNewPoint=false;let waveformAnalyzer=null;let waveformAnimationId=null;let waveformHistory=[];const waveformHistorySize=100;let originalEffects=null;let temporaryEffects=null;let recordedBlob=null;const recordedBlobs={};const uploadStatusPerSample={};const recordStatusPerSample={};const uploadedFileNames={};let pianoRollData={};let isPreviewingPianoRoll=false;let pianoRollPreviewNodes={};let currentPianoRollSample=null;let pianoRollLoopInterval=null;let pianoRollNoteLength=1;let pianoRollFilterNodes={lowShelf:null,highShelf:null,peaking1:null,peaking2:null,peaking3:null,delay:null,delayFeedback:null};let pianoRollVisualizer=null;let pianoRollVisualizerCtx=null;let pianoRollVisualizerAnalyzer=null;let pianoRollVisualizerAnimationId=null;let pianoRollVisualizerHistory=[];const pianoRollVisualizerHistorySize=100;let sampleSelectionPopup=null;let currentSampleForSelection=null;let sampleSelectionStart=0;let sampleSelectionEnd=0;let sampleSelectionZoomLevel=1;let sampleSelectionWaveformBuffer=null;let sampleSelectionPreviewSource=null;let sampleSelectionPreviewGain=null;let isPreviewingSelection=false;let audioContext;let isPlaying=false;let isRecording=false;let tempo=120;let highTempo=0;let longLoopTempo=120;let beatDuration=60/tempo;let barDuration=beatDuration*4;let nextBarTime=0;let lookahead=25;let scheduleAheadTime=.1;let timerId=null;let mediaRecorder;let recordedChunks=[];let recordingStartTime;let recordingDuration=0;let recordingDestination=null;let microphoneMediaRecorder=null;let microphoneMediaStream=null;let microphoneRecordedChunks=[];let isMicrophoneRecording=false;let masterStartTime=0;let masterCurrentBar=0;let masterTempo=tempo;let tempoChangeTime=0;let tempoHistory=[];let masterBarGrid={startTime:0,duration:barDuration,nextStartTime:barDuration};let loopLength=1;let longLoopLength=1;const currentPlaying={};const effectsPopup=document.createElement("div");effectsPopup.className="effects-popup";effectsPopup.style.display="none";const style=document.createElement("style");style.textContent=`
        .audio-button.active.no-sample {
            background-color: #333333 !important;
            color: white !important;
        }
        .audio-button.active.no-sample .loop-indicator {
            background-color: #555555 !important;
        }
        
        /* Dark grey slider styling */
        input[type="range"] {
            background-color: #444444 !important;
            height: 8px;
            border-radius: 4px;
            outline: none;
        }
        
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #af4c93ff;
            cursor: pointer;
        }
        
        input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #af4c4cff;
            cursor: pointer;
        }
        
        /* Custom indicator styling - changed to almost black */
        .custom-indicator {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 10px;
            height: 10px;
            background-color: #111111 !important;
            border-radius: 50%;
            z-index: 2;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
        }
        
        /* Piano roll styling */
        .piano-roll-container {
            display: flex;
            flex-direction: column;
            height: 200px;
            margin-top: 10px;
            position: relative;
            order: 10;
            overflow: visible;
        }
        
        .piano-roll-scrollable {
            display: flex;
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            position: relative;
        }
        
        .piano-keys {
            width: 40px;
            background-color: #222;
            border-right: 1px solid #444;
            flex-shrink: 0;
        }
        
        .piano-key {
            height: 20px;
            border-bottom: 1px solid #444;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #aaa;
            position: relative;
            cursor: pointer;
        }
        
        .piano-key.white {
            background-color: #444;
            color: #ddd;
        }
        
        .piano-key.black {
            background-color: #222;
            color: #fff;
            height: 12px;
            margin: 4px 0;
            z-index: 2;
        }
        
        .piano-key:hover {
            background-color: #555;
        }
        
        .piano-key.active {
            background-color: #4CAF50;
        }
        
        .piano-roll-grid-container {
            flex-grow: 1;
            position: relative;
            overflow: visible;
            min-height: 100%;
        }
        
        .piano-roll-grid {
            position: relative;
            top: auto;
            left: auto;
            background-color: #333;
            display: grid;
            grid-template-columns: repeat(16, 1fr);
            grid-auto-rows: 20px;
            width: 100%;
            height: auto;
            min-height: 1680px;
        }
        
        .piano-roll-cell {
            border-right: 1px solid crimson;
            border-bottom: 1px solid crimson;
            cursor: pointer;
            position: relative;
        }
        
        .piano-roll-cell.bar-start {
            border-left: 2px solid black;
        }
        
        .piano-roll-cell.bar-end {
            border-right: 2px solid black;
        }
        
        .piano-roll-cell.active {
            background-color: #111;
            height: 20px;
            margin-top: auto;
            margin-bottom: auto;
        }
        
        .piano-roll-cell.note-long {
            background-color: #111;
        }
        
        .piano-roll-controls {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            color: white;
        }
        
        .piano-roll-sound-source {
            display: flex;
            align-items: center;
        }
        
        .piano-roll-sound-source label {
            margin-right: 10px;
            color: white;
        }
        
        .piano-roll-sound-source select {
            color: white;
            background-color: #333;
            border: 1px solid #555;
            padding: 5px;
        }
        
        .piano-roll-preview-controls {
            display: flex;
            gap: 10px;
        }
        
        .piano-roll-preview-controls button {
            color: white;
            background-color: #4CAF50;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .piano-roll-preview-controls button:hover {
            background-color: #45a049;
        }
        
        .piano-roll-clear-btn {
            background-color: #f44336;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .piano-roll-clear-btn:hover {
            background-color: #d32f2f;
        }
        
        /* Piano roll note length selector */
        .piano-roll-note-length {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
        }
        
        .piano-roll-note-length label {
            color: white;
        }
        
        .piano-roll-note-length select {
            color: white;
            background-color: #333;
            border: 1px solid #555;
            padding: 5px;
        }
        
        /* Piano roll grid size selector */
        .piano-roll-grid-size {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
        }
        
        .piano-roll-grid-size label {
            color: white;
        }
        
        .grid-size-controls {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .grid-size-controls button {
            background-color: #444;
            color: white;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .grid-size-controls button:hover {
            background-color: #555;
        }
        
        #grid-size-display {
            color: white;
            min-width: 30px;
            text-align: center;
        }
        
        /* Piano roll visualizer styling */
        .piano-roll-visualizer-container {
            height: 100px;
            background-color: #111;
            border: 1px solid #333;
            border-radius: 4px;
            margin: 10px 0;
            position: relative;
            overflow: hidden;
        }
        
        .piano-roll-visualizer {
            width: 100%;
            height: 100%;
        }
        
        /* Enhanced Sample Selection Popup Styling */
        .sample-selection-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
            border: 1px solid #444;
            border-radius: 12px;
            padding: 25px;
            z-index: 1001;
            width: 600px;
            max-width: 90vw;
            max-height: 85vh;
            overflow-y: auto;
            display: none;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        
        .sample-selection-popup h3 {
            margin-top: 0;
            color: #fff;
            font-size: 20px;
            font-weight: 500;
            text-align: center;
            margin-bottom: 20px;
        }
        
        .sample-selection-popup .popup-content {
            margin-bottom: 20px;
        }
        
        .sample-selection-popup .popup-footer {
            display: flex;
            justify-content: flex-end;
            gap: 15px;
            margin-top: 20px;
        }
        
        .sample-selection-popup button {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .sample-selection-popup .popup-close-btn {
            background-color: #555;
            color: white;
        }
        
        .sample-selection-popup .popup-close-btn:hover {
            background-color: #444;
            transform: translateY(-1px);
        }
        
        .sample-selection-popup .popup-accept-btn {
            background-color: #4CAF50;
            color: white;
        }
        
        .sample-selection-popup .popup-accept-btn:hover {
            background-color: #45a049;
            transform: translateY(-1px);
        }
        
        .sample-waveform-container {
            height: 180px;
            background: linear-gradient(145deg, #1a1a1a, #0a0a0a);
            border: 1px solid #444;
            border-radius: 8px;
            position: relative;
            margin: 15px 0;
            overflow: hidden;
            box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        
        .sample-waveform {
            width: 100%;
            height: 100%;
            color: red;
            background-color: red;
            accent-color: red;
        }
        
        .sample-selection-controls {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin: 15px 0;
        }
        
        .sample-selection-range {
            display: flex;
            align-items: center;
            margin: 10px 0;
        }
        
        .sample-selection-range label {
            width: 60px;
            color: #ddd;
            font-weight: 500;
        }
        
        .sample-selection-range input[type="range"] {
            flex-grow: 1;
            margin: 0 15px;
            background: linear-gradient(90deg, #333 0%, #444 100%);
            height: 6px;
            border-radius: 3px;
            outline: none;
        }
        
        .sample-selection-range input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #5e4cafff;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        
        .sample-selection-range input[type="range"]::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #af4c4cff;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        
        .sample-selection-values {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: #aaa;
            margin-top: 5px;
        }
        
        .sample-selection-info {
            display: flex;
            justify-content: space-between;
            background-color: rgba(255, 255, 255, 0.05);
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 15px;
        }
        
        .sample-selection-info span {
            color: #ddd;
            font-size: 14px;
        }
        
        .sample-selection-preview-controls {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin: 15px 0;
        }
        
        .sample-selection-preview-btn {
            background-color: #c93600ff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .sample-selection-preview-btn:hover {
            background-color: #da310bff;
            transform: translateY(-1px);
        }
        
        .sample-selection-zoom-controls {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin: 10px 0;
        }
        
        .sample-selection-zoom-btn {
            background-color: #555;
            color: white;
            border: none;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        
        .sample-selection-zoom-btn:hover {
            background-color: #666;
            transform: scale(1.1);
        }
        
        .sample-selection-zoom-level {
            display: flex;
            align-items: center;
            color: #ddd;
            font-size: 14px;
            min-width: 50px;
            justify-content: center;
        }
        
        /* Piano roll filter controls styling - MODIFIED */
        .piano-roll-filters {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #444;
        }
        
        .piano-roll-filters h4 {
            margin-bottom: 10px;
            color: #fff;
        }
        
        .filter-control {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .filter-control label {
            width: 100px;
            font-size: 12px;
            color: #aaa;
        }
        
        .filter-control input {
            flex-grow: 1;
            margin-right: 10px;
        }
        
        .filter-control span {
            width: 50px;
            text-align: right;
            font-size: 12px;
            color: #aaa;
        }
        
        /* Enhanced filter controls styling - MOBILE FIX */
        .enhanced-filter-controls {
            display: grid;
            grid-template-columns: 1fr;
            gap: 15px;
            margin-top: 10px;
        }
        
        @media (min-width: 768px) {
            .enhanced-filter-controls {
                grid-template-columns: 1fr 1fr;
            }
        }
        
        .filter-group {
            background-color: #2a2a2a;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #444;
        }
        
        .filter-group h5 {
            margin: 0 0 8px 0;
            color: #331febff;
            font-size: 14px;
        }
        
        .filter-group .filter-control {
            margin-bottom: 5px;
        }
        
        .filter-group .filter-control:last-child {
            margin-bottom: 0;
        }
        
        /* Loading indicator for piano roll rendering */
        .loading-indicator {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1000;
            text-align: center;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
        
        .loading-indicator .spinner {
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 3px solid #4CAF50;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Toggle switch for piano roll section */
        .piano-roll-toggle-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        
        .piano-roll-toggle-container h4 {
            margin: 0;
        }
        
        /* The switch - the box around the slider */
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        
        /* Hide default HTML checkbox */
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        /* The slider */
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #444;
            transition: .4s;
            border-radius: 24px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #4CAF50;
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
        
        /* Piano roll content - hidden by default */
        .piano-roll-content {
            display: none;
        }
        
        .piano-roll-content.visible {
            display: block;
        }
        
        /* Recording button styles */
        .microphone-record-btn {
            background-color: #d68100ff !important;
            color: black !important;
            padding: 3px;
        }
        
        .microphone-save-btn {
            background-color: #deae12ff !important;
            color: black !important;
            padding: 3px;
        }
        
        .microphone-download-btn {
            background-color: #4ca427ff !important;
            color: black !important;
            padding: 3px;
        }
        
        .microphone-delete-btn {
            background-color: #ff3f31ff !important;
            color: black !important;
            padding: 3px;
        }
    `;document.head.appendChild(style);function updateViewportHeight(){let vh=window.innerHeight*.01;document.documentElement.style.setProperty("--vh",`${vh}px`);updateGridSize()}function updateGridSize(){const buttonGrid=document.getElementById("buttonGrid");const gridPanel=document.querySelector(".grid-panel");if(!buttonGrid||!gridPanel)return;const containerWidth=gridPanel.offsetWidth;const containerHeight=gridPanel.offsetHeight;let maxSize;if(window.innerWidth<=400&&window.innerHeight<=500){maxSize=Math.min(containerWidth,containerHeight);if(maxSize<150){maxSize=150}}else if(window.innerWidth<=768){maxSize=Math.min(containerWidth,containerHeight)*.95;if(maxSize<200){maxSize=200}}else{maxSize=Math.min(containerWidth,containerHeight);if(maxSize<200){maxSize=200}if(maxSize>700){maxSize=700}}buttonGrid.style.width=`${maxSize}px`;buttonGrid.style.height=`${maxSize}px`;buttonGrid.getBoundingClientRect();if(effectsPopup){effectsPopup.style.width=`${maxSize}px`;effectsPopup.style.height=`${maxSize}px`}}updateViewportHeight();let resizeTimeout;window.addEventListener("resize",function(){clearTimeout(resizeTimeout);resizeTimeout=setTimeout(function(){updateViewportHeight()},100)});window.addEventListener("orientationchange",function(){setTimeout(function(){updateViewportHeight()},300)});const buttonGrid=document.getElementById("buttonGrid");const tempoSlider=document.getElementById("tempo");const tempoDisplay=document.getElementById("tempoDisplay");const playButton=document.getElementById("playButton");const recordButton=document.getElementById("recordButton");const saveButton=document.getElementById("saveButton");const gridPanel=document.querySelector(".grid-panel");if(!buttonGrid||!tempoSlider||!tempoDisplay||!playButton||!recordButton||!saveButton||!gridPanel){console.error("One or more required elements are missing");return}gridPanel.style.display="flex";gridPanel.style.visibility="visible";sampleSelectionPopup=document.createElement("div");sampleSelectionPopup.className="sample-selection-popup";sampleSelectionPopup.innerHTML=`
        <div class="popup-header">
            <h3>Select Sample Range</h3>
            <button class="popup-close-btn">Close</button>
        </div>
        <div class="popup-content">
            <div class="sample-selection-info">
                <span>Sample: <strong id="sample-name">Sample ${currentSampleForPopup||1}</strong></span>
                <span>Duration: <strong id="sample-duration">0.00s</strong></span>
            </div>
            <div class="sample-waveform-container">
                <canvas class="sample-waveform" id="sample-selection-waveform"></canvas>
            </div>
            <div class="sample-selection-zoom-controls">
                <button class="sample-selection-zoom-btn" id="zoom-out-btn">−</button>
                <div class="sample-selection-zoom-level" id="zoom-level">100%</div>
                <button class="sample-selection-zoom-btn" id="zoom-in-btn">+</button>
                <button class="sample-selection-zoom-btn" id="zoom-reset-btn">⟲</button>
            </div>
            <div class="sample-selection-controls">
                <div class="sample-selection-range">
                    <label>Start:</label>
                    <input type="range" id="sample-selection-start" min="0" max="100" value="0">
                    <span id="sample-selection-start-value">0.00s</span>
                </div>
                <div class="sample-selection-range">
                    <label>End:</label>
                    <input type="range" id="sample-selection-end" min="0" max="100" value="100">
                    <span id="sample-selection-end-value">0.00s</span>
                </div>
            </div>
            <div class="sample-selection-values">
                <span>Selection Duration: <strong id="selection-duration">0.00s</strong></span>
            </div>
            <div class="sample-selection-preview-controls">
                <button class="sample-selection-preview-btn" id="preview-selection-btn">Preview Selection</button>
                <button class="sample-selection-preview-btn" id="preview-full-btn">Preview Full Sample</button>
            </div>
        </div>
        <div class="popup-footer">
            <button class="popup-close-btn">Close</button>
            <button class="popup-accept-btn">Accept</button>
        </div>
    `;document.body.appendChild(sampleSelectionPopup);setupSampleSelectionPopupEventListeners();function setupSampleSelectionPopupEventListeners(){const closeButtons=sampleSelectionPopup.querySelectorAll(".popup-close-btn");closeButtons.forEach(btn=>{btn.addEventListener("click",function(){stopSampleSelectionPreview();sampleSelectionPopup.style.display="none"})});const acceptButton=sampleSelectionPopup.querySelector(".popup-accept-btn");acceptButton.addEventListener("click",function(){if(!currentSampleForSelection)return;const data=pianoRollData[currentSampleForSelection];data.sampleRange={start:sampleSelectionStart,end:sampleSelectionEnd};stopSampleSelectionPreview();sampleSelectionPopup.style.display="none"});const startSlider=document.getElementById("sample-selection-start");const endSlider=document.getElementById("sample-selection-end");startSlider.addEventListener("input",function(){sampleSelectionStart=parseInt(this.value);if(sampleSelectionStart>sampleSelectionEnd){sampleSelectionStart=sampleSelectionEnd;this.value=sampleSelectionStart}updateSampleSelectionDisplay();drawSampleWaveform();if(isPreviewingSelection){previewSampleSelection()}});endSlider.addEventListener("input",function(){sampleSelectionEnd=parseInt(this.value);if(sampleSelectionEnd<sampleSelectionStart){sampleSelectionEnd=sampleSelectionStart;this.value=sampleSelectionEnd}updateSampleSelectionDisplay();drawSampleWaveform();if(isPreviewingSelection){previewSampleSelection()}});document.getElementById("zoom-in-btn").addEventListener("click",function(){if(sampleSelectionZoomLevel<4){sampleSelectionZoomLevel*=2;updateZoomLevel();drawSampleWaveform()}});document.getElementById("zoom-out-btn").addEventListener("click",function(){if(sampleSelectionZoomLevel>.25){sampleSelectionZoomLevel/=2;updateZoomLevel();drawSampleWaveform()}});document.getElementById("zoom-reset-btn").addEventListener("click",function(){sampleSelectionZoomLevel=1;updateZoomLevel();drawSampleWaveform()});document.getElementById("preview-selection-btn").addEventListener("click",function(){if(isPreviewingSelection){stopSampleSelectionPreview()}else{previewSampleSelection()}});document.getElementById("preview-full-btn").addEventListener("click",function(){if(isPreviewingSelection){stopSampleSelectionPreview()}else{previewFullSample()}})}function updateZoomLevel(){document.getElementById("zoom-level").textContent=`${Math.round(sampleSelectionZoomLevel*100)}%`}function previewSampleSelection(){if(!currentSampleForSelection||!currentPlaying[currentSampleForSelection].buffer)return;stopSampleSelectionPreview();const sample=currentPlaying[currentSampleForSelection];const buffer=sample.buffer;const bufferDuration=buffer.duration;const startTime=bufferDuration*(sampleSelectionStart/100);const endTime=bufferDuration*(sampleSelectionEnd/100);const selectionDuration=endTime-startTime;sampleSelectionPreviewSource=audioContext.createBufferSource();sampleSelectionPreviewSource.buffer=buffer;sampleSelectionPreviewSource.loop=true;sampleSelectionPreviewSource.loopStart=startTime;sampleSelectionPreviewSource.loopEnd=endTime;sampleSelectionPreviewGain=audioContext.createGain();sampleSelectionPreviewGain.gain.value=.7;sampleSelectionPreviewSource.connect(sampleSelectionPreviewGain);sampleSelectionPreviewGain.connect(audioContext.destination);sampleSelectionPreviewSource.start(0,startTime);isPreviewingSelection=true;document.getElementById("preview-selection-btn").textContent="Stop Preview"}function previewFullSample(){if(!currentSampleForSelection||!currentPlaying[currentSampleForSelection].buffer)return;stopSampleSelectionPreview();const sample=currentPlaying[currentSampleForSelection];const buffer=sample.buffer;sampleSelectionPreviewSource=audioContext.createBufferSource();sampleSelectionPreviewSource.buffer=buffer;sampleSelectionPreviewSource.loop=true;sampleSelectionPreviewGain=audioContext.createGain();sampleSelectionPreviewGain.gain.value=.7;sampleSelectionPreviewSource.connect(sampleSelectionPreviewGain);sampleSelectionPreviewGain.connect(audioContext.destination);sampleSelectionPreviewSource.start(0);isPreviewingSelection=true;document.getElementById("preview-full-btn").textContent="Stop Preview"}function stopSampleSelectionPreview(){if(sampleSelectionPreviewSource){try{sampleSelectionPreviewSource.stop();sampleSelectionPreviewSource.disconnect()}catch(e){}sampleSelectionPreviewSource=null}if(sampleSelectionPreviewGain){try{sampleSelectionPreviewGain.disconnect()}catch(e){}sampleSelectionPreviewGain=null}isPreviewingSelection=false;document.getElementById("preview-selection-btn").textContent="Preview Selection";document.getElementById("preview-full-btn").textContent="Preview Full Sample"}function updateSampleSelectionDisplay(){if(!currentSampleForSelection)return;const sample=currentPlaying[currentSampleForSelection];if(!sample.buffer)return;const bufferDuration=sample.buffer.duration;const startTime=bufferDuration*(sampleSelectionStart/100);const endTime=bufferDuration*(sampleSelectionEnd/100);const selectionDuration=endTime-startTime;document.getElementById("sample-selection-start-value").textContent=startTime.toFixed(2)+"s";document.getElementById("sample-selection-end-value").textContent=endTime.toFixed(2)+"s";document.getElementById("selection-duration").textContent=selectionDuration.toFixed(2)+"s"}function drawSampleWaveform(){if(!currentSampleForSelection)return;const sample=currentPlaying[currentSampleForSelection];const canvas=document.getElementById("sample-selection-waveform");const ctx=canvas.getContext("2d");if(!sample.buffer)return;canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight;const bgGradient=ctx.createLinearGradient(0,0,0,canvas.height);bgGradient.addColorStop(0,"#1a1a1a");bgGradient.addColorStop(1,"#0a0a0a");ctx.fillStyle=bgGradient;ctx.fillRect(0,0,canvas.width,canvas.height);const buffer=sample.buffer;const data=buffer.getChannelData(0);const startSample=Math.floor(data.length*(sampleSelectionStart/100));const endSample=Math.ceil(data.length*(sampleSelectionEnd/100));const visibleRange=endSample-startSample;const zoomedRange=Math.floor(visibleRange/sampleSelectionZoomLevel);const centerPoint=startSample+visibleRange/2;const zoomedStart=Math.max(0,Math.floor(centerPoint-zoomedRange/2));const zoomedEnd=Math.min(data.length,Math.ceil(centerPoint+zoomedRange/2));ctx.strokeStyle="rgba(255, 255, 255, 0.1)";ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=canvas.height/4*i;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}for(let i=0;i<=8;i++){const x=canvas.width/8*i;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}const gradient=ctx.createLinearGradient(0,0,0,canvas.height);gradient.addColorStop(0,"rgba(76, 175, 80, 0.8)");gradient.addColorStop(.5,"rgba(76, 175, 80, 0.5)");gradient.addColorStop(1,"rgba(76, 175, 80, 0.8)");ctx.fillStyle=gradient;ctx.beginPath();const step=Math.ceil((zoomedEnd-zoomedStart)/canvas.width);const amp=canvas.height/2;for(let i=0;i<canvas.width;i++){let min=1;let max=-1;for(let j=0;j<step;j++){const datum=data[zoomedStart+i*step+j];if(datum<min)min=datum;if(datum>max)max=datum}ctx.fillRect(i,(1+min)*amp,1,Math.max(1,(max-min)*amp))}const selectionStartPixel=(startSample-zoomedStart)/(zoomedEnd-zoomedStart)*canvas.width;const selectionEndPixel=(endSample-zoomedStart)/(zoomedEnd-zoomedStart)*canvas.width;ctx.fillStyle="rgba(255, 152, 0, 0.2)";ctx.fillRect(selectionStartPixel,0,selectionEndPixel-selectionStartPixel,canvas.height);ctx.fillStyle="#FF9800";ctx.fillRect(selectionStartPixel-2,0,4,canvas.height);ctx.fillRect(selectionEndPixel-2,0,4,canvas.height);ctx.beginPath();ctx.arc(selectionStartPixel,canvas.height/2,8,0,Math.PI*2);ctx.fillStyle="#FF9800";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(selectionEndPixel,canvas.height/2,8,0,Math.PI*2);ctx.fillStyle="#FF9800";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#aaa";ctx.font="12px Arial";ctx.textAlign="center";const startTime=buffer.duration*(sampleSelectionStart/100);const endTime=buffer.duration*(sampleSelectionEnd/100);const zoomedStartTime=buffer.duration*(zoomedStart/data.length);const zoomedEndTime=buffer.duration*(zoomedEnd/data.length);ctx.fillText(`${zoomedStartTime.toFixed(2)}s`,30,canvas.height-10);ctx.fillText(`${zoomedEndTime.toFixed(2)}s`,canvas.width-30,canvas.height-10);if(selectionStartPixel>20&&selectionStartPixel<canvas.width-20){ctx.fillStyle="#FF9800";ctx.fillText(`${startTime.toFixed(2)}s`,selectionStartPixel,canvas.height-10)}if(selectionEndPixel>20&&selectionEndPixel<canvas.width-20){ctx.fillStyle="#FF9800";ctx.fillText(`${endTime.toFixed(2)}s`,selectionEndPixel,canvas.height-10)}}function initializeAudioContext(){if(audioContext)return;try{const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){throw new Error("Web Audio API is not supported in this browser")}audioContext=new AudioContext;audioContext.addEventListener("statechange",()=>{console.log("Audio context state:",audioContext.state);if(audioContext.state==="interrupted"){showNotification("Audio was interrupted. Please tap to resume.")}});console.log("Audio context initialized successfully")}catch(e){console.error("Error initializing audio context:",e);showNotification("Audio initialization failed. Please try a different browser.")}}function showNotification(message){let notification=document.getElementById("notification");if(!notification){notification=document.createElement("div");notification.id="notification";notification.style.position="fixed";notification.style.bottom="20px";notification.style.left="50%";notification.style.transform="translateX(-50%)";notification.style.backgroundColor="rgba(0, 0, 0, 0.8)";notification.style.color=white;notification.style.padding="10px 20px";notification.style.borderRadius="5px";notification.style.zIndex="9999";document.body.appendChild(notification)}notification.textContent=message;notification.style.display="block";setTimeout(()=>{notification.style.display="none"},5e3)}function resumeAudioContext(){if(audioContext&&audioContext.state==="suspended"){audioContext.resume().then(()=>{console.log("Audio context resumed successfully")})["catch"](e=>{console.error("Error resuming audio context:",e)})}}initializeAudioContext();let masterOutputNode=audioContext.createGain();masterOutputNode.connect(audioContext.destination);effectsPopup.innerHTML=`
        <div class="popup-header">
            <h3>Effects for Sample <span id="popup-sample-number">1</span></h3>
            <button class="popup-close-btn">Close</button>
        </div>
        <div class="popup-content">
            <div class="effect-section">
                <h4>Sample</h4>
                <div class="sample-upload">
                    <label for="sample-upload"></label>
                    <input type="file" id="sample-upload" accept="audio/*,.wav,.mp3,.ogg,.aac,.flac,.m4a,.wma">
                    <div class="upload-status" id="upload-status"></div>
                </div>
                <div class="sample-record">
                    <label>Record:</label>
                    <div class="record-controls">
                        <button id="microphone-record-btn" class="microphone-record-btn">Start Recording</button>
                        <button id="microphone-save-btn" class="microphone-save-btn" style="display: none;">Save Recording</button>
                        <button id="microphone-download-btn" class="microphone-download-btn" style="display: none;">Download</button>
                        <button id="microphone-delete-btn" class="microphone-delete-btn" style="display: none;">Delete</button>
                    </div>
                    <div class="record-status" id="record-status"></div>
                </div>
            </div>
            <div class="effect-section">
            <hr color="purple">
            <br>
                <h4>Volume</h4>
                <div class="slider-container">
                    <label>Gain</label>
                    <input type="range" id="sample-volume" min="0" max="200" value="100" step="1">
                    <span id="sample-volume-value">100%</span>
                </div>
            </div>
            <div class="effect-section">
            <hr color="grey">
            <br>
                <h4>Speed</h4>
                <div class="speed-selector">
                    <label for="speed-select">Speed:</label>
                    <select id="speed-select">
                        <option value="0.1">0.1x</option>
                        <option value="0.25">0.25x</option>
                        <option value="0.5">0.5x</option>
                        <option value="0.75">0.75x</option>
                        <option value="1" selected>1x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2x</option>
                    </select>
                </div>
            </div>
            <div class="effect-section individual-tempo-section">
            <hr color="grey">
            <br>
                <h4>Individual Tempo</h4>
                <div class="slider-container">
                    <label>Tempo Multiplier</label>
                    <input type="range" id="individual-tempo" min="0.1" max="5.0" value="1.0" step="0.01">
                    <span id="individual-tempo-value">1.0</span>
                </div>
            </div>
            <div class="effect-section">
            <hr color="grey">
            <br>
                <h4>Delay</h4>
                <div class="slider-container">
                    <label>Time (ms)</label>
                    <input type="range" id="delay-time" min="0" max="1000" value="0" step="10">
                    <span id="delay-time-value">0</span>
                </div>
                <div class="slider-container">
                    <label>Feedback (%)</label>
                    <input type="range" id="delay-feedback" min="0" max="100" value="0" step="1">
                    <span id="delay-feedback-value">0</span>
                </div>
            </div>
            <div class="effect-section">
            <hr color="grey">
            <br>
                <h4>Reverb</h4>
                <div class="slider-container">
                    <label>Decay (s)</label>
                    <input type="range" id="reverb-decay" min="0.1" max="5" value="0" step="0.1">
                    <span id="reverb-decay-value">0</span>
                </div>
                <div class="slider-container">
                    <label>Pre-delay (ms)</label>
                    <input type="range" id="reverb-predelay" min="0" max="100" value="0" step="1">
                    <span id="reverb-predelay-value">0</span>
                </div>
                <div class="slider-container">
                    <label>Diffusion (%)</label>
                    <input type="range" id="reverb-diffusion" min="0" max="100" value="50" step="1">
                    <span id="reverb-diffusion-value">50</span>
                </div>
                <div class="slider-container">
                    <label>Low Cut (Hz)</label>
                    <input type="range" id="reverb-lowcut" min="20" max="1000" value="20" step="10">
                    <span id="reverb-lowcut-value">20</span>
                </div>
                <div class="slider-container">
                    <label>High Cut (Hz)</label>
                    <input type="range" id="reverb-highcut" min="1000" max="20000" value="20000" step="100">
                    <span id="reverb-highcut-value">20000</span>
                </div>
                <div class="slider-container">
                    <label>Damping (%)</label>
                    <input type="range" id="reverb-damping" min="0" max="100" value="50" step="1">
                    <span id="reverb-damping-value">50</span>
                </div>
                <div class="slider-container">
                    <label>Wet/Dry (%)</label>
                    <input type="range" id="reverb-mix" min="0" max="100" value="0" step="1">
                    <span id="reverb-mix-value">0</span>
                </div>
            </div>
            <div class="effect-section">
            <hr color="grey">
            <br>
                <h4>Equalizer</h4>
                <div class="professional-eq-container">
                    <div class="visual-eq-container">
                        <canvas class="eq-canvas" id="eq-canvas"></canvas>
                        <div class="eq-frequency-labels">
                            <span>20Hz</span>
                            <span>100Hz</span>
                            <span>1kHz</span>
                            <span>10kHz</span>
                            <span>20kHz</span>
                        </div>
                        <div class="eq-gain-labels">
                            <span>+24dB</span>
                            <span>+12dB</span>
                            <span>0dB</span>
                            <span>-12dB</span>
                            <span>-24dB</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="effect-section piano-roll-section">
            <hr color="brightgrey">
            <br>
                <div class="piano-roll-toggle-container">
                    <h4>Synth</h4>
                    <label class="switch">
                        <input type="checkbox" id="piano-roll-toggle">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div class="piano-roll-content">
                    <div class="piano-roll-note-length">
                        <label for="note-length-select">Note Length:</label>
                        <select id="note-length-select">
                            <option value="0.25">1/64</option>
                            <option value="0.5">1/32</option>
                            <option value="1" selected>1/16</option>
                            <option value="2">1/8</option>
                            <option value="4">1/4</option>
                            <option value="8">1/2</option>
                            <option value="16">1/1</option>
                        </select>
                    </div>
                    <div class="piano-roll-grid-size">
                        <label>Grid Size:</label>
                        <div class="grid-size-controls">
                            <button id="grid-size-decrease">-</button>
                            <span id="grid-size-display">16</span>
                            <button id="grid-size-increase">+</button>
                        </div>
                    </div>
                    <div class="piano-roll-container">
                        <div class="piano-roll-scrollable">
                            <div class="piano-keys">
                            </div>
                            <div class="piano-roll-grid-container">
                                <div class="piano-roll-grid">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="piano-roll-visualizer-container">
                        <canvas class="piano-roll-visualizer" id="piano-roll-visualizer"></canvas>
                    </div>
                    <div class="piano-roll-controls">
                        <div class="piano-roll-sound-source">
                            <label for="piano-roll-sound-source">Sound Source:</label>
                            <select id="piano-roll-sound-source">
                                <option value="piano">Grand Piano</option>
                                <option value="synth">Synth</option>
                                <option value="strings">Strings</option>
                                <option value="bass">Bass</option>
                                <option value="lead">Lead</option>
                                <option value="pad">Pad</option>
                                <option value="pluck">Pluck</option>
                                <option value="sample">Use Sample</option>
                            </select>
                        </div>
                        <div class="piano-roll-preview-controls">
                            <button id="piano-roll-preview-btn">Preview</button>
                            <button id="piano-roll-stop-btn">Stop</button>
                            <button id="piano-roll-clear-btn" class="piano-roll-clear-btn">Clear</button>
                        </div>
                    </div>
                    
                    <div class="piano-roll-filters">
                        <h4>Synth Filters</h4>
                        
                        <div class="enhanced-filter-controls">
                            <div class="filter-group">
                                <h5>EQ Controls</h5>
                                <div class="filter-control">
                                    <label>Low Shelf:</label>
                                    <input type="range" id="piano-roll-lowshelf" min="-24" max="24" value="0" step="0.5">
                                    <span id="piano-roll-lowshelf-value">0dB</span>
                                </div>
                                <div class="filter-control">
                                    <label>Low Mid:</label>
                                    <input type="range" id="piano-roll-lowmid" min="-24" max="24" value="0" step="0.5">
                                    <span id="piano-roll-lowmid-value">0dB</span>
                                </div>
                                <div class="filter-control">
                                    <label>Mid:</label>
                                    <input type="range" id="piano-roll-mid" min="-24" max="24" value="0" step="0.5">
                                    <span id="piano-roll-mid-value">0dB</span>
                                </div>
                                <div class="filter-control">
                                    <label>High Mid:</label>
                                    <input type="range" id="piano-roll-highmid" min="-24" max="24" value="0" step="0.5">
                                    <span id="piano-roll-highmid-value">0dB</span>
                                </div>
                                <div class="filter-control">
                                    <label>High Shelf:</label>
                                    <input type="range" id="piano-roll-highshelf" min="-24" max="24" value="0" step="0.5">
                                    <span id="piano-roll-highshelf-value">0dB</span>
                                </div>
                            </div>
                            
                            <div class="filter-group">
                                <h5>Delay</h5>
                                <div class="filter-control">
                                    <label>Time (ms):</label>
                                    <input type="range" id="piano-roll-delay-time" min="0" max="1000" value="0" step="10">
                                    <span id="piano-roll-delay-time-value">0ms</span>
                                </div>
                                <div class="filter-control">
                                    <label>Feedback (%):</label>
                                    <input type="range" id="piano-roll-delay-feedback" min="0" max="100" value="0" step="1">
                                    <span id="piano-roll-delay-feedback-value">0%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="loading-indicator" id="piano-roll-loading">
                <div class="spinner"></div>
                <div>Rendering piano roll...</div>
            </div>
        </div>
        <div class="popup-footer">
            <button class="popup-reset-btn">Reset All to 0</button>
            <button class="popup-accept-btn">Accept</button>
        </div>
    `;document.body.appendChild(effectsPopup);function interpolateGainSpline(frequency,sortedPoints){if(sortedPoints.length===0)return 0;if(sortedPoints.length===1)return sortedPoints[0].gain;const logPoints=sortedPoints.map(p=>({x:Math.log10(p.frequency),y:p.gain}));const x=Math.log10(frequency);if(x<=logPoints[0].x)return logPoints[0].y;if(x>=logPoints[logPoints.length-1].x)return logPoints[logPoints.length-1].y;let i=0;for(i=0;i<logPoints.length-1;i++){if(x>=logPoints[i].x&&x<=logPoints[i+1].x){break}}const p0=logPoints[Math.max(0,i-1)];const p1=logPoints[i];const p2=logPoints[i+1];const p3=logPoints[Math.min(logPoints.length-1,i+2)];const t=(x-p1.x)/(p2.x-p1.x);const t2=t*t;const t3=t2*t;return.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)}function addEQPoint(frequency,gain){if(!temporaryEffects||!temporaryEffects.eq)return;if(temporaryEffects.eq.length>=MAX_EQ_POINTS)return;if(frequency<=20||frequency>=2e4)return;let type="peaking";if(frequency<200)type="lowshelf";else if(frequency>8e3)type="highshelf";const newPoint={frequency:frequency,gain:gain,q:1,type:type};temporaryEffects.eq.push(newPoint);temporaryEffects.eq.sort((a,b)=>a.frequency-b.frequency);updateEQFiltersInRealTime();drawEQVisual();return newPoint}function initVisualEQ(){eqCanvas=document.getElementById("eq-canvas");eqCtx=eqCanvas.getContext("2d");const container=eqCanvas.parentElement;eqCanvas.width=container.clientWidth;eqCanvas.height=container.clientHeight;drawEQVisual();eqCanvas.addEventListener("mousedown",startDraggingEQBand);eqCanvas.addEventListener("mousemove",dragEQBand);eqCanvas.addEventListener("mouseup",stopDraggingEQBand);eqCanvas.addEventListener("mouseleave",stopDraggingEQBand);eqCanvas.addEventListener("touchstart",handleEQTouchStart);eqCanvas.addEventListener("touchmove",handleEQTouchMove);eqCanvas.addEventListener("touchend",stopDraggingEQBand);initWaveformVisualization()}function initWaveformVisualization(){if(!currentSampleForPopup||!currentPlaying[currentSampleForPopup].isScheduled){return}if(!waveformAnalyzer){waveformAnalyzer=audioContext.createAnalyser();waveformAnalyzer.fftSize=4096;waveformAnalyzer.smoothingTimeConstant=.7;const sample=currentPlaying[currentSampleForPopup];if(sample.eqVeryHighNode){sample.eqVeryHighNode.disconnect();sample.eqVeryHighNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}else if(sample.outputNode){sample.outputNode.disconnect();sample.outputNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}else if(sample.gainNode){sample.gainNode.disconnect();sample.gainNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}}startWaveformAnimation()}function startWaveformAnimation(){if(waveformAnimationId){cancelAnimationFrame(waveformAnimationId)}const bufferLength=waveformAnalyzer.frequencyBinCount;const dataArray=new Uint8Array(bufferLength);function animate(){waveformAnimationId=requestAnimationFrame(animate);waveformAnalyzer.getByteFrequencyData(dataArray);waveformHistory.push([...dataArray]);if(waveformHistory.length>waveformHistorySize){waveformHistory.shift()}drawEQVisual()}animate()}function stopWaveformAnimation(){if(waveformAnimationId){cancelAnimationFrame(waveformAnimationId);waveformAnimationId=null}waveformHistory=[];drawEQVisual()}function drawEQVisual(){if(!eqCanvas||!eqCtx)return;const width=eqCanvas.width;const height=eqCanvas.height;const padding=20;eqCtx.fillStyle="#0a0a0f";eqCtx.fillRect(0,0,width,height);eqCtx.strokeStyle="#1a1a2e";eqCtx.lineWidth=1;for(let i=0;i<=4;i++){const y=padding+i*(height-2*padding)/4;eqCtx.beginPath();eqCtx.moveTo(padding,y);eqCtx.lineTo(width-padding,y);eqCtx.stroke()}for(let i=0;i<=4;i++){const x=padding+i*(width-2*padding)/4;eqCtx.beginPath();eqCtx.moveTo(x,padding);eqCtx.lineTo(x,height-padding);eqCtx.stroke()}eqCtx.strokeStyle="#333";eqCtx.lineWidth=1;eqCtx.setLineDash([5,3]);const zeroDbY=height/2;eqCtx.beginPath();eqCtx.moveTo(padding,zeroDbY);eqCtx.lineTo(width-padding,zeroDbY);eqCtx.stroke();eqCtx.setLineDash([]);if(waveformHistory.length>0){drawWaveform()}eqCtx.strokeStyle="#4CAF50";eqCtx.lineWidth=4;eqCtx.shadowColor="rgba(76, 175, 80, 0.8)";eqCtx.shadowBlur=8;eqCtx.beginPath();const eqPoints=temporaryEffects&&temporaryEffects.eq?temporaryEffects.eq:[];const sortedPoints=[...eqPoints].sort((a,b)=>a.frequency-b.frequency);const points=[];const numPoints=200;for(let i=0;i<=numPoints;i++){const x=padding+i*(width-2*padding)/numPoints;const freq=20*Math.pow(2e4/20,(x-padding)/(width-2*padding));let gain=interpolateGainSpline(freq,sortedPoints);const y=height/2-gain/24*(height/2-padding);points.push({x:x,y:y});if(i===0){eqCtx.moveTo(x,y)}else{eqCtx.lineTo(x,y)}}eqCtx.stroke();eqCtx.shadowBlur=0;for(let i=0;i<eqPoints.length;i++){const point=eqPoints[i];const x=padding+Math.log10(point.frequency/20)/Math.log10(2e4/20)*(eqCanvas.width-2*padding);const y=height/2-point.gain/24*(height/2-padding);if(point.fixed){eqCtx.fillStyle="#FFC107";eqCtx.shadowColor="rgba(255, 193, 7, 0.8)"}else{eqCtx.fillStyle=point===draggedPoint?"#FF5722":"#4CAF50";eqCtx.shadowColor=point===draggedPoint?"rgba(255, 87, 34, 0.8)":"rgba(76, 175, 80, 0.8)"}eqCtx.shadowBlur=15;eqCtx.beginPath();eqCtx.arc(x,y,9,0,Math.PI*2);eqCtx.fill();eqCtx.fillStyle="#fff";eqCtx.shadowBlur=0;eqCtx.beginPath();eqCtx.arc(x,y,6,0,Math.PI*2);eqCtx.fill();eqCtx.fillStyle="rgba(0, 0, 0, 0.7)";eqCtx.fillRect(x-25,y+20,50,15);eqCtx.fillStyle="#fff";eqCtx.font="bold 10px Arial";eqCtx.textAlign="center";let freqLabel;if(point.frequency<1e3){freqLabel=`${Math.round(point.frequency)}Hz`}else{const kHzValue=point.frequency/1e3;if(kHzValue===Math.round(kHzValue)){freqLabel=`${Math.round(kHzValue)}k`}else{freqLabel=`${kHzValue.toFixed(1)}k`}}eqCtx.fillText(freqLabel,x,y+30);eqCtx.fillStyle="rgba(0, 0, 0, 0.7)";eqCtx.fillRect(x-25,y-35,50,15);eqCtx.fillStyle="#fff";eqCtx.fillText(`${point.gain>0?"+":""}${point.gain.toFixed(1)}dB`,x,y-25)}}function drawWaveform(){const width=eqCanvas.width;const height=eqCanvas.height;const padding=20;const gradient=eqCtx.createLinearGradient(0,height-padding,0,padding);gradient.addColorStop(0,"rgba(28, 0, 212, 0.9)");gradient.addColorStop(.1,"rgba(0, 191, 255, 0.95)");gradient.addColorStop(.3,"rgba(0, 210, 154, 0.9)");gradient.addColorStop(.5,"rgba(255, 196, 0, 0.85)");gradient.addColorStop(.7,"rgba(255, 0, 0, 0.85)");gradient.addColorStop(.9,"rgba(255, 0, 157, 0.85)");gradient.addColorStop(1,"rgba(170, 0, 255, 0.85)");const sliceWidth=(width-2*padding)/waveformHistorySize;for(let h=0;h<waveformHistory.length;h++){const dataArray=waveformHistory[h];const x=padding+h*sliceWidth;const alpha=.4+h/waveformHistory.length*.6;eqCtx.beginPath();eqCtx.moveTo(x,height-padding);const maxFreq=audioContext.sampleRate/2;const minLogFreq=Math.log10(20);const maxLogFreq=Math.log10(maxFreq);for(let i=0;i<dataArray.length;i++){const freq=i*maxFreq/dataArray.length;const logFreq=Math.log10(Math.max(20,freq));const normalizedLogFreq=(logFreq-minLogFreq)/(maxLogFreq-minLogFreq);const freqX=padding+normalizedLogFreq*(width-2*padding);if(freqX>=x&&freqX<=x+sliceWidth){const amplitude=dataArray[i]/255;const enhancedAmplitude=Math.pow(amplitude,.4);const ampY=height-padding-enhancedAmplitude*(height-2*padding);eqCtx.lineTo(freqX,ampY)}}eqCtx.lineTo(x+sliceWidth,height-padding);eqCtx.closePath();eqCtx.globalAlpha=alpha;eqCtx.fillStyle=gradient;eqCtx.fill();if(h>waveformHistory.length*.7){eqCtx.shadowColor="rgba(0, 255, 170, 0.8)";eqCtx.shadowBlur=10;eqCtx.fill();eqCtx.shadowBlur=0}}eqCtx.globalAlpha=1;if(waveformHistory.length>0){const latestData=waveformHistory[waveformHistory.length-1];eqCtx.strokeStyle="rgba(96, 96, 96, 1)";eqCtx.lineWidth=2;eqCtx.beginPath();const maxFreq=audioContext.sampleRate/2;const minLogFreq=Math.log10(20);const maxLogFreq=Math.log10(maxFreq);for(let i=0;i<latestData.length;i++){const freq=i*maxFreq/latestData.length;const logFreq=Math.log10(Math.max(20,freq));const normalizedLogFreq=(logFreq-minLogFreq)/(maxLogFreq-minLogFreq);const x=padding+normalizedLogFreq*(width-2*padding);const amplitude=latestData[i]/255;const enhancedAmplitude=Math.pow(amplitude,.4);const y=height-padding-enhancedAmplitude*(height-2*padding);if(i===0){eqCtx.moveTo(x,y)}else{eqCtx.lineTo(x,y)}}eqCtx.stroke()}}function startDraggingEQBand(e){if(!temporaryEffects||!temporaryEffects.eq)return;const rect=eqCanvas.getBoundingClientRect();const x=e.clientX-rect.left;const y=e.clientY-rect.top;const padding=20;const height=eqCanvas.height;for(let i=0;i<temporaryEffects.eq.length;i++){const point=temporaryEffects.eq[i];if(point.fixed)continue;const pointX=padding+Math.log10(point.frequency/20)/Math.log10(2e4/20)*(eqCanvas.width-2*padding);const pointY=height/2-point.gain/24*(height/2-padding);const distance=Math.sqrt(Math.pow(x-pointX,2)+Math.pow(y-pointY,2));if(distance<=9){isDraggingEqBand=true;draggedPoint=point;isCreatingNewPoint=false;return}}if(temporaryEffects.eq.length<MAX_EQ_POINTS){const frequency=20*Math.pow(2e4/20,(x-padding)/(eqCanvas.width-2*padding));if(frequency<=20||frequency>=2e4)return;const gain=-(y-eqCanvas.height/2)/(eqCanvas.height/2-padding)*24;const newPoint=addEQPoint(frequency,gain);isDraggingEqBand=true;draggedPoint=newPoint;isCreatingNewPoint=true}}function handleEQTouchStart(e){e.preventDefault();if(!temporaryEffects||!temporaryEffects.eq)return;const touch=e.touches[0];const rect=eqCanvas.getBoundingClientRect();const x=touch.clientX-rect.left;const y=touch.clientY-rect.top;const padding=20;const height=eqCanvas.height;for(let i=0;i<temporaryEffects.eq.length;i++){const point=temporaryEffects.eq[i];if(point.fixed)continue;const pointX=padding+Math.log10(point.frequency/20)/Math.log10(2e4/20)*(eqCanvas.width-2*padding);const pointY=height/2-point.gain/24*(height/2-padding);const distance=Math.sqrt(Math.pow(x-pointX,2)+Math.pow(y-pointY,2));if(distance<=9){isDraggingEqBand=true;draggedPoint=point;isCreatingNewPoint=false;return}}if(temporaryEffects.eq.length<MAX_EQ_POINTS){const frequency=20*Math.pow(2e4/20,(x-padding)/(eqCanvas.width-2*padding));if(frequency<=20||frequency>=2e4)return;const gain=-(y-height/2)/(height/2-padding)*24;const newPoint=addEQPoint(frequency,gain);isDraggingEqBand=true;draggedPoint=newPoint;isCreatingNewPoint=true}}function handleEQTouchMove(e){e.preventDefault();if(!isDraggingEqBand||!draggedPoint||!temporaryEffects||!temporaryEffects.eq)return;const touch=e.touches[0];const rect=eqCanvas.getBoundingClientRect();const x=touch.clientX-rect.left;const y=touch.clientY-rect.top;const padding=20;const height=eqCanvas.height;const gain=-(y-height/2)/(height/2-padding)*24;const clampedGain=Math.max(-24,Math.min(24,gain));const freq=20*Math.pow(2e4/20,(x-padding)/(eqCanvas.width-2*padding));const clampedFreq=Math.max(20,Math.min(2e4,freq));draggedPoint.gain=clampedGain;draggedPoint.frequency=clampedFreq;updateEQFiltersInRealTime();drawEQVisual()}function dragEQBand(e){if(!isDraggingEqBand||!draggedPoint||!temporaryEffects||!temporaryEffects.eq)return;const rect=eqCanvas.getBoundingClientRect();const x=e.clientX-rect.left;const y=e.clientY-rect.top;const padding=20;const height=eqCanvas.height;const gain=-(y-height/2)/(height/2-padding)*24;const clampedGain=Math.max(-24,Math.min(24,gain));const freq=20*Math.pow(2e4/20,(x-padding)/(eqCanvas.width-2*padding));const clampedFreq=Math.max(20,Math.min(2e4,freq));draggedPoint.gain=clampedGain;draggedPoint.frequency=clampedFreq;updateEQFiltersInRealTime();drawEQVisual()}function stopDraggingEQBand(){isDraggingEqBand=false;draggedPoint=null;isCreatingNewPoint=false;drawEQVisual()}function updateEQFiltersInRealTime(){if(!currentSampleForPopup||!temporaryEffects||!temporaryEffects.eq)return;const sample=currentPlaying[currentSampleForPopup];if(sample.eqLowNode)sample.eqLowNode.gain.value=0;if(sample.eqLowMidNode)sample.eqLowMidNode.gain.value=0;if(sample.eqMidNode)sample.eqMidNode.gain.value=0;if(sample.eqHighMidNode)sample.eqHighMidNode.gain.value=0;if(sample.eqHighMid2Node)sample.eqHighMid2Node.gain.value=0;if(sample.eqHighNode)sample.eqHighNode.gain.value=0;if(sample.eqVeryHighNode)sample.eqVeryHighNode.gain.value=0;const sortedEqPoints=[...temporaryEffects.eq].sort((a,b)=>a.frequency-b.frequency);if(sortedEqPoints[0]&&sortedEqPoints[0].type==="lowshelf"){if(sample.eqLowNode){sample.eqLowNode.frequency.value=sortedEqPoints[0].frequency;sample.eqLowNode.gain.value=sortedEqPoints[0].gain}}if(sortedEqPoints[sortedEqPoints.length-1]&&sortedEqPoints[sortedEqPoints.length-1].type==="highshelf"){if(sample.eqHighNode){sample.eqHighNode.frequency.value=sortedEqPoints[sortedEqPoints.length-1].frequency;sample.eqHighNode.gain.value=sortedEqPoints[sortedEqPoints.length-1].gain}}let peakingIndex=0;for(let i=0;i<sortedEqPoints.length;i++){if(sortedEqPoints[i].type==="peaking"){let filterNode;switch(peakingIndex){case 0:filterNode=sample.eqLowMidNode;break;case 1:filterNode=sample.eqMidNode;break;case 2:filterNode=sample.eqHighMidNode;break;case 3:filterNode=sample.eqHighMid2Node;break;default:break}if(filterNode){filterNode.frequency.value=sortedEqPoints[i].frequency;filterNode.gain.value=sortedEqPoints[i].gain;filterNode.Q.value=sortedEqPoints[i].q||1;peakingIndex++}}}}function updateWetDryMix(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const delayTime=parseInt(document.getElementById("delay-time").value);const reverbMix=parseInt(document.getElementById("reverb-mix").value);let wetLevel=0;if(delayTime>0){wetLevel+=.5}if(reverbMix>0){wetLevel+=reverbMix/100}wetLevel=Math.min(wetLevel,.8);if(sample.wetPathNode){sample.wetPathNode.gain.value=wetLevel}if(sample.dryPathNode){sample.dryPathNode.gain.value=1-wetLevel}}function updateDelayInRealTime(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const delayTime=parseInt(document.getElementById("delay-time").value);const feedback=parseInt(document.getElementById("delay-feedback").value);if(sample.delayNode){sample.delayNode.delayTime.value=delayTime/1e3;if(sample.delayFeedbackNode){sample.delayFeedbackNode.gain.value=feedback/100}}updateWetDryMix()}function updateReverbInRealTime(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const reverbDecay=parseFloat(document.getElementById("reverb-decay").value);const reverbPredelay=parseFloat(document.getElementById("reverb-predelay").value);const reverbDiffusion=parseFloat(document.getElementById("reverb-diffusion").value);const reverbLowcut=parseFloat(document.getElementById("reverb-lowcut").value);const reverbHighcut=parseFloat(document.getElementById("reverb-highcut").value);const reverbDamping=parseFloat(document.getElementById("reverb-damping").value);const reverbMix=parseInt(document.getElementById("reverb-mix").value);if(sample.reverbMixNode){sample.reverbMixNode.gain.value=reverbMix/100}if(reverbDecay>0){const convolver=audioContext.createConvolver();const length=audioContext.sampleRate*reverbDecay;const impulse=audioContext.createBuffer(2,length,audioContext.sampleRate);const predelaySamples=audioContext.sampleRate*(reverbPredelay/1e3);for(let channel=0;channel<2;channel++){const channelData=impulse.getChannelData(channel);for(let i=0;i<length;i++){if(i<predelaySamples){channelData[i]=0}else{const decayFactor=Math.pow(1-(i-predelaySamples)/(length-predelaySamples),2);const diffusionFactor=reverbDiffusion/100;channelData[i]=(Math.random()*2-1)*decayFactor*diffusionFactor;const dampingFactor=1-reverbDamping/100*(i/length);channelData[i]*=dampingFactor}}}convolver.buffer=impulse;if(sample.reverbNode){sample.reverbNode.disconnect()}sample.reverbNode=convolver;if(sample.wetPathNode&&sample.reverbMixNode){sample.wetPathNode.connect(convolver);convolver.connect(sample.reverbMixNode);sample.reverbMixNode.connect(sample.outputNode)}}else{if(sample.reverbNode){sample.reverbNode.disconnect();sample.reverbNode=null}}updateWetDryMix()}function updateSampleVolumeInRealTime(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const volume=parseInt(document.getElementById("sample-volume").value);document.getElementById("sample-volume-value").textContent=`${volume}%`;if(sample.gainNode&&sample.isScheduled){const gainValue=volume/100;sample.gainNode.gain.value=gainValue}}function updateSpeedInRealTime(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const speed=parseFloat(document.getElementById("speed-select").value);if(sample.source&&sample.isScheduled){let basePlaybackRate;if(sample.isLongSample){const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;basePlaybackRate=sample.loopDuration/desiredLoopDuration}else{const effectiveTempo=tempo+highTempo;const effectiveBeatDuration=60/effectiveTempo;const effectiveBarDuration=effectiveBeatDuration*4;const desiredLoopDuration=effectiveBarDuration*loopLength;basePlaybackRate=sample.loopDuration/desiredLoopDuration}let individualTempo=1;if(sample.isLongSample&&sample.effects&&sample.effects.individualTempo){individualTempo=sample.effects.individualTempo}const newPlaybackRate=basePlaybackRate*individualTempo*speed;const currentPlaybackRate=sample.source.playbackRate.value;const currentTime=audioContext.currentTime;const elapsedTime=currentTime-sample.loopStartTime;const currentPosition=elapsedTime*currentPlaybackRate%sample.loopDuration;sample.source.playbackRate.value=newPlaybackRate;sample.loopStartTime=currentTime-currentPosition/newPlaybackRate;console.log(`Sample ${currentSampleForPopup} speed updated: new rate ${newPlaybackRate}, position ${currentPosition}`)}}function updateIndividualTempoInRealTime(){if(!currentSampleForPopup)return;const sample=currentPlaying[currentSampleForPopup];const individualTempo=parseFloat(document.getElementById("individual-tempo").value);if(sample.source&&sample.isScheduled&&sample.isLongSample){const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;const basePlaybackRate=sample.loopDuration/desiredLoopDuration;const speed=sample.effects?sample.effects.speed||1:1;const newPlaybackRate=basePlaybackRate*individualTempo*speed;const currentPlaybackRate=sample.source.playbackRate.value;const currentTime=audioContext.currentTime;const elapsedTime=currentTime-sample.loopStartTime;const currentPosition=elapsedTime*currentPlaybackRate%sample.loopDuration;sample.source.playbackRate.value=newPlaybackRate;sample.loopStartTime=currentTime-currentPosition/newPlaybackRate;console.log(`Sample ${currentSampleForPopup} individual tempo updated: new rate ${newPlaybackRate}, position ${currentPosition}`)}}function initializeSpeedAndTempoControls(){const speedSelect=document.getElementById("speed-select");const individualTempoSlider=document.getElementById("individual-tempo");const individualTempoValue=document.getElementById("individual-tempo-value");const sampleVolumeSlider=document.getElementById("sample-volume");speedSelect.addEventListener("change",function(){updateSpeedInRealTime();if(temporaryEffects){temporaryEffects.speed=parseFloat(this.value)}});individualTempoSlider.addEventListener("input",function(){individualTempoValue.textContent=this.value;updateIndividualTempoInRealTime();if(temporaryEffects){temporaryEffects.individualTempo=parseFloat(this.value)}});sampleVolumeSlider.addEventListener("input",function(){updateSampleVolumeInRealTime();if(temporaryEffects){temporaryEffects.volume=parseInt(this.value)}})}function initializeEffectsForSample(sampleNumber){if(!currentPlaying[sampleNumber].isScheduled||!currentPlaying[sampleNumber].source)return;const sample=currentPlaying[sampleNumber];if(sample.outputNode){updateSampleEffects(sampleNumber);return}const sourceNode=sample.gainNode;const outputNode=audioContext.createGain();outputNode.gain.value=1;const dryPath=audioContext.createGain();dryPath.gain.value=1;const wetPath=audioContext.createGain();wetPath.gain.value=0;sample.wetPathNode=wetPath;sample.dryPathNode=dryPath;sample.outputNode=outputNode;sourceNode.connect(dryPath);sourceNode.connect(wetPath);dryPath.connect(outputNode);let lastEffectNode=wetPath;const delayNode=audioContext.createDelay(1);delayNode.delayTime.value=0;const feedbackGain=audioContext.createGain();feedbackGain.gain.value=0;lastEffectNode.connect(delayNode);delayNode.connect(feedbackGain);feedbackGain.connect(delayNode);delayNode.connect(outputNode);lastEffectNode=delayNode;sample.delayNode=delayNode;sample.delayFeedbackNode=feedbackGain;const convolver=audioContext.createConvolver();const length=audioContext.sampleRate*.1;const impulse=audioContext.createBuffer(2,length,audioContext.sampleRate);for(let channel=0;channel<2;channel++){const channelData=impulse.getChannelData(channel);for(let i=0;i<length;i++){channelData[i]=(Math.random()*2-1)*Math.pow(1-i/length,2)}}convolver.buffer=impulse;const reverbMix=audioContext.createGain();const effects=sample.effects||{};reverbMix.gain.value=effects.reverb&&effects.reverb.mix?effects.reverb.mix/100:0;lastEffectNode.connect(convolver);convolver.connect(reverbMix);reverbMix.connect(outputNode);sample.reverbNode=convolver;sample.reverbMixNode=reverbMix;const storedEffects=sample.effects||{delay:{time:0,feedback:0},reverb:{decay:0,mix:0,predelay:0,diffusion:50,lowcut:20,highcut:2e4,damping:50},eq:[{frequency:20,gain:0,q:1,type:"lowshelf",fixed:true},{frequency:2e4,gain:0,q:1,type:"highshelf",fixed:true}],volume:100,speed:1,individualTempo:1,pianoRoll:{notes:[],soundSource:"piano",gridWidth:sample.isLongSample?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}};if(storedEffects.pianoRoll&&!pianoRollData[sampleNumber]){pianoRollData[sampleNumber]=JSON.parse(JSON.stringify(storedEffects.pianoRoll))}const lowFilter=audioContext.createBiquadFilter();lowFilter.type="lowshelf";lowFilter.frequency.value=60;lowFilter.gain.value=0;const lowMidFilter=audioContext.createBiquadFilter();lowMidFilter.type="peaking";lowMidFilter.frequency.value=230;lowMidFilter.Q.value=1;lowMidFilter.gain.value=0;const midFilter=audioContext.createBiquadFilter();midFilter.type="peaking";midFilter.frequency.value=910;midFilter.Q.value=1;midFilter.gain.value=0;const highMidFilter=audioContext.createBiquadFilter();highMidFilter.type="peaking";highMidFilter.frequency.value=3e3;highMidFilter.Q.value=1;highMidFilter.gain.value=0;const highMid2Filter=audioContext.createBiquadFilter();highMid2Filter.type="peaking";highMid2Filter.frequency.value=6e3;highMid2Filter.Q.value=1;highMid2Filter.gain.value=0;const highFilter=audioContext.createBiquadFilter();highFilter.type="highshelf";highFilter.frequency.value=1e4;highFilter.gain.value=0;const veryHighFilter=audioContext.createBiquadFilter();veryHighFilter.type="highshelf";veryHighFilter.frequency.value=14e3;veryHighFilter.gain.value=0;outputNode.connect(lowFilter);lowFilter.connect(lowMidFilter);lowMidFilter.connect(midFilter);midFilter.connect(highMidFilter);highMidFilter.connect(highMid2Filter);highMid2Filter.connect(highFilter);highFilter.connect(veryHighFilter);veryHighFilter.connect(masterOutputNode);sample.eqLowNode=lowFilter;sample.eqLowMidNode=lowMidFilter;sample.eqMidNode=midFilter;sample.eqHighMidNode=highMidFilter;sample.eqHighMid2Node=highMid2Filter;sample.eqHighNode=highFilter;sample.eqVeryHighNode=veryHighFilter;if(sample.effects){updateSampleEffects(sampleNumber)}}function showEffectsPopup(sampleNumber,button){currentSampleForPopup=sampleNumber;document.getElementById("popup-sample-number").textContent=sampleNumber;const loadingIndicator=document.getElementById("piano-roll-loading");if(loadingIndicator){loadingIndicator.style.display="none"}const effects=currentPlaying[sampleNumber].effects||{delay:{time:0,feedback:0},reverb:{decay:0,mix:0,predelay:0,diffusion:50,lowcut:20,highcut:2e4,damping:50},eq:[{frequency:20,gain:0,q:1,type:"lowshelf",fixed:true},{frequency:2e4,gain:0,q:1,type:"highshelf",fixed:true}],volume:100,speed:1,individualTempo:1,pianoRoll:{notes:[],soundSource:"piano",gridWidth:sampleNumber>60?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}};originalEffects=JSON.parse(JSON.stringify(effects));temporaryEffects=JSON.parse(JSON.stringify(effects));if(effects.pianoRoll){pianoRollData[sampleNumber]=JSON.parse(JSON.stringify(effects.pianoRoll));if(pianoRollData[sampleNumber].isEnabled===undefined){pianoRollData[sampleNumber].isEnabled=false}}else if(!pianoRollData[sampleNumber]){pianoRollData[sampleNumber]={notes:[],soundSource:"piano",gridWidth:sampleNumber>60?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}}document.getElementById("sample-volume").value=temporaryEffects.volume||100;document.getElementById("sample-volume-value").textContent=`${temporaryEffects.volume||100}%`;document.getElementById("delay-time").value=temporaryEffects.delay.time;document.getElementById("delay-time-value").textContent=temporaryEffects.delay.time;document.getElementById("delay-feedback").value=temporaryEffects.delay.feedback;document.getElementById("delay-feedback-value").textContent=temporaryEffects.delay.feedback;document.getElementById("reverb-decay").value=temporaryEffects.reverb.decay;document.getElementById("reverb-decay-value").textContent=temporaryEffects.reverb.decay;document.getElementById("reverb-predelay").value=temporaryEffects.reverb.predelay;document.getElementById("reverb-predelay-value").textContent=temporaryEffects.reverb.predelay;document.getElementById("reverb-diffusion").value=temporaryEffects.reverb.diffusion;document.getElementById("reverb-diffusion-value").textContent=temporaryEffects.reverb.diffusion;document.getElementById("reverb-lowcut").value=temporaryEffects.reverb.lowcut;document.getElementById("reverb-lowcut-value").textContent=temporaryEffects.reverb.lowcut;document.getElementById("reverb-highcut").value=temporaryEffects.reverb.highcut;document.getElementById("reverb-highcut-value").textContent=temporaryEffects.reverb.highcut;document.getElementById("reverb-damping").value=temporaryEffects.reverb.damping;document.getElementById("reverb-damping-value").textContent=temporaryEffects.reverb.damping;document.getElementById("reverb-mix").value=temporaryEffects.reverb.mix;document.getElementById("reverb-mix-value").textContent=temporaryEffects.reverb.mix;document.getElementById("speed-select").value=temporaryEffects.speed||1;if(sampleNumber>60){document.getElementById("individual-tempo").value=temporaryEffects.individualTempo||1;document.getElementById("individual-tempo-value").textContent=temporaryEffects.individualTempo||1}if(temporaryEffects.pianoRoll&&temporaryEffects.pianoRoll.filters){document.getElementById("piano-roll-lowshelf").value=temporaryEffects.pianoRoll.filters.lowShelf||0;document.getElementById("piano-roll-lowshelf-value").textContent=`${temporaryEffects.pianoRoll.filters.lowShelf||0}dB`;document.getElementById("piano-roll-lowmid").value=temporaryEffects.pianoRoll.filters.lowMid||0;document.getElementById("piano-roll-lowmid-value").textContent=`${temporaryEffects.pianoRoll.filters.lowMid||0}dB`;document.getElementById("piano-roll-mid").value=temporaryEffects.pianoRoll.filters.mid||0;document.getElementById("piano-roll-mid-value").textContent=`${temporaryEffects.pianoRoll.filters.mid||0}dB`;document.getElementById("piano-roll-highmid").value=temporaryEffects.pianoRoll.filters.highMid||0;document.getElementById("piano-roll-highmid-value").textContent=`${temporaryEffects.pianoRoll.filters.highMid||0}dB`;document.getElementById("piano-roll-highshelf").value=temporaryEffects.pianoRoll.filters.highShelf||0;document.getElementById("piano-roll-highshelf-value").textContent=`${temporaryEffects.pianoRoll.filters.highShelf||0}dB`;document.getElementById("piano-roll-delay-time").value=temporaryEffects.pianoRoll.filters.delay.time||0;document.getElementById("piano-roll-delay-time-value").textContent=`${temporaryEffects.pianoRoll.filters.delay.time||0}ms`;document.getElementById("piano-roll-delay-feedback").value=temporaryEffects.pianoRoll.filters.delay.feedback||0;document.getElementById("piano-roll-delay-feedback-value").textContent=`${temporaryEffects.pianoRoll.filters.delay.feedback||0}%`}const gridRect=gridPanel.getBoundingClientRect();const popupWidth=gridRect.width;const popupHeight=gridRect.height;effectsPopup.style.left=`${(window.innerWidth-popupWidth)/2}px`;effectsPopup.style.top=`${(window.innerHeight-popupHeight)/2}px`;effectsPopup.style.width=`${popupWidth}px`;effectsPopup.style.height=`${popupHeight}px`;effectsPopup.style.display="flex";const individualTempoSection=document.querySelector(".individual-tempo-section");if(individualTempoSection){if(sampleNumber<=60){individualTempoSection.style.display="none"}else{individualTempoSection.style.display="block"}}setTimeout(()=>{initVisualEQ();initializeSpeedAndTempoControls();const pianoRollToggle=document.getElementById("piano-roll-toggle");const pianoRollContent=document.querySelector(".piano-roll-content");pianoRollToggle.replaceWith(pianoRollToggle.cloneNode(true));const newPianoRollToggle=document.getElementById("piano-roll-toggle");newPianoRollToggle.checked=pianoRollData[sampleNumber].isEnabled;if(pianoRollData[sampleNumber].isEnabled){pianoRollContent.classList.add("visible")}else{pianoRollContent.classList.remove("visible")}newPianoRollToggle.addEventListener("change",function(){if(this.checked){pianoRollContent.classList.add("visible");pianoRollData[sampleNumber].isEnabled=true;initPianoRoll();initPianoRollFilters()}else{pianoRollContent.classList.remove("visible");pianoRollData[sampleNumber].isEnabled=false;if(isPreviewingPianoRoll){stopPianoRollPreview()}}});const uploadStatus=document.getElementById("upload-status");const recordStatus=document.getElementById("record-status");uploadStatus.textContent=uploadStatusPerSample[sampleNumber]||"";recordStatus.textContent=recordStatusPerSample[sampleNumber]||"";const microphoneRecordBtn=document.getElementById("microphone-record-btn");if(microphoneRecordBtn){microphoneRecordBtn.replaceWith(microphoneRecordBtn.cloneNode(true));const newMicrophoneRecordBtn=document.getElementById("microphone-record-btn");newMicrophoneRecordBtn.addEventListener("click",function(){handleMicrophoneRecording(sampleNumber)});if(recordedBlobs[sampleNumber]){newMicrophoneRecordBtn.textContent="Record New"}else{newMicrophoneRecordBtn.textContent="Start Recording"}}const microphoneSaveBtn=document.getElementById("microphone-save-btn");if(microphoneSaveBtn){microphoneSaveBtn.replaceWith(microphoneSaveBtn.cloneNode(true));const newMicrophoneSaveBtn=document.getElementById("microphone-save-btn");newMicrophoneSaveBtn.addEventListener("click",function(){saveMicrophoneRecording(sampleNumber)});if(recordedBlobs[sampleNumber]){newMicrophoneSaveBtn.style.display="inline-block"}else{newMicrophoneSaveBtn.style.display="none"}}const microphoneDownloadBtn=document.getElementById("microphone-download-btn");if(microphoneDownloadBtn){microphoneDownloadBtn.replaceWith(microphoneDownloadBtn.cloneNode(true));const newMicrophoneDownloadBtn=document.getElementById("microphone-download-btn");newMicrophoneDownloadBtn.addEventListener("click",function(){downloadMicrophoneRecording(sampleNumber)});if(recordedBlobs[sampleNumber]){newMicrophoneDownloadBtn.style.display="inline-block"}else{newMicrophoneDownloadBtn.style.display="none"}}const microphoneDeleteBtn=document.getElementById("microphone-delete-btn");if(microphoneDeleteBtn){microphoneDeleteBtn.replaceWith(microphoneDeleteBtn.cloneNode(true));const newMicrophoneDeleteBtn=document.getElementById("microphone-delete-btn");newMicrophoneDeleteBtn.addEventListener("click",function(){deleteMicrophoneRecording(sampleNumber)});if(recordedBlobs[sampleNumber]){newMicrophoneDeleteBtn.style.display="inline-block"}else{newMicrophoneDeleteBtn.style.display="none"}}if(currentPlaying[sampleNumber]&&currentPlaying[sampleNumber].isScheduled){initWaveformVisualization()}},100)}function formatFrequency(freq){if(freq>=1e3){return`${(freq/1e3).toFixed(1)}kHz`}return`${freq}Hz`}function initPianoRollFilters(){if(!currentSampleForPopup)return;const lowShelfSlider=document.getElementById("piano-roll-lowshelf");const lowMidSlider=document.getElementById("piano-roll-lowmid");const midSlider=document.getElementById("piano-roll-mid");const highMidSlider=document.getElementById("piano-roll-highmid");const highShelfSlider=document.getElementById("piano-roll-highshelf");const delayTimeSlider=document.getElementById("piano-roll-delay-time");const delayFeedbackSlider=document.getElementById("piano-roll-delay-feedback");const lowShelfValue=document.getElementById("piano-roll-lowshelf-value");const lowMidValue=document.getElementById("piano-roll-lowmid-value");const midValue=document.getElementById("piano-roll-mid-value");const highMidValue=document.getElementById("piano-roll-highmid-value");const highShelfValue=document.getElementById("piano-roll-highshelf-value");const delayTimeValue=document.getElementById("piano-roll-delay-time-value");const delayFeedbackValue=document.getElementById("piano-roll-delay-feedback-value");lowShelfSlider.addEventListener("input",function(){lowShelfValue.textContent=`${this.value}dB`;updatePianoRollFilters()});lowMidSlider.addEventListener("input",function(){lowMidValue.textContent=`${this.value}dB`;updatePianoRollFilters()});midSlider.addEventListener("input",function(){midValue.textContent=`${this.value}dB`;updatePianoRollFilters()});highMidSlider.addEventListener("input",function(){highMidValue.textContent=`${this.value}dB`;updatePianoRollFilters()});highShelfSlider.addEventListener("input",function(){highShelfValue.textContent=`${this.value}dB`;updatePianoRollFilters()});delayTimeSlider.addEventListener("input",function(){delayTimeValue.textContent=`${this.value}ms`;updatePianoRollFilters()});delayFeedbackSlider.addEventListener("input",function(){delayFeedbackValue.textContent=`${this.value}%`;updatePianoRollFilters()})}function updatePianoRollFilters(){if(!currentSampleForPopup||!pianoRollFilterNodes.lowShelf)return;const lowShelf=parseFloat(document.getElementById("piano-roll-lowshelf").value);const lowMid=parseFloat(document.getElementById("piano-roll-lowmid").value);const mid=parseFloat(document.getElementById("piano-roll-mid").value);const highMid=parseFloat(document.getElementById("piano-roll-highmid").value);const highShelf=parseFloat(document.getElementById("piano-roll-highshelf").value);const delayTime=parseInt(document.getElementById("piano-roll-delay-time").value);const delayFeedback=parseInt(document.getElementById("piano-roll-delay-feedback").value);if(pianoRollFilterNodes.lowShelf){pianoRollFilterNodes.lowShelf.gain.value=lowShelf}if(pianoRollFilterNodes.lowMid){pianoRollFilterNodes.lowMid.gain.value=lowMid}if(pianoRollFilterNodes.mid){pianoRollFilterNodes.mid.gain.value=mid}if(pianoRollFilterNodes.highMid){pianoRollFilterNodes.highMid.gain.value=highMid}if(pianoRollFilterNodes.highShelf){pianoRollFilterNodes.highShelf.gain.value=highShelf}if(pianoRollFilterNodes.delay){pianoRollFilterNodes.delay.delayTime.value=delayTime/1e3}if(pianoRollFilterNodes.delayFeedback){pianoRollFilterNodes.delayFeedback.gain.value=delayFeedback/100}if(pianoRollData[currentSampleForPopup]){if(!pianoRollData[currentSampleForPopup].filters){pianoRollData[currentSampleForPopup].filters={}}pianoRollData[currentSampleForPopup].filters.lowShelf=lowShelf;pianoRollData[currentSampleForPopup].filters.lowMid=lowMid;pianoRollData[currentSampleForPopup].filters.mid=mid;pianoRollData[currentSampleForPopup].filters.highMid=highMid;pianoRollData[currentSampleForPopup].filters.highShelf=highShelf;pianoRollData[currentSampleForPopup].filters.delay={time:delayTime,feedback:delayFeedback}}}function handleMicrophoneRecording(sampleNumber){const microphoneRecordBtn=document.getElementById("microphone-record-btn");const microphoneSaveBtn=document.getElementById("microphone-save-btn");const microphoneDownloadBtn=document.getElementById("microphone-download-btn");const microphoneDeleteBtn=document.getElementById("microphone-delete-btn");const recordStatus=document.getElementById("record-status");if(!isMicrophoneRecording){navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{microphoneMediaStream=stream;microphoneMediaRecorder=new MediaRecorder(stream);microphoneRecordedChunks=[];microphoneMediaRecorder.ondataavailable=function(event){if(event.data.size>0){microphoneRecordedChunks.push(event.data)}};microphoneMediaRecorder.onstop=function(){const blob=new Blob(microphoneRecordedChunks,{type:"audio/wav"});recordedBlobs[sampleNumber]=blob;microphoneSaveBtn.style.display="inline-block";microphoneDownloadBtn.style.display="inline-block";microphoneDeleteBtn.style.display="inline-block";recordStatusPerSample[sampleNumber]="Recording complete!";recordStatus.textContent=recordStatusPerSample[sampleNumber];recordStatus.style.color="#7a7a7aff"};microphoneMediaRecorder.start();isMicrophoneRecording=true;microphoneRecordBtn.textContent="Stop Recording";microphoneRecordBtn.classList.add("recording");recordStatusPerSample[sampleNumber]="Recording...";recordStatus.textContent=recordStatusPerSample[sampleNumber];recordStatus.style.color="#FF9800"})["catch"](error=>{console.error("Error accessing microphone:",error);recordStatusPerSample[sampleNumber]="Error: Could not access microphone";recordStatus.textContent=recordStatusPerSample[sampleNumber];recordStatus.style.color="#F44336"})}else{if(microphoneMediaRecorder&&microphoneMediaRecorder.state!=="inactive"){microphoneMediaRecorder.stop()}if(microphoneMediaStream){microphoneMediaStream.getTracks().forEach(track=>track.stop());microphoneMediaStream=null}isMicrophoneRecording=false;microphoneRecordBtn.textContent="Record New";microphoneRecordBtn.classList.remove("recording")}}function saveMicrophoneRecording(sampleNumber){const blob=recordedBlobs[sampleNumber];if(!blob)return;const recordStatus=document.getElementById("record-status");const microphoneSaveBtn=document.getElementById("microphone-save-btn");const fileReader=new FileReader;fileReader.onload=function(){audioContext.decodeAudioData(fileReader.result).then(buffer=>{currentPlaying[sampleNumber].buffer=buffer;currentPlaying[sampleNumber].loopDuration=buffer.duration;currentPlaying[sampleNumber].bufferSampleNumber=sampleNumber;currentPlaying[sampleNumber].isCustomSample=true;const button=currentPlaying[sampleNumber].button;if(button){addCustomIndicator(button);button.classList.remove("no-sample")}if(currentPlaying[sampleNumber].isScheduled&&currentPlaying[sampleNumber].isActive){stopSample(sampleNumber);currentPlaying[sampleNumber].scheduledForNextBar=true;scheduleSampleForNextBar(sampleNumber)}recordStatusPerSample[sampleNumber]="Recording saved successfully!";recordStatus.textContent=recordStatusPerSample[sampleNumber];recordStatus.style.color="#4CAF50"})["catch"](error=>{console.error("Error decoding audio data:",error);recordStatusPerSample[sampleNumber]="Error: Invalid audio data";recordStatus.textContent=recordStatusPerSample[sampleNumber];recordStatus.style.color="#F44336"})};fileReader.readAsArrayBuffer(blob)}function addCustomIndicator(button){let customIndicator=button.querySelector(".custom-indicator");if(!customIndicator){customIndicator=document.createElement("div");customIndicator.className="custom-indicator";button.appendChild(customIndicator)}customIndicator.style.display="block"}function downloadMicrophoneRecording(sampleNumber){const blob=recordedBlobs[sampleNumber];if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`psychological-studio-recording-sample-${sampleNumber}-${(new Date).toISOString().slice(0,19).replace(/:/g,"-")}.wav`;a.click();URL.revokeObjectURL(url)}function deleteMicrophoneRecording(sampleNumber){delete recordedBlobs[sampleNumber];if(currentPlaying[sampleNumber]&&currentPlaying[sampleNumber].isCustomSample){currentPlaying[sampleNumber].isCustomSample=false;currentPlaying[sampleNumber].buffer=null;currentPlaying[sampleNumber].bufferSampleNumber=null;const button=currentPlaying[sampleNumber].button;if(button){const customIndicator=button.querySelector(".custom-indicator");if(customIndicator){customIndicator.style.display="none"}if(button.classList.contains("active")){button.classList.add("no-sample")}}if(currentPlaying[sampleNumber].isScheduled){stopSample(sampleNumber)}}const microphoneRecordBtn=document.getElementById("microphone-record-btn");const microphoneSaveBtn=document.getElementById("microphone-save-btn");const microphoneDownloadBtn=document.getElementById("microphone-download-btn");const microphoneDeleteBtn=document.getElementById("microphone-delete-btn");const recordStatus=document.getElementById("record-status");microphoneSaveBtn.style.display="none";microphoneDownloadBtn.style.display="none";microphoneDeleteBtn.style.display="none";microphoneRecordBtn.textContent="Start Recording";recordStatusPerSample[sampleNumber]="";recordStatus.textContent=""}function hideEffectsPopup(){if(isPreviewingPianoRoll){stopPianoRollPreview()}stopWaveformAnimation();if(waveformAnalyzer&&currentSampleForPopup){const sample=currentPlaying[currentSampleForPopup];if(sample.eqVeryHighNode){sample.eqVeryHighNode.disconnect();sample.eqVeryHighNode.connect(masterOutputNode)}else if(sample.outputNode){sample.outputNode.disconnect();sample.outputNode.connect(masterOutputNode)}else if(sample.gainNode){sample.gainNode.disconnect();sample.gainNode.connect(masterOutputNode)}waveformAnalyzer=null}if(isMicrophoneRecording){if(microphoneMediaRecorder&&microphoneMediaRecorder.state!=="inactive"){microphoneMediaRecorder.stop()}if(microphoneMediaStream){microphoneMediaStream.getTracks().forEach(track=>track.stop());microphoneMediaStream=null}isMicrophoneRecording=false}effectsPopup.style.display="none";currentSampleForPopup=null;originalEffects=null;temporaryEffects=null}function resetEffectsSettings(){if(!currentSampleForPopup)return;temporaryEffects={delay:{time:0,feedback:0},reverb:{decay:0,mix:0,predelay:0,diffusion:50,lowcut:20,highcut:2e4,damping:50},eq:[{frequency:20,gain:0,q:1,type:"lowshelf",fixed:true},{frequency:2e4,gain:0,q:1,type:"highshelf",fixed:true}],volume:100,speed:1,individualTempo:1,pianoRoll:{notes:[],soundSource:"piano",gridWidth:currentSampleForPopup>60?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}};document.getElementById("sample-volume").value=temporaryEffects.volume;document.getElementById("sample-volume-value").textContent=`${temporaryEffects.volume}%`;document.getElementById("delay-time").value=temporaryEffects.delay.time;document.getElementById("delay-time-value").textContent=temporaryEffects.delay.time;document.getElementById("delay-feedback").value=temporaryEffects.delay.feedback;document.getElementById("delay-feedback-value").textContent=temporaryEffects.delay.feedback;document.getElementById("reverb-decay").value=temporaryEffects.reverb.decay;document.getElementById("reverb-decay-value").textContent=temporaryEffects.reverb.decay;document.getElementById("reverb-predelay").value=temporaryEffects.reverb.predelay;document.getElementById("reverb-predelay-value").textContent=temporaryEffects.reverb.predelay;document.getElementById("reverb-diffusion").value=temporaryEffects.reverb.diffusion;document.getElementById("reverb-diffusion-value").textContent=temporaryEffects.reverb.diffusion;document.getElementById("reverb-lowcut").value=temporaryEffects.reverb.lowcut;document.getElementById("reverb-lowcut-value").textContent=temporaryEffects.reverb.lowcut;document.getElementById("reverb-highcut").value=temporaryEffects.reverb.highcut;document.getElementById("reverb-highcut-value").textContent=temporaryEffects.reverb.highcut;document.getElementById("reverb-damping").value=temporaryEffects.reverb.damping;document.getElementById("reverb-damping-value").textContent=temporaryEffects.reverb.damping;document.getElementById("reverb-mix").value=temporaryEffects.reverb.mix;document.getElementById("reverb-mix-value").textContent=temporaryEffects.reverb.mix;document.getElementById("speed-select").value=temporaryEffects.speed;const individualTempoSection=document.querySelector(".individual-tempo-section");if(individualTempoSection&&individualTempoSection.style.display!=="none"){document.getElementById("individual-tempo").value=temporaryEffects.individualTempo;document.getElementById("individual-tempo-value").textContent=temporaryEffects.individualTempo}const pianoRollToggle=document.getElementById("piano-roll-toggle");const pianoRollContent=document.querySelector(".piano-roll-content");if(pianoRollToggle){pianoRollToggle.checked=false}if(pianoRollContent){pianoRollContent.classList.remove("visible")}document.getElementById("piano-roll-lowshelf").value=temporaryEffects.pianoRoll.filters.lowShelf;document.getElementById("piano-roll-lowshelf-value").textContent=`${temporaryEffects.pianoRoll.filters.lowShelf}dB`;document.getElementById("piano-roll-lowmid").value=temporaryEffects.pianoRoll.filters.lowMid;document.getElementById("piano-roll-lowmid-value").textContent=`${temporaryEffects.pianoRoll.filters.lowMid}dB`;document.getElementById("piano-roll-mid").value=temporaryEffects.pianoRoll.filters.mid;document.getElementById("piano-roll-mid-value").textContent=`${temporaryEffects.pianoRoll.filters.mid}dB`;document.getElementById("piano-roll-highmid").value=temporaryEffects.pianoRoll.filters.highMid;document.getElementById("piano-roll-highmid-value").textContent=`${temporaryEffects.pianoRoll.filters.highMid}dB`;document.getElementById("piano-roll-highshelf").value=temporaryEffects.pianoRoll.filters.highShelf;document.getElementById("piano-roll-highshelf-value").textContent=`${temporaryEffects.pianoRoll.filters.highShelf}dB`;document.getElementById("piano-roll-delay-time").value=temporaryEffects.pianoRoll.filters.delay.time;document.getElementById("piano-roll-delay-time-value").textContent=`${temporaryEffects.pianoRoll.filters.delay.time}ms`;document.getElementById("piano-roll-delay-feedback").value=temporaryEffects.pianoRoll.filters.delay.feedback;document.getElementById("piano-roll-delay-feedback-value").textContent=`${temporaryEffects.pianoRoll.filters.delay.feedback}%`;if(currentSampleForPopup){const sample=currentPlaying[currentSampleForPopup];if(sample.eqLowNode)sample.eqLowNode.gain.value=0;if(sample.eqLowMidNode)sample.eqLowMidNode.gain.value=0;if(sample.eqMidNode)sample.eqMidNode.gain.value=0;if(sample.eqHighMidNode)sample.eqHighMidNode.gain.value=0;if(sample.eqHighMid2Node)sample.eqHighMid2Node.gain.value=0;if(sample.eqHighNode)sample.eqHighNode.gain.value=0;if(sample.eqVeryHighNode)sample.eqVeryHighNode.gain.value=0}updateSampleVolumeInRealTime();updateDelayInRealTime();updateReverbInRealTime();updateSpeedInRealTime();updateIndividualTempoInRealTime();drawEQVisual();initPianoRoll()}async function applyEffectsSettings(){if(!currentSampleForPopup)return;const loadingIndicator=document.getElementById("piano-roll-loading");if(loadingIndicator){loadingIndicator.style.display="block"}try{applyPianoRollSettings();if(pianoRollData[currentSampleForPopup]&&pianoRollData[currentSampleForPopup].notes&&pianoRollData[currentSampleForPopup].notes.length>0){await savePianoRollAsSampleForCurrentButton()}currentPlaying[currentSampleForPopup].effects=JSON.parse(JSON.stringify(temporaryEffects));hideEffectsPopup()}catch(error){console.error("Error applying effects settings:",error);if(loadingIndicator){loadingIndicator.style.display="none"}const uploadStatus=document.getElementById("upload-status");if(uploadStatus){uploadStatus.textContent="Error saving piano roll. Please try again.";uploadStatus.style.color="#F44336"}}}function handleSampleUpload(event){if(!currentSampleForPopup)return;const file=event.target.files[0];if(!file)return;if(!file.type.startsWith("audio/")){uploadStatusPerSample[currentSampleForPopup]="Error: Please select an audio file";const uploadStatus=document.getElementById("upload-status");uploadStatus.textContent=uploadStatusPerSample[currentSampleForPopup];uploadStatus.style.color="#F44336";return}const uploadStatus=document.getElementById("upload-status");uploadStatusPerSample[currentSampleForPopup]="Uploading...";uploadStatus.textContent=uploadStatusPerSample[currentSampleForPopup];uploadStatus.style.color="";const reader=new FileReader;reader.onload=function(e){audioContext.decodeAudioData(e.target.result).then(buffer=>{currentPlaying[currentSampleForPopup].buffer=buffer;currentPlaying[currentSampleForPopup].loopDuration=buffer.duration;currentPlaying[currentSampleForPopup].bufferSampleNumber=currentSampleForPopup;currentPlaying[currentSampleForPopup].isCustomSample=true;uploadedFileNames[currentSampleForPopup]=file.name;const button=currentPlaying[currentSampleForPopup].button;if(button){addCustomIndicator(button);button.classList.remove("no-sample")}if(currentPlaying[currentSampleForPopup].isScheduled&&currentPlaying[currentSampleForPopup].isActive){stopSample(currentSampleForPopup);currentPlaying[currentSampleForPopup].scheduledForNextBar=true;scheduleSampleForNextBar(currentSampleForPopup)}uploadStatusPerSample[currentSampleForPopup]=`Upload successful: ${file.name}`;uploadStatus.textContent=uploadStatusPerSample[currentSampleForPopup];uploadStatus.style.color="#4CAF50"})["catch"](error=>{console.error("Error decoding audio data:",error);uploadStatusPerSample[currentSampleForPopup]="Error: Invalid audio file";uploadStatus.textContent=uploadStatusPerSample[currentSampleForPopup];uploadStatus.style.color="#F44336"})};reader.onerror=function(){uploadStatusPerSample[currentSampleForPopup]="Error reading file";uploadStatus.textContent=uploadStatusPerSample[currentSampleForPopup];uploadStatus.style.color="#F44336"};reader.readAsArrayBuffer(file)}function updateSampleEffects(sampleNumber){if(!currentPlaying[sampleNumber].isScheduled||!currentPlaying[sampleNumber].source)return;const effects=currentPlaying[sampleNumber].effects;const sample=currentPlaying[sampleNumber];if(!sample.outputNode){initializeEffectsForSample(sampleNumber);return}if(sample.gainNode&&effects.volume!==undefined){const gainValue=effects.volume/100;sample.gainNode.gain.value=gainValue}if(sample.delayNode){sample.delayNode.delayTime.value=effects.delay.time/1e3;if(sample.delayFeedbackNode){sample.delayFeedbackNode.gain.value=effects.delay.feedback/100}}if(sample.reverbMixNode){sample.reverbMixNode.gain.value=effects.reverb.mix/100}if(effects.reverb.decay>0){const convolver=audioContext.createConvolver();const length=audioContext.sampleRate*effects.reverb.decay;const impulse=audioContext.createBuffer(2,length,audioContext.sampleRate);const predelaySamples=audioContext.sampleRate*(effects.reverb.predelay/1e3);for(let channel=0;channel<2;channel++){const channelData=impulse.getChannelData(channel);for(let i=0;i<length;i++){if(i<predelaySamples){channelData[i]=0}else{const decayFactor=Math.pow(1-(i-predelaySamples)/(length-predelaySamples),2);const diffusionFactor=effects.reverb.diffusion/100;channelData[i]=(Math.random()*2-1)*decayFactor*diffusionFactor;const dampingFactor=1-effects.reverb.damping/100*(i/length);channelData[i]*=dampingFactor}}}convolver.buffer=impulse;if(sample.reverbNode){sample.reverbNode.disconnect()}sample.reverbNode=convolver;if(sample.wetPathNode&&sample.reverbMixNode){sample.wetPathNode.connect(convolver);convolver.connect(sample.reverbMixNode);sample.reverbMixNode.connect(sample.outputNode)}}else{if(sample.reverbNode){sample.reverbNode.disconnect();sample.reverbNode=null}}if(sample.eqLowNode){sample.eqLowNode.gain.value=0;sample.eqLowMidNode.gain.value=0;sample.eqMidNode.gain.value=0;sample.eqHighMidNode.gain.value=0;sample.eqHighMid2Node.gain.value=0;sample.eqHighNode.gain.value=0;sample.eqVeryHighNode.gain.value=0;if(effects.eq&&effects.eq.length>0){const sortedEqPoints=[...effects.eq].sort((a,b)=>a.frequency-b.frequency);if(sortedEqPoints[0]&&sortedEqPoints[0].type==="lowshelf"){sample.eqLowNode.frequency.value=sortedEqPoints[0].frequency;sample.eqLowNode.gain.value=sortedEqPoints[0].gain}if(sortedEqPoints[sortedEqPoints.length-1]&&sortedEqPoints[sortedEqPoints.length-1].type==="highshelf"){sample.eqHighNode.frequency.value=sortedEqPoints[sortedEqPoints.length-1].frequency;sample.eqHighNode.gain.value=sortedEqPoints[sortedEqPoints.length-1].gain}let peakingIndex=0;for(let i=0;i<sortedEqPoints.length;i++){if(sortedEqPoints[i].type==="peaking"){let filterNode;switch(peakingIndex){case 0:filterNode=sample.eqLowMidNode;break;case 1:filterNode=sample.eqMidNode;break;case 2:filterNode=sample.eqHighMidNode;break;case 3:filterNode=sample.eqHighMid2Node;break;default:break}if(filterNode){filterNode.frequency.value=sortedEqPoints[i].frequency;filterNode.gain.value=sortedEqPoints[i].gain;filterNode.Q.value=sortedEqPoints[i].q||1;peakingIndex++}}}}}let wetLevel=0;if(effects.delay.time>0){wetLevel+=.5}if(effects.reverb.mix>0){wetLevel+=effects.reverb.mix/100}wetLevel=Math.min(wetLevel,.8);if(sample.wetPathNode){sample.wetPathNode.gain.value=wetLevel}if(sample.dryPathNode){sample.dryPathNode.gain.value=1-wetLevel}if(sample.source&&effects.speed){let basePlaybackRate;if(sample.isLongSample){const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;basePlaybackRate=sample.loopDuration/desiredLoopDuration}else{const effectiveTempo=tempo+highTempo;const effectiveBeatDuration=60/effectiveTempo;const effectiveBarDuration=effectiveBeatDuration*4;const desiredLoopDuration=effectiveBarDuration*loopLength;basePlaybackRate=sample.loopDuration/desiredLoopDuration}let individualTempo=1;if(sample.isLongSample&&effects.individualTempo){individualTempo=effects.individualTempo}const newPlaybackRate=basePlaybackRate*individualTempo*effects.speed;const currentPlaybackRate=sample.source.playbackRate.value;const currentTime=audioContext.currentTime;const elapsedTime=currentTime-sample.loopStartTime;const currentPosition=elapsedTime*currentPlaybackRate%sample.loopDuration;sample.source.playbackRate.value=newPlaybackRate;sample.loopStartTime=currentTime-currentPosition/newPlaybackRate}if(effects.pianoRoll&&effects.pianoRoll.notes.length>0){pianoRollData[sampleNumber]=JSON.parse(JSON.stringify(effects.pianoRoll))}if(currentSampleForPopup===sampleNumber&&waveformAnalyzer){const sample=currentPlaying[sampleNumber];if(sample.eqVeryHighNode){sample.eqVeryHighNode.disconnect();sample.eqVeryHighNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}else if(sample.outputNode){sample.outputNode.disconnect();sample.outputNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}else if(sample.gainNode){sample.gainNode.disconnect();sample.gainNode.connect(waveformAnalyzer);waveformAnalyzer.connect(masterOutputNode)}}}function setupPopupEventListeners(popup){const closeBtn=popup.querySelector(".popup-close-btn");const acceptBtn=popup.querySelector(".popup-accept-btn");const resetBtn=popup.querySelector(".popup-reset-btn");if(closeBtn){closeBtn.addEventListener("click",function(){if(currentSampleForPopup){currentPlaying[currentSampleForPopup].effects=JSON.parse(JSON.stringify(originalEffects));if(currentPlaying[currentSampleForPopup].isScheduled&&currentPlaying[currentSampleForPopup].isActive){updateSampleEffects(currentSampleForPopup)}}hideEffectsPopup()})}if(acceptBtn){acceptBtn.addEventListener("click",async function(){await applyEffectsSettings()})}if(resetBtn){resetBtn.addEventListener("click",resetEffectsSettings)}}setupPopupEventListeners(effectsPopup);document.getElementById("sample-upload").addEventListener("change",handleSampleUpload);document.getElementById("delay-time").addEventListener("input",function(){document.getElementById("delay-time-value").textContent=this.value;updateDelayInRealTime();if(temporaryEffects){temporaryEffects.delay.time=parseInt(this.value)}});document.getElementById("delay-feedback").addEventListener("input",function(){document.getElementById("delay-feedback-value").textContent=this.value;updateDelayInRealTime();if(temporaryEffects){temporaryEffects.delay.feedback=parseInt(this.value)}});document.getElementById("reverb-decay").addEventListener("input",function(){document.getElementById("reverb-decay-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.decay=parseFloat(this.value)}});document.getElementById("reverb-predelay").addEventListener("input",function(){document.getElementById("reverb-predelay-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.predelay=parseFloat(this.value)}});document.getElementById("reverb-diffusion").addEventListener("input",function(){document.getElementById("reverb-diffusion-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.diffusion=parseFloat(this.value)}});document.getElementById("reverb-lowcut").addEventListener("input",function(){document.getElementById("reverb-lowcut-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.lowcut=parseFloat(this.value)}});document.getElementById("reverb-highcut").addEventListener("input",function(){document.getElementById("reverb-highcut-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.highcut=parseFloat(this.value)}});document.getElementById("reverb-damping").addEventListener("input",function(){document.getElementById("reverb-damping-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.damping=parseFloat(this.value)}});document.getElementById("reverb-mix").addEventListener("input",function(){document.getElementById("reverb-mix-value").textContent=this.value;updateReverbInRealTime();if(temporaryEffects){temporaryEffects.reverb.mix=parseInt(this.value)}});const highTempoSlider=document.querySelector(".high-tempo-slider");const highTempoDisplay=document.querySelector(".high-tempo-display");const longLoopTempoSlider=document.querySelector(".long-loop-tempo-slider");const longLoopTempoDisplay=document.querySelector(".long-loop-tempo-display");const volumeControlsContainer=document.querySelector(".volume-controls");for(let group=0;group<10;group++){const volumeControl=document.createElement("div");volumeControl.className=`volume-control group-${group}`;const volumeLabel=document.createElement("label");volumeLabel.textContent=`${group}: `;const volumeSlider=document.createElement("input");volumeSlider.type="range";volumeSlider.min="0";volumeSlider.max="100";volumeSlider.value="80";volumeSlider.step="1";volumeSlider.className=`volume-slider`;volumeSlider.id=`volumeSlider${group}`;const volumeValue=document.createElement("span");volumeValue.className="volume-value";volumeValue.textContent="80%";volumeValue.id=`volumeValue${group}`;volumeControl.appendChild(volumeLabel);volumeControl.appendChild(volumeSlider);volumeControl.appendChild(volumeValue);volumeControlsContainer.appendChild(volumeControl);volumeSlider.addEventListener("input",function(){const volume=this.value;volumeValue.textContent=`${volume}%`;for(let i=1;i<=100;i++){if(currentPlaying[i]&&currentPlaying[i].gainNode&&Math.floor((i-1)/10)===group){currentPlaying[i].gainNode.gain.value=volume/100;currentPlaying[i].volume=volume/100}}})}for(let i=1;i<=100;i++){const button=document.createElement("button");button.className="audio-button";button.textContent=i;button.id=`but${i}`;button.style.position="relative";const loopIndicator=document.createElement("div");loopIndicator.className="loop-indicator";button.appendChild(loopIndicator);const customIndicator=document.createElement("div");customIndicator.className="custom-indicator";customIndicator.style.display="none";button.appendChild(customIndicator);const group=Math.floor((i-1)/10);button.classList.add(`group-${group}`);if(!currentPlaying[i]){currentPlaying[i]={button:null,buffer:null,source:null,gainNode:null,loopDuration:null,sampleNumber:null,isScheduled:false,startTime:0,scheduledForNextBar:false,isLongSample:i>60,nextLoopTime:0,scheduledTimeout:null,loopStartTime:0,originalTempo:tempo,volume:.8,bufferSampleNumber:null,isActive:false,tempoChangeTime:0,positionAtTempoChange:0,masterStartBar:0,masterStartOffset:0,barGridAligned:false,isCustomSample:false,effects:{delay:{time:0,feedback:0},reverb:{decay:0,mix:0,predelay:0,diffusion:50,lowcut:20,highcut:2e4,damping:50},eq:[{frequency:20,gain:0,q:1,type:"lowshelf",fixed:true},{frequency:2e4,gain:0,q:1,type:"highshelf",fixed:true}],volume:100,speed:1,individualTempo:1,pianoRoll:{notes:[],soundSource:"piano",gridWidth:i>60?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}},delayNode:null,delayFeedbackNode:null,reverbNode:null,reverbMixNode:null,wetPathNode:null,dryPathNode:null,outputNode:null,eqLowNode:null,eqLowMidNode:null,eqMidNode:null,eqHighMidNode:null,eqHighMid2Node:null,eqHighNode:null,eqVeryHighNode:null}}button.addEventListener("click",function(){const group=Math.floor((i-1)/10);if(currentPlaying[i].button===button){if(button.classList.contains("no-sample")){button.classList.remove("active","no-sample");currentPlaying[i].isActive=false;currentPlaying[i].scheduledForNextBar=false;currentPlaying[i].button=null}else if(currentPlaying[i].isScheduled){stopSample(i);button.classList.remove("active","no-sample");currentPlaying[i].isActive=false;button.classList.remove("loading")}else{button.classList.add("active");currentPlaying[i].isActive=true;currentPlaying[i].scheduledForNextBar=true;addIndicatorsForActiveSample(button,i);if(currentPlaying[i].buffer&&isPlaying){button.classList.remove("no-sample");scheduleSampleForNextBar(i)}else{button.classList.add("no-sample")}}}else{for(let j=1;j<=100;j++){if(Math.floor((j-1)/10)===group&&currentPlaying[j].button){currentPlaying[j].button.classList.remove("active","no-sample","loading","error");stopSample(j);currentPlaying[j].isActive=false;currentPlaying[j].scheduledForNextBar=false;currentPlaying[j].button=null}}currentPlaying[i].button=button;currentPlaying[i].sampleNumber=i;currentPlaying[i].isLongSample=i>60;currentPlaying[i].originalTempo=tempo;button.classList.add("active");currentPlaying[i].isActive=true;currentPlaying[i].scheduledForNextBar=true;currentPlaying[i].barGridAligned=false;addIndicatorsForActiveSample(button,i);if(currentPlaying[i].buffer){button.classList.remove("no-sample");if(isPlaying){scheduleSampleForNextBar(i)}}else{button.classList.add("no-sample");loadAudio(i,i)}}});button.addEventListener("contextmenu",function(e){e.preventDefault();showEffectsPopup(i,button)});button.addEventListener("touchstart",function(e){isLongPress=false;longPressTimer=setTimeout(function(){isLongPress=true;showEffectsPopup(i,button)},500)});button.addEventListener("touchend",function(e){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null}if(isLongPress){e.preventDefault();isLongPress=false}});button.addEventListener("touchmove",function(e){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null}});buttonGrid.appendChild(button)}function addIndicatorsForActiveSample(button,sampleNumber){if(currentPlaying[sampleNumber]&&currentPlaying[sampleNumber].isCustomSample){addCustomIndicator(button)}}function setCustomIndicatorVisibility(button,visible){let customIndicator=button.querySelector(".custom-indicator");if(customIndicator){customIndicator.style.display=visible?"block":"none"}}const loopButtons=document.querySelectorAll(".loop-button");loopButtons.forEach(button=>{button.addEventListener("click",function(){const isLongLoopButton=button.classList.contains("long-loop-button");const buttonsToClear=isLongLoopButton?document.querySelectorAll(".long-loop-button"):document.querySelectorAll(".loop-button:not(.long-loop-button)");buttonsToClear.forEach(btn=>btn.classList.remove("active"));this.classList.add("active");const newLoopLength=parseInt(this.dataset.loop||this.dataset.longLoop);if(isNaN(newLoopLength)||newLoopLength<=0){console.error("Invalid loop length value:",this.dataset.loop||this.dataset.longLoop);return}if(isLongLoopButton){const newLongLoopLength=newLoopLength*4;longLoopLength=newLongLoopLength;if(isPlaying){for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive&&currentPlaying[i].isScheduled&&currentPlaying[i].isLongSample){updateLongSampleLoop(i)}}}console.log(`Long sample loop length set to ${longLoopLength} bars (double of ${newLoopLength})`)}else{loopLength=newLoopLength;if(isPlaying){for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive&&currentPlaying[i].isScheduled&&!currentPlaying[i].isLongSample){updateDrumSampleLoop(i)}}}console.log(`Loop length set to ${loopLength} bars`)}})});const defaultLoopButton=document.querySelector('.loop-button[data-loop="1"]');if(defaultLoopButton){defaultLoopButton.classList.add("active")}const defaultLongLoopButton=document.querySelector('.long-loop-button[data-long-loop="1"]');if(defaultLongLoopButton){defaultLongLoopButton.classList.add("active")}function loadAudio(sampleNumber,index){if(!audioContext){console.error("Audio context not initialized");return}if(currentPlaying[index].button){currentPlaying[index].button.classList.add("loading")}const audio=new Audio;audio.addEventListener("error",function(e){console.error(`Error loading audio for sample ${sampleNumber}:`,e);if(currentPlaying[index].button){currentPlaying[index].button.classList.remove("loading");currentPlaying[index].button.classList.add("error");if(currentPlaying[index].button.classList.contains("active")){currentPlaying[index].button.classList.add("no-sample")}}loadFallbackAudio(index)});try{audio.src=`./mykicks/${sampleNumber}.wav`}catch(e){console.error(`Error setting audio source for sample ${sampleNumber}:`,e);loadFallbackAudio(index);return}audio.addEventListener("canplaythrough",function(){fetch(audio.src).then(response=>{if(!response.ok){throw new Error(`HTTP error! status: ${response.status}`)}return response.arrayBuffer()}).then(arrayBuffer=>{if(!audioContext){throw new Error("Audio context not available")}return audioContext.decodeAudioData(arrayBuffer)}).then(audioBuffer=>{currentPlaying[index].buffer=audioBuffer;currentPlaying[index].loopDuration=audioBuffer.duration;currentPlaying[index].bufferSampleNumber=sampleNumber;if(currentPlaying[index].button){currentPlaying[index].button.classList.remove("loading","no-sample")}if(isPlaying&&currentPlaying[index].scheduledForNextBar&&currentPlaying[index].isActive){if(currentPlaying[index].scheduledTimeout){clearTimeout(currentPlaying[index].scheduledTimeout);currentPlaying[index].scheduledTimeout=null}scheduleSampleForNextBar(index)}})["catch"](e=>{console.error("Error decoding audio data:",e);if(currentPlaying[index].button){currentPlaying[index].button.classList.remove("loading");currentPlaying[index].button.classList.add("error");if(currentPlaying[index].button.classList.contains("active")){currentPlaying[index].button.classList.add("no-sample")}}loadFallbackAudio(index)})});audio.load()}function loadFallbackAudio(index){if(!audioContext)return;const sampleRate=audioContext.sampleRate;const duration=.5;const buffer=audioContext.createBuffer(1,sampleRate*duration,sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++){data[i]=Math.sin(2*Math.PI*440*i/sampleRate)*.3}currentPlaying[index].buffer=buffer;currentPlaying[index].loopDuration=duration;currentPlaying[index].bufferSampleNumber=index;if(currentPlaying[index].button){currentPlaying[index].button.classList.remove("loading","error");currentPlaying[index].button.classList.add("no-sample")}if(isPlaying&&currentPlaying[index].scheduledForNextBar&&currentPlaying[index].isActive){if(currentPlaying[index].scheduledTimeout){clearTimeout(currentPlaying[index].scheduledTimeout);currentPlaying[index].scheduledTimeout=null}scheduleSampleForNextBar(index)}}function updateMasterBarGrid(){if(!audioContext)return;const currentTime=audioContext.currentTime;const currentBarProgress=(currentTime-masterBarGrid.startTime)/masterBarGrid.duration;const effectiveTempo=tempo+highTempo;const newBarDuration=60/effectiveTempo*4;if(!isFinite(newBarDuration)||newBarDuration<=0){console.error("Invalid bar duration:",newBarDuration);return}masterBarGrid.startTime=currentTime-currentBarProgress*newBarDuration;masterBarGrid.duration=newBarDuration;masterBarGrid.nextStartTime=masterBarGrid.startTime+masterBarGrid.duration;console.log(`Master bar grid updated: bar progress ${currentBarProgress}, new duration ${newBarDuration}`)}function updateDrumSampleTempo(sampleNumber){if(!currentPlaying[sampleNumber].source||currentPlaying[sampleNumber].isLongSample)return;const sample=currentPlaying[sampleNumber];const currentTime=audioContext.currentTime;const effectiveTempo=tempo+highTempo;const effectiveBeatDuration=60/effectiveTempo;const effectiveBarDuration=effectiveBeatDuration*4;const desiredLoopDuration=effectiveBarDuration*loopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for drum sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration});return}const basePlaybackRate=sample.loopDuration/desiredLoopDuration;const effects=sample.effects||{};const speed=effects.speed||1;const newPlaybackRate=basePlaybackRate*speed;const currentPlaybackRate=sample.source.playbackRate.value;const elapsedTime=currentTime-sample.loopStartTime;const currentPosition=elapsedTime*currentPlaybackRate%sample.loopDuration;sample.source.playbackRate.value=newPlaybackRate;sample.loopStartTime=currentTime-currentPosition/newPlaybackRate;console.log(`Sample ${sampleNumber} tempo updated: new rate ${newPlaybackRate}, position ${currentPosition}`)}function updateLongSampleTempo(sampleNumber){if(!currentPlaying[sampleNumber].source||!currentPlaying[sampleNumber].isLongSample)return;const sample=currentPlaying[sampleNumber];const currentTime=audioContext.currentTime;const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for long sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration});return}const basePlaybackRate=sample.loopDuration/desiredLoopDuration;const effects=sample.effects||{};const individualTempo=effects.individualTempo||1;const speed=effects.speed||1;const newPlaybackRate=basePlaybackRate*individualTempo*speed;const currentPlaybackRate=sample.source.playbackRate.value;const elapsedTime=currentTime-sample.loopStartTime;const currentPosition=elapsedTime*currentPlaybackRate%sample.loopDuration;sample.source.playbackRate.value=newPlaybackRate;sample.loopStartTime=currentTime-currentPosition/newPlaybackRate;console.log(`Sample ${sampleNumber} long tempo updated: new rate ${newPlaybackRate}, position ${currentPosition}`)}function scheduleSampleForNextBar(sampleNumber){if(!currentPlaying[sampleNumber].buffer||!currentPlaying[sampleNumber].scheduledForNextBar)return;const nextBarTime=masterBarGrid.nextStartTime;const currentTime=audioContext.currentTime;const timeUntilNextBar=(nextBarTime-currentTime)*1e3;if(currentPlaying[sampleNumber].scheduledTimeout){clearTimeout(currentPlaying[sampleNumber].scheduledTimeout)}currentPlaying[sampleNumber].scheduledTimeout=setTimeout(()=>{if(currentPlaying[sampleNumber].scheduledForNextBar&&currentPlaying[sampleNumber].isActive){playSampleAtTime(sampleNumber,audioContext.currentTime);currentPlaying[sampleNumber].barGridAligned=true}currentPlaying[sampleNumber].scheduledTimeout=null},Math.max(0,timeUntilNextBar))}function playSampleAtTime(sampleNumber,startTime){if(!currentPlaying[sampleNumber].buffer||!currentPlaying[sampleNumber].scheduledForNextBar)return;if(currentPlaying[sampleNumber].source){try{if(currentPlaying[sampleNumber].isScheduled){currentPlaying[sampleNumber].source.stop()}currentPlaying[sampleNumber].source.disconnect();currentPlaying[sampleNumber].source=null;currentPlaying[sampleNumber].gainNode=null;if(currentPlaying[sampleNumber].delayNode){currentPlaying[sampleNumber].delayNode.disconnect();currentPlaying[sampleNumber].delayNode=null}if(currentPlaying[sampleNumber].delayFeedbackNode){currentPlaying[sampleNumber].delayFeedbackNode.disconnect();currentPlaying[sampleNumber].delayFeedbackNode=null}if(currentPlaying[sampleNumber].reverbNode){currentPlaying[sampleNumber].reverbNode.disconnect();currentPlaying[sampleNumber].reverbNode=null}if(currentPlaying[sampleNumber].reverbMixNode){currentPlaying[sampleNumber].reverbMixNode.disconnect();currentPlaying[sampleNumber].reverbMixNode=null}if(currentPlaying[sampleNumber].wetPathNode){currentPlaying[sampleNumber].wetPathNode.disconnect();currentPlaying[sampleNumber].wetPathNode=null}if(currentPlaying[sampleNumber].dryPathNode){currentPlaying[sampleNumber].dryPathNode.disconnect();currentPlaying[sampleNumber].dryPathNode=null}if(currentPlaying[sampleNumber].outputNode){currentPlaying[sampleNumber].outputNode.disconnect();currentPlaying[sampleNumber].outputNode=null}if(currentPlaying[sampleNumber].eqLowNode){currentPlaying[sampleNumber].eqLowNode.disconnect();currentPlaying[sampleNumber].eqLowNode=null}if(currentPlaying[sampleNumber].eqLowMidNode){currentPlaying[sampleNumber].eqLowMidNode.disconnect();currentPlaying[sampleNumber].eqLowMidNode=null}if(currentPlaying[sampleNumber].eqMidNode){currentPlaying[sampleNumber].eqMidNode.disconnect();currentPlaying[sampleNumber].eqMidNode=null}if(currentPlaying[sampleNumber].eqHighMidNode){currentPlaying[sampleNumber].eqHighMidNode.disconnect();currentPlaying[sampleNumber].eqHighMidNode=null}if(currentPlaying[sampleNumber].eqHighMid2Node){currentPlaying[sampleNumber].eqHighMid2Node.disconnect();currentPlaying[sampleNumber].eqHighMid2Node=null}if(currentPlaying[sampleNumber].eqHighNode){currentPlaying[sampleNumber].eqHighNode.disconnect();currentPlaying[sampleNumber].eqHighNode=null}if(currentPlaying[sampleNumber].eqVeryHighNode){currentPlaying[sampleNumber].eqVeryHighNode.disconnect();currentPlaying[sampleNumber].eqVeryHighNode=null}}catch(e){console.warn("Error stopping audio source:",e);currentPlaying[sampleNumber].source=null;currentPlaying[sampleNumber].gainNode=null}}const source=audioContext.createBufferSource();source.buffer=currentPlaying[sampleNumber].buffer;const gainNode=audioContext.createGain();const effects=currentPlaying[sampleNumber].effects||{};const volumePercent=effects.volume||100;gainNode.gain.value=volumePercent/100;source.connect(gainNode);currentPlaying[sampleNumber].source=source;currentPlaying[sampleNumber].gainNode=gainNode;currentPlaying[sampleNumber].startTime=startTime;currentPlaying[sampleNumber].isScheduled=true;currentPlaying[sampleNumber].loopStartTime=startTime;currentPlaying[sampleNumber].tempoChangeTime=startTime;if(effects.pianoRoll&&effects.pianoRoll.notes.length>0){const pianoRoll=effects.pianoRoll;const isLongSample=currentPlaying[sampleNumber].isLongSample;let beatDuration,barDuration;if(isLongSample){beatDuration=60/longLoopTempo;barDuration=beatDuration*4}else{const effectiveTempo=tempo+highTempo;beatDuration=60/effectiveTempo;barDuration=beatDuration*4}const sixteenthDuration=barDuration/16;const sortedNotes=[...pianoRoll.notes].sort((a,b)=>a.col-b.col);sortedNotes.forEach(note=>{const noteTime=startTime+note.col*sixteenthDuration;const noteDuration=(note.length||1)*sixteenthDuration;if(pianoRoll.soundSource==="piano"){playPianoNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="synth"){playSynthNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="strings"){playStringsNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="bass"){playBassNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="lead"){playLeadNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="pad"){playPadNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else if(pianoRoll.soundSource==="pluck"){playPluckNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber)}else{playSampleNoteForSample(note.row,noteTime,noteDuration,gainNode,sampleNumber,pianoRoll.sampleRange)}})}else{if(currentPlaying[sampleNumber].isLongSample){const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for long sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration});return}const basePlaybackRate=currentPlaying[sampleNumber].loopDuration/desiredLoopDuration;let individualTempo=1;if(effects.individualTempo){individualTempo=effects.individualTempo}const speed=effects.speed||1;const playbackRate=basePlaybackRate*individualTempo*speed;if(!isFinite(playbackRate)||playbackRate<=0){console.error("Invalid playback rate for long sample:",playbackRate);return}source.loop=true;source.loopStart=0;source.loopEnd=currentPlaying[sampleNumber].loopDuration;source.playbackRate.value=playbackRate;source.start(startTime)}else{const effectiveTempo=tempo+highTempo;const effectiveBeatDuration=60/effectiveTempo;const effectiveBarDuration=effectiveBeatDuration*4;const desiredLoopDuration=effectiveBarDuration*loopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for drum sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration,effectiveBarDuration:effectiveBarDuration,loopLength:loopLength});return}const basePlaybackRate=currentPlaying[sampleNumber].loopDuration/desiredLoopDuration;const speed=effects.speed||1;const playbackRate=basePlaybackRate*speed;if(!isFinite(playbackRate)||playbackRate<=0){console.error("Invalid playback rate for drum sample:",playbackRate);return}source.loop=true;source.loopStart=0;source.loopEnd=currentPlaying[sampleNumber].loopDuration;source.playbackRate.value=playbackRate;source.start(startTime)}}initializeEffectsForSample(sampleNumber);setTimeout(()=>{if(currentPlaying[sampleNumber].isScheduled){updateSampleEffects(sampleNumber)}},50);console.log(`Sample ${sampleNumber} (${currentPlaying[sampleNumber].isLongSample?"long":"drum"}) started at ${startTime} with volume ${volumePercent}%, speed ${effects.speed||1} and individual tempo ${effects.individualTempo||1}`)}function updateDrumSampleLoop(sampleNumber){if(!currentPlaying[sampleNumber].source||currentPlaying[sampleNumber].isLongSample)return;const effectiveTempo=tempo+highTempo;const effectiveBeatDuration=60/effectiveTempo;const effectiveBarDuration=effectiveBeatDuration*4;const desiredLoopDuration=effectiveBarDuration*loopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for updating drum sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration,effectiveBarDuration:effectiveBarDuration,loopLength:loopLength});return}const basePlaybackRate=currentPlaying[sampleNumber].loopDuration/desiredLoopDuration;const effects=currentPlaying[sampleNumber].effects||{};const speed=effects.speed||1;const playbackRate=basePlaybackRate*speed;if(!isFinite(playbackRate)||playbackRate<=0){console.error("Invalid playback rate for updating drum sample:",playbackRate);return}const currentTime=audioContext.currentTime;const elapsedTime=currentTime-currentPlaying[sampleNumber].loopStartTime;const loopProgress=elapsedTime*currentPlaying[sampleNumber].source.playbackRate.value%currentPlaying[sampleNumber].loopDuration;currentPlaying[sampleNumber].source.playbackRate.value=playbackRate;currentPlaying[sampleNumber].loopStartTime=currentTime-loopProgress/playbackRate;console.log(`Sample ${sampleNumber} tempo updated: loop progress ${loopProgress/currentPlaying[sampleNumber].loopDuration} with speed ${speed}`)}function updateLongSampleLoop(sampleNumber){if(!currentPlaying[sampleNumber].source||!currentPlaying[sampleNumber].isLongSample)return;const longLoopBeatDuration=60/longLoopTempo;const longLoopBarDuration=longLoopBeatDuration*4;const desiredLoopDuration=longLoopBarDuration*longLoopLength;if(!isFinite(desiredLoopDuration)||desiredLoopDuration<=0||!isFinite(currentPlaying[sampleNumber].loopDuration)||currentPlaying[sampleNumber].loopDuration<=0){console.error("Invalid values for updating long sample:",{desiredLoopDuration:desiredLoopDuration,loopDuration:currentPlaying[sampleNumber].loopDuration,longLoopBarDuration:longLoopBarDuration,longLoopLength:longLoopLength});return}const basePlaybackRate=currentPlaying[sampleNumber].loopDuration/desiredLoopDuration;const effects=currentPlaying[sampleNumber].effects||{};const individualTempo=effects.individualTempo||1;const speed=effects.speed||1;const playbackRate=basePlaybackRate*individualTempo*speed;if(!isFinite(playbackRate)||playbackRate<=0){console.error("Invalid playback rate for updating long sample:",playbackRate);return}const currentTime=audioContext.currentTime;const elapsedTime=currentTime-currentPlaying[sampleNumber].loopStartTime;const loopProgress=elapsedTime*currentPlaying[sampleNumber].source.playbackRate.value%currentPlaying[sampleNumber].loopDuration;currentPlaying[sampleNumber].source.playbackRate.value=playbackRate;currentPlaying[sampleNumber].loopStartTime=currentTime-loopProgress/playbackRate;console.log(`Sample ${sampleNumber} long tempo updated: loop progress ${loopProgress/currentPlaying[sampleNumber].loopDuration} with individual tempo ${individualTempo} and speed ${speed}`)}function stopSample(sampleNumber){if(currentPlaying[sampleNumber].scheduledTimeout){clearTimeout(currentPlaying[sampleNumber].scheduledTimeout);currentPlaying[sampleNumber].scheduledTimeout=null}if(currentPlaying[sampleNumber].source){try{if(currentPlaying[sampleNumber].isScheduled){currentPlaying[sampleNumber].source.stop()}currentPlaying[sampleNumber].source.disconnect();currentPlaying[sampleNumber].source=null;currentPlaying[sampleNumber].gainNode=null;if(currentPlaying[sampleNumber].delayNode){currentPlaying[sampleNumber].delayNode.disconnect();currentPlaying[sampleNumber].delayNode=null}if(currentPlaying[sampleNumber].delayFeedbackNode){currentPlaying[sampleNumber].delayFeedbackNode.disconnect();currentPlaying[sampleNumber].delayFeedbackNode=null}if(currentPlaying[sampleNumber].reverbNode){currentPlaying[sampleNumber].reverbNode.disconnect();currentPlaying[sampleNumber].reverbNode=null}if(currentPlaying[sampleNumber].reverbMixNode){currentPlaying[sampleNumber].reverbMixNode.disconnect();currentPlaying[sampleNumber].reverbMixNode=null}if(currentPlaying[sampleNumber].wetPathNode){currentPlaying[sampleNumber].wetPathNode.disconnect();currentPlaying[sampleNumber].wetPathNode=null}if(currentPlaying[sampleNumber].dryPathNode){currentPlaying[sampleNumber].dryPathNode.disconnect();currentPlaying[sampleNumber].dryPathNode=null}if(currentPlaying[sampleNumber].outputNode){currentPlaying[sampleNumber].outputNode.disconnect();currentPlaying[sampleNumber].outputNode=null}if(currentPlaying[sampleNumber].eqLowNode){currentPlaying[sampleNumber].eqLowNode.disconnect();currentPlaying[sampleNumber].eqLowNode=null}if(currentPlaying[sampleNumber].eqLowMidNode){currentPlaying[sampleNumber].eqLowMidNode.disconnect();currentPlaying[sampleNumber].eqLowMidNode=null}if(currentPlaying[sampleNumber].eqMidNode){currentPlaying[sampleNumber].eqMidNode.disconnect();currentPlaying[sampleNumber].eqMidNode=null}if(currentPlaying[sampleNumber].eqHighMidNode){currentPlaying[sampleNumber].eqHighMidNode.disconnect();currentPlaying[sampleNumber].eqHighMidNode=null}if(currentPlaying[sampleNumber].eqHighMid2Node){currentPlaying[sampleNumber].eqHighMid2Node.disconnect();currentPlaying[sampleNumber].eqHighMid2Node=null}if(currentPlaying[sampleNumber].eqHighNode){currentPlaying[sampleNumber].eqHighNode.disconnect();currentPlaying[sampleNumber].eqHighNode=null}if(currentPlaying[sampleNumber].eqVeryHighNode){currentPlaying[sampleNumber].eqVeryHighNode.disconnect();currentPlaying[sampleNumber].eqVeryHighNode=null}}catch(e){console.warn("Error stopping audio source:",e);currentPlaying[sampleNumber].source=null;currentPlaying[sampleNumber].gainNode=null}}currentPlaying[sampleNumber].isScheduled=false;currentPlaying[sampleNumber].barGridAligned=false}function updateTiming(){if(!isFinite(tempo)||tempo<=0){console.error("Invalid tempo value:",tempo);return}const effectiveTempo=tempo+highTempo;beatDuration=60/effectiveTempo;barDuration=beatDuration*4}function scheduler(){const currentTime=audioContext.currentTime;if(currentTime>=masterBarGrid.nextStartTime){masterBarGrid.startTime=masterBarGrid.nextStartTime;masterBarGrid.nextStartTime=masterBarGrid.startTime+masterBarGrid.duration}if(isPlaying){timerId=setTimeout(scheduler,lookahead)}}function startRecording(){if(isRecording)return;recordingDestination=audioContext.createMediaStreamDestination();masterOutputNode.connect(recordingDestination);mediaRecorder=new MediaRecorder(recordingDestination.stream);recordedChunks=[];mediaRecorder.ondataavailable=function(event){if(event.data.size>0){recordedChunks.push(event.data)}};mediaRecorder.onstop=function(){recordedBlob=new Blob(recordedChunks,{type:"audio/wav"});saveButton.style.display="block"};mediaRecorder.start();isRecording=true;recordingStartTime=Date.now();recordButton.textContent="Stop Recording";recordButton.classList.add("recording");saveButton.style.display="block"}function stopRecording(){if(!isRecording)return;mediaRecorder.stop();isRecording=false;recordingDuration=(Date.now()-recordingStartTime)/1e3;recordButton.textContent="Record";recordButton.classList.remove("recording");if(recordingDestination){masterOutputNode.disconnect(recordingDestination);recordingDestination=null}}tempoSlider.addEventListener("input",function(){tempo=parseInt(this.value);if(!isFinite(tempo)||tempo<=0){console.error("Invalid tempo value from slider:",tempo);return}tempoDisplay.textContent=`${tempo} BPM`;if(tempo>=240){highTempoSlider.disabled=false;highTempoSlider.style.opacity="1"}else{highTempoSlider.disabled=true;highTempoSlider.style.opacity="0.5";highTempo=0;highTempoSlider.value="240";highTempoDisplay.textContent="240 BPM"}updateTiming();updateMasterBarGrid();for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive&&currentPlaying[i].isScheduled&&!currentPlaying[i].isLongSample){updateDrumSampleTempo(i)}}});highTempoSlider.addEventListener("input",function(){highTempo=parseInt(this.value)-240;if(!isFinite(highTempo)||highTempo<0){console.error("Invalid high tempo value from slider:",highTempo);return}highTempoDisplay.textContent=`${parseInt(this.value)} BPM`;updateTiming();updateMasterBarGrid();for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive&&currentPlaying[i].isScheduled&&!currentPlaying[i].isLongSample){updateDrumSampleTempo(i)}}});longLoopTempoSlider.addEventListener("input",function(){longLoopTempo=parseInt(this.value);if(!isFinite(longLoopTempo)||longLoopTempo<=0){console.error("Invalid long loop tempo value from slider:",longLoopTempo);return}longLoopTempoDisplay.textContent=`${longLoopTempo} BPM`;for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive&&currentPlaying[i].isScheduled&&currentPlaying[i].isLongSample){updateLongSampleTempo(i)}}});playButton.addEventListener("click",function(){resumeAudioContext();if(!isPlaying){isPlaying=true;playButton.textContent="Stop";playButton.classList.add("playing");if(audioContext.state==="suspended"){audioContext.resume()["catch"](e=>console.error("Error resuming audio context:",e))}const currentTime=audioContext.currentTime;masterBarGrid.startTime=currentTime;masterBarGrid.duration=barDuration;masterBarGrid.nextStartTime=masterBarGrid.startTime+masterBarGrid.duration;for(let i=1;i<=100;i++){if(currentPlaying[i].button&&currentPlaying[i].buffer&&currentPlaying[i].scheduledForNextBar&&currentPlaying[i].isActive){if(currentPlaying[i].scheduledTimeout){clearTimeout(currentPlaying[i].scheduledTimeout);currentPlaying[i].scheduledTimeout=null}scheduleSampleForNextBar(i)}}scheduler()}else{isPlaying=false;playButton.textContent="Play";playButton.classList.remove("playing");clearTimeout(timerId);for(let i=1;i<=100;i++){stopSample(i)}}});recordButton.addEventListener("click",function(){if(isRecording){stopRecording()}else{startRecording()}});saveButton.addEventListener("click",function(){if(recordedBlob){const url=URL.createObjectURL(recordedBlob);const a=document.createElement("a");a.href=url;a.download=`psychological-studio-recording-${(new Date).toISOString().slice(0,19).replace(/:/g,"-")}.wav`;a.click();URL.revokeObjectURL(url)}});function initPianoRoll(){if(!currentSampleForPopup)return;const isLongSample=currentSampleForPopup>60;if(!pianoRollData[currentSampleForPopup]){pianoRollData[currentSampleForPopup]={notes:[],soundSource:"piano",gridWidth:isLongSample?32:16,gridHeight:84,scrollX:0,scrollY:0,sampleRange:{start:0,end:100},filters:{lowShelf:0,highShelf:0,lowMid:0,mid:0,highMid:0,delay:{time:0,feedback:0}},isEnabled:false}}const pianoKeys=document.querySelector(".piano-keys");const pianoRollGrid=document.querySelector(".piano-roll-grid");const soundSourceSelect=document.getElementById("piano-roll-sound-source");const noteLengthSelect=document.getElementById("note-length-select");const gridSizeDecreaseBtn=document.getElementById("grid-size-decrease");const gridSizeIncreaseBtn=document.getElementById("grid-size-increase");const gridSizeDisplay=document.getElementById("grid-size-display");pianoKeys.innerHTML="";pianoRollGrid.innerHTML="";const data=pianoRollData[currentSampleForPopup];pianoRollGrid.style.gridTemplateColumns=`repeat(${data.gridWidth}, 1fr)`;gridSizeDisplay.textContent=data.gridWidth;const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const octaves=7;for(let octave=octaves-1;octave>=0;octave--){for(let i=0;i<12;i++){const key=document.createElement("div");key.className=`piano-key ${noteNames[i].includes("#")?"black":"white"}`;key.textContent=noteNames[i]+octave;key.dataset.note=noteNames[i];key.dataset.octave=octave;key.addEventListener("click",function(){playPianoKey(noteNames[i],octave)});pianoKeys.appendChild(key)}}for(let row=data.gridHeight-1;row>=0;row--){for(let col=0;col<data.gridWidth;col++){const cell=document.createElement("div");cell.className="piano-roll-cell";if(col%4===0){cell.classList.add("bar-start")}if((col+1)%4===0){cell.classList.add("bar-end")}cell.dataset.row=row;cell.dataset.col=col;const isPartOfNote=data.notes.some(note=>note.row===row&&note.col<=col&&col<note.col+(note.length||1));const isNoteStart=data.notes.some(note=>note.row===row&&note.col===col);if(isPartOfNote){cell.classList.add("active");if(!isNoteStart){cell.classList.add("note-long")}}cell.addEventListener("click",function(){togglePianoRollCell(row,col)});pianoRollGrid.appendChild(cell)}}soundSourceSelect.value=data.soundSource;noteLengthSelect.value=pianoRollNoteLength;soundSourceSelect.addEventListener("change",function(){data.soundSource=this.value;if(this.value==="sample"){openSampleSelectionPopup()}});noteLengthSelect.addEventListener("change",function(){pianoRollNoteLength=parseFloat(this.value)});gridSizeDecreaseBtn.addEventListener("click",function(){if(data.gridWidth>4){data.gridWidth/=2;gridSizeDisplay.textContent=data.gridWidth;pianoRollGrid.style.gridTemplateColumns=`repeat(${data.gridWidth}, 1fr)`;pianoRollGrid.innerHTML="";for(let row=data.gridHeight-1;row>=0;row--){for(let col=0;col<data.gridWidth;col++){const cell=document.createElement("div");cell.className="piano-roll-cell";if(col%4===0){cell.classList.add("bar-start")}if((col+1)%4===0){cell.classList.add("bar-end")}cell.dataset.row=row;cell.dataset.col=col;const isPartOfNote=data.notes.some(note=>note.row===row&&note.col<=col&&col<note.col+(note.length||1));const isNoteStart=data.notes.some(note=>note.row===row&&note.col===col);if(isPartOfNote){cell.classList.add("active");if(!isNoteStart){cell.classList.add("note-long")}}cell.addEventListener("click",function(){togglePianoRollCell(row,col)});pianoRollGrid.appendChild(cell)}}}});gridSizeIncreaseBtn.addEventListener("click",function(){if(data.gridWidth<64){data.gridWidth*=2;gridSizeDisplay.textContent=data.gridWidth;pianoRollGrid.style.gridTemplateColumns=`repeat(${data.gridWidth}, 1fr)`;pianoRollGrid.innerHTML="";for(let row=data.gridHeight-1;row>=0;row--){for(let col=0;col<data.gridWidth;col++){const cell=document.createElement("div");cell.className="piano-roll-cell";if(col%4===0){cell.classList.add("bar-start")}if((col+1)%4===0){cell.classList.add("bar-end")}cell.dataset.row=row;cell.dataset.col=col;const isPartOfNote=data.notes.some(note=>note.row===row&&note.col<=col&&col<note.col+(note.length||1));const isNoteStart=data.notes.some(note=>note.row===row&&note.col===col);if(isPartOfNote){cell.classList.add("active");if(!isNoteStart){cell.classList.add("note-long")}}cell.addEventListener("click",function(){togglePianoRollCell(row,col)});pianoRollGrid.appendChild(cell)}}}});const previewBtn=document.getElementById("piano-roll-preview-btn");const stopBtn=document.getElementById("piano-roll-stop-btn");const clearBtn=document.getElementById("piano-roll-clear-btn");previewBtn.replaceWith(previewBtn.cloneNode(true));stopBtn.replaceWith(stopBtn.cloneNode(true));clearBtn.replaceWith(clearBtn.cloneNode(true));const newPreviewBtn=document.getElementById("piano-roll-preview-btn");const newStopBtn=document.getElementById("piano-roll-stop-btn");const newClearBtn=document.getElementById("piano-roll-clear-btn");newPreviewBtn.addEventListener("click",previewPianoRoll);newStopBtn.addEventListener("click",stopPianoRollPreview);newClearBtn.addEventListener("click",function(){clearPianoRoll();stopPianoRollPreview()});initPianoRollVisualizer()}function initPianoRollVisualizer(){if(!currentSampleForPopup)return;pianoRollVisualizer=document.getElementById("piano-roll-visualizer");pianoRollVisualizerCtx=pianoRollVisualizer.getContext("2d");const container=pianoRollVisualizer.parentElement;pianoRollVisualizer.width=container.clientWidth;pianoRollVisualizer.height=container.clientHeight;if(pianoRollVisualizerAnimationId){cancelAnimationFrame(pianoRollVisualizerAnimationId);pianoRollVisualizerAnimationId=null}pianoRollVisualizerHistory=[];drawPianoRollVisualizer()}function drawPianoRollVisualizer(){if(!pianoRollVisualizer||!pianoRollVisualizerCtx)return;const width=pianoRollVisualizer.width;const height=pianoRollVisualizer.height;pianoRollVisualizerCtx.fillStyle="#111";pianoRollVisualizerCtx.fillRect(0,0,width,height);if(pianoRollVisualizerHistory.length>0){const gradient=pianoRollVisualizerCtx.createLinearGradient(0,height,0,0);gradient.addColorStop(0,"rgba(28, 0, 212, 0.9)");gradient.addColorStop(.1,"rgba(0, 191, 255, 0.95)");gradient.addColorStop(.3,"rgba(0, 210, 154, 0.9)");gradient.addColorStop(.5,"rgba(255, 196, 0, 0.85)");gradient.addColorStop(.7,"rgba(255, 0, 132, 0.85)");gradient.addColorStop(.9,"rgba(255, 0, 255, 0.85)");gradient.addColorStop(1,"rgba(170, 0, 255, 0.85)");const sliceWidth=width/pianoRollVisualizerHistorySize;for(let h=0;h<pianoRollVisualizerHistory.length;h++){const dataArray=pianoRollVisualizerHistory[h];const x=h*sliceWidth;const alpha=.4+h/pianoRollVisualizerHistory.length*.6;pianoRollVisualizerCtx.beginPath();pianoRollVisualizerCtx.moveTo(x,height);const maxFreq=audioContext.sampleRate/2;const minLogFreq=Math.log10(20);const maxLogFreq=Math.log10(maxFreq);for(let i=0;i<dataArray.length;i++){const freq=i*maxFreq/dataArray.length;const logFreq=Math.log10(Math.max(20,freq));const normalizedLogFreq=(logFreq-minLogFreq)/(maxLogFreq-minLogFreq);const y=height-normalizedLogFreq*height;const amplitude=dataArray[i]/255;const enhancedAmplitude=Math.pow(amplitude,.4);const ampHeight=enhancedAmplitude*height*.8;pianoRollVisualizerCtx.lineTo(x,y-ampHeight)}pianoRollVisualizerCtx.lineTo(x+sliceWidth,height);pianoRollVisualizerCtx.closePath();pianoRollVisualizerCtx.globalAlpha=alpha;pianoRollVisualizerCtx.fillStyle=gradient;pianoRollVisualizerCtx.fill()}pianoRollVisualizerCtx.globalAlpha=1;if(pianoRollVisualizerHistory.length>0){const latestData=pianoRollVisualizerHistory[pianoRollVisualizerHistory.length-1];pianoRollVisualizerCtx.strokeStyle="rgba(96, 96, 96, 1)";pianoRollVisualizerCtx.lineWidth=2;pianoRollVisualizerCtx.beginPath();const maxFreq=audioContext.sampleRate/2;const minLogFreq=Math.log10(20);const maxLogFreq=Math.log10(maxFreq);for(let i=0;i<latestData.length;i++){const freq=i*maxFreq/latestData.length;const logFreq=Math.log10(Math.max(20,freq));const normalizedLogFreq=(logFreq-minLogFreq)/(maxLogFreq-minLogFreq);const x=normalizedLogFreq*width;const amplitude=latestData[i]/255;const enhancedAmplitude=Math.pow(amplitude,.4);const y=height-enhancedAmplitude*height*.8;if(i===0){pianoRollVisualizerCtx.moveTo(x,y)}else{pianoRollVisualizerCtx.lineTo(x,y)}}pianoRollVisualizerCtx.stroke()}}}function startPianoRollVisualizerAnimation(){if(!pianoRollVisualizerAnalyzer)return;const bufferLength=pianoRollVisualizerAnalyzer.frequencyBinCount;const dataArray=new Uint8Array(bufferLength);function animate(){pianoRollVisualizerAnimationId=requestAnimationFrame(animate);pianoRollVisualizerAnalyzer.getByteFrequencyData(dataArray);pianoRollVisualizerHistory.push([...dataArray]);if(pianoRollVisualizerHistory.length>pianoRollVisualizerHistorySize){pianoRollVisualizerHistory.shift()}drawPianoRollVisualizer()}animate()}function stopPianoRollVisualizerAnimation(){if(pianoRollVisualizerAnimationId){cancelAnimationFrame(pianoRollVisualizerAnimationId);pianoRollVisualizerAnimationId=null}pianoRollVisualizerHistory=[];drawPianoRollVisualizer()}function playPianoKey(noteName,octave){const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sine";const gainNode=audioContext.createGain();oscillator.connect(gainNode);gainNode.connect(masterOutputNode);oscillator.frequency.value=frequency;const now=audioContext.currentTime;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;const releaseTime=.2;gainNode.gain.setValueAtTime(0,now);gainNode.gain.linearRampToValueAtTime(1,now+attackTime);gainNode.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);gainNode.gain.linearRampToValueAtTime(0,now+attackTime+decayTime+releaseTime);oscillator.start(now);oscillator.stop(now+attackTime+decayTime+releaseTime)}function togglePianoRollCell(row,col){if(!currentSampleForPopup)return;const data=pianoRollData[currentSampleForPopup];const existingNoteIndex=data.notes.findIndex(note=>note.row===row&&note.col===col);if(existingNoteIndex!==-1){const note=data.notes[existingNoteIndex];for(let c=col;c<col+(note.length||1);c++){const cell=document.querySelector(`.piano-roll-cell[data-row="${row}"][data-col="${c}"]`);if(cell){cell.classList.remove("active","note-long")}}data.notes.splice(existingNoteIndex,1)}else{const noteLength=pianoRollNoteLength;const note={row:row,col:col,length:noteLength};data.notes.push(note);for(let c=col;c<col+noteLength;c++){const cell=document.querySelector(`.piano-roll-cell[data-row="${row}"][data-col="${c}"]`);if(cell){cell.classList.add("active");if(c>col){cell.classList.add("note-long")}}}}}function clearPianoRoll(){if(!currentSampleForPopup)return;const data=pianoRollData[currentSampleForPopup];data.notes=[];const cells=document.querySelectorAll(".piano-roll-cell.active");cells.forEach(cell=>{cell.classList.remove("active","note-long")})}function previewPianoRoll(){if(!currentSampleForPopup||isPreviewingPianoRoll)return;isPreviewingPianoRoll=true;currentPianoRollSample=currentSampleForPopup;const data=pianoRollData[currentSampleForPopup];const sortedNotes=[...data.notes].sort((a,b)=>a.col-b.col);if(sortedNotes.length===0)return;if(audioContext.state==="suspended"){audioContext.resume()["catch"](e=>console.error("Error resuming audio context:",e))}const soundSource=data.soundSource;const isLongSample=currentSampleForPopup>60;let beatDuration,barDuration;if(isLongSample){beatDuration=60/longLoopTempo;barDuration=beatDuration*4}else{const effectiveTempo=tempo+highTempo;beatDuration=60/effectiveTempo;barDuration=beatDuration*4}const sixteenthDuration=barDuration/16;const previewGain=audioContext.createGain();const lowShelfFilter=audioContext.createBiquadFilter();lowShelfFilter.type="lowshelf";lowShelfFilter.frequency.value=200;lowShelfFilter.gain.value=data.filters.lowShelf||0;const lowMidFilter=audioContext.createBiquadFilter();lowMidFilter.type="peaking";lowMidFilter.frequency.value=500;lowMidFilter.Q.value=1;lowMidFilter.gain.value=data.filters.lowMid||0;const midFilter=audioContext.createBiquadFilter();midFilter.type="peaking";midFilter.frequency.value=1500;midFilter.Q.value=1;midFilter.gain.value=data.filters.mid||0;const highMidFilter=audioContext.createBiquadFilter();highMidFilter.type="peaking";highMidFilter.frequency.value=4e3;highMidFilter.Q.value=1;highMidFilter.gain.value=data.filters.highMid||0;const highShelfFilter=audioContext.createBiquadFilter();highShelfFilter.type="highshelf";highShelfFilter.frequency.value=8e3;highShelfFilter.gain.value=data.filters.highShelf||0;const delayNode=audioContext.createDelay(1);delayNode.delayTime.value=(data.filters.delay.time||0)/1e3;const delayFeedbackNode=audioContext.createGain();delayFeedbackNode.gain.value=(data.filters.delay.feedback||0)/100;previewGain.connect(lowShelfFilter);lowShelfFilter.connect(lowMidFilter);lowMidFilter.connect(midFilter);midFilter.connect(highMidFilter);highMidFilter.connect(highShelfFilter);highShelfFilter.connect(delayNode);delayNode.connect(delayFeedbackNode);delayFeedbackNode.connect(delayNode);delayNode.connect(audioContext.destination);pianoRollVisualizerAnalyzer=audioContext.createAnalyser();pianoRollVisualizerAnalyzer.fftSize=4096;pianoRollVisualizerAnalyzer.smoothingTimeConstant=.7;delayNode.connect(pianoRollVisualizerAnalyzer);pianoRollFilterNodes={lowShelf:lowShelfFilter,lowMid:lowMidFilter,mid:midFilter,highMid:highMidFilter,highShelf:highShelfFilter,delay:delayNode,delayFeedback:delayFeedbackNode};const loopDuration=data.gridWidth*sixteenthDuration;pianoRollPreviewNodes[currentSampleForPopup]={gain:previewGain,loopDuration:loopDuration,sixteenthDuration:sixteenthDuration,soundSource:soundSource,sampleRange:data.sampleRange,filters:data.filters};startPianoRollVisualizerAnimation();startPianoRollLoop()}function startPianoRollLoop(){if(!isPreviewingPianoRoll||!currentPianoRollSample||!pianoRollPreviewNodes[currentPianoRollSample])return;const nodes=pianoRollPreviewNodes[currentPianoRollSample];const currentTime=audioContext.currentTime;const currentNotes=pianoRollData[currentPianoRollSample].notes;const sortedNotes=[...currentNotes].sort((a,b)=>a.col-b.col);sortedNotes.forEach(note=>{const noteTime=currentTime+note.col*nodes.sixteenthDuration;const noteDuration=(note.length||1)*nodes.sixteenthDuration;if(nodes.soundSource==="piano"){playPianoNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="synth"){playSynthNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="strings"){playStringsNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="bass"){playBassNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="lead"){playLeadNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="pad"){playPadNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else if(nodes.soundSource==="pluck"){playPluckNoteForPreview(note.row,noteTime,noteDuration,nodes.gain)}else{playSampleNoteForPreview(note.row,noteTime,noteDuration,nodes.gain,currentPianoRollSample,nodes.sampleRange)}});pianoRollLoopInterval=setTimeout(()=>{if(isPreviewingPianoRoll&&currentPianoRollSample){startPianoRollLoop()}},nodes.loopDuration*1e3)}function playPianoNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sine";const noteGain=audioContext.createGain();oscillator.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playSynthNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator1=audioContext.createOscillator();oscillator1.type="sawtooth";const oscillator2=audioContext.createOscillator();oscillator2.type="square";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*4;filter.Q.value=10;oscillator1.connect(filter);oscillator2.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator1.frequency.value=frequency;oscillator2.frequency.value=frequency*.5;const now=time;const attackTime=.05;const decayTime=.2;const sustainLevel=.6;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator1.start(now);oscillator2.start(now);oscillator1.stop(now+duration);oscillator2.stop(now+duration)}function playStringsNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="triangle";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*2;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.1;const decayTime=.3;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playBassNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sawtooth";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.5;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency*.5;const now=time;const attackTime=.05;const decayTime=.2;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playLeadNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sawtooth";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*3;filter.Q.value=2;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.02;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playPadNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sine";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.2;filter.Q.value=3;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.3;const decayTime=.5;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playPluckNoteForPreview(row,time,duration,gainNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="square";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="highpass";filter.frequency.value=frequency*.8;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(gainNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.5;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playSampleNoteForPreview(row,time,duration,gainNode,sampleNumber,sampleRange){if(!currentPlaying[sampleNumber]||!currentPlaying[sampleNumber].buffer)return;const source=audioContext.createBufferSource();source.buffer=currentPlaying[sampleNumber].buffer;const noteGain=audioContext.createGain();source.connect(noteGain);noteGain.connect(gainNode);const semitoneRatio=Math.pow(2,1/12);const middleRow=42;const pitchMultiplier=Math.pow(semitoneRatio,row-middleRow);source.playbackRate.value=pitchMultiplier;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);const bufferDuration=currentPlaying[sampleNumber].buffer.duration;const startTime=bufferDuration*(sampleRange.start/100);const endTime=bufferDuration*(sampleRange.end/100);source.start(now,startTime);source.stop(now+duration,endTime)}function stopPianoRollPreview(){if(!isPreviewingPianoRoll||!currentPianoRollSample)return;isPreviewingPianoRoll=false;if(pianoRollLoopInterval){clearTimeout(pianoRollLoopInterval);pianoRollLoopInterval=null}if(pianoRollPreviewNodes[currentPianoRollSample]){const{gain}=pianoRollPreviewNodes[currentPianoRollSample];gain.gain.cancelScheduledValues(audioContext.currentTime);gain.gain.setValueAtTime(gain.gain.value,audioContext.currentTime);gain.gain.linearRampToValueAtTime(0,audioContext.currentTime+.1);setTimeout(()=>{gain.disconnect()},200);delete pianoRollPreviewNodes[currentPianoRollSample]}if(pianoRollFilterNodes.lowShelf){pianoRollFilterNodes.lowShelf.disconnect();pianoRollFilterNodes.lowShelf=null}if(pianoRollFilterNodes.lowMid){pianoRollFilterNodes.lowMid.disconnect();pianoRollFilterNodes.lowMid=null}if(pianoRollFilterNodes.mid){pianoRollFilterNodes.mid.disconnect();pianoRollFilterNodes.mid=null}if(pianoRollFilterNodes.highMid){pianoRollFilterNodes.highMid.disconnect();pianoRollFilterNodes.highMid=null}if(pianoRollFilterNodes.highShelf){pianoRollFilterNodes.highShelf.disconnect();pianoRollFilterNodes.highShelf=null}if(pianoRollFilterNodes.delay){pianoRollFilterNodes.delay.disconnect();pianoRollFilterNodes.delay=null}if(pianoRollFilterNodes.delayFeedback){pianoRollFilterNodes.delayFeedback.disconnect();pianoRollFilterNodes.delayFeedback=null}if(pianoRollVisualizerAnalyzer){pianoRollVisualizerAnalyzer.disconnect();pianoRollVisualizerAnalyzer=null}stopPianoRollVisualizerAnimation();currentPianoRollSample=null}async function savePianoRollAsSampleForCurrentButton(){if(!currentSampleForPopup)return;const data=pianoRollData[currentSampleForPopup];if(data.notes.length===0){console.log("No notes to save");return}const sortedNotes=[...data.notes].sort((a,b)=>a.col-b.col);const soundSource=data.soundSource;const isLongSample=currentSampleForPopup>60;let beatDuration,barDuration;if(isLongSample){beatDuration=60/longLoopTempo;barDuration=beatDuration*4}else{const effectiveTempo=tempo+highTempo;beatDuration=60/effectiveTempo;barDuration=beatDuration*4}const sixteenthDuration=barDuration/16;const bufferLength=data.gridWidth*sixteenthDuration;const offlineContext=new OfflineAudioContext(2,audioContext.sampleRate*bufferLength,audioContext.sampleRate);const masterGain=offlineContext.createGain();const lowShelfFilter=offlineContext.createBiquadFilter();lowShelfFilter.type="lowshelf";lowShelfFilter.frequency.value=200;lowShelfFilter.gain.value=data.filters.lowShelf||0;const lowMidFilter=offlineContext.createBiquadFilter();lowMidFilter.type="peaking";lowMidFilter.frequency.value=500;lowMidFilter.Q.value=1;lowMidFilter.gain.value=data.filters.lowMid||0;const midFilter=offlineContext.createBiquadFilter();midFilter.type="peaking";midFilter.frequency.value=1500;midFilter.Q.value=1;midFilter.gain.value=data.filters.mid||0;const highMidFilter=offlineContext.createBiquadFilter();highMidFilter.type="peaking";highMidFilter.frequency.value=4e3;highMidFilter.Q.value=1;highMidFilter.gain.value=data.filters.highMid||0;const highShelfFilter=offlineContext.createBiquadFilter();highShelfFilter.type="highshelf";highShelfFilter.frequency.value=8e3;highShelfFilter.gain.value=data.filters.highShelf||0;const delayNode=offlineContext.createDelay(1);delayNode.delayTime.value=(data.filters.delay.time||0)/1e3;const delayFeedbackNode=offlineContext.createGain();delayFeedbackNode.gain.value=(data.filters.delay.feedback||0)/100;masterGain.connect(lowShelfFilter);lowShelfFilter.connect(lowMidFilter);lowMidFilter.connect(midFilter);midFilter.connect(highMidFilter);highMidFilter.connect(highShelfFilter);highShelfFilter.connect(delayNode);delayNode.connect(delayFeedbackNode);delayFeedbackNode.connect(delayNode);delayNode.connect(offlineContext.destination);sortedNotes.forEach(note=>{const noteTime=note.col*sixteenthDuration;const noteDuration=(note.length||1)*sixteenthDuration;if(soundSource==="piano"){renderPianoNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="synth"){renderSynthNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="strings"){renderStringsNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="bass"){renderBassNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="lead"){renderLeadNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="pad"){renderPadNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else if(soundSource==="pluck"){renderPluckNote(offlineContext,note.row,noteTime,noteDuration,masterGain)}else{renderSampleNote(offlineContext,note.row,noteTime,noteDuration,masterGain,currentSampleForPopup,data.sampleRange)}});try{const renderedBuffer=await offlineContext.startRendering();if(!renderedBuffer||renderedBuffer.length===0){console.error("Error: Rendered buffer is empty or invalid");return}currentPlaying[currentSampleForPopup].buffer=renderedBuffer;currentPlaying[currentSampleForPopup].loopDuration=renderedBuffer.duration;currentPlaying[currentSampleForPopup].bufferSampleNumber=currentSampleForPopup;currentPlaying[currentSampleForPopup].isCustomSample=true;const button=currentPlaying[currentSampleForPopup].button;if(button){addCustomIndicator(button);button.classList.remove("no-sample")}if(currentPlaying[currentSampleForPopup].isScheduled&&currentPlaying[currentSampleForPopup].isActive){stopSample(currentSampleForPopup);currentPlaying[currentSampleForPopup].scheduledForNextBar=true;scheduleSampleForNextBar(currentSampleForPopup)}console.log(`Piano roll saved as sample for ${currentSampleForPopup}`)}catch(error){console.error("Error rendering piano roll:",error);throw error}}function renderPianoNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="sine";const noteGain=offlineContext.createGain();oscillator.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderSynthNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator1=offlineContext.createOscillator();oscillator1.type="sawtooth";const oscillator2=offlineContext.createOscillator();oscillator2.type="square";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*4;filter.Q.value=10;oscillator1.connect(filter);oscillator2.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator1.frequency.value=frequency;oscillator2.frequency.value=frequency*.5;const attackTime=.05;const decayTime=.2;const sustainLevel=.6;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator1.start(time);oscillator2.start(time);oscillator1.stop(time+duration);oscillator2.stop(time+duration)}function renderStringsNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="triangle";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*2;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const attackTime=.1;const decayTime=.3;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderBassNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="sawtooth";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.5;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency*.5;const attackTime=.05;const decayTime=.2;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderLeadNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="sawtooth";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*3;filter.Q.value=2;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const attackTime=.02;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderPadNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="sine";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.2;filter.Q.value=3;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const attackTime=.3;const decayTime=.5;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderPluckNote(offlineContext,row,time,duration,outputNode){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=offlineContext.createOscillator();oscillator.type="square";const noteGain=offlineContext.createGain();const filter=offlineContext.createBiquadFilter();filter.type="highpass";filter.frequency.value=frequency*.8;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const attackTime=.01;const decayTime=.1;const sustainLevel=.5;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);oscillator.start(time);oscillator.stop(time+duration)}function renderSampleNote(offlineContext,row,time,duration,outputNode,sampleNumber,sampleRange){if(!currentPlaying[sampleNumber]||!currentPlaying[sampleNumber].buffer)return;const source=offlineContext.createBufferSource();source.buffer=currentPlaying[sampleNumber].buffer;const noteGain=offlineContext.createGain();source.connect(noteGain);noteGain.connect(outputNode);const semitoneRatio=Math.pow(2,1/12);const middleRow=42;const pitchMultiplier=Math.pow(semitoneRatio,row-middleRow);source.playbackRate.value=pitchMultiplier;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,time);noteGain.gain.linearRampToValueAtTime(1,time+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,time+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,time+duration);const bufferDuration=currentPlaying[sampleNumber].buffer.duration;const startTime=bufferDuration*(sampleRange.start/100);const endTime=bufferDuration*(sampleRange.end/100);source.start(time,startTime);source.stop(time+duration,endTime)}function playPianoNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sine";const noteGain=audioContext.createGain();oscillator.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playSynthNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator1=audioContext.createOscillator();oscillator1.type="sawtooth";const oscillator2=audioContext.createOscillator();oscillator2.type="square";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*4;filter.Q.value=10;oscillator1.connect(filter);oscillator2.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator1.frequency.value=frequency;oscillator2.frequency.value=frequency*.5;const now=time;const attackTime=.05;const decayTime=.2;const sustainLevel=.6;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator1.start(now);oscillator2.start(now);oscillator1.stop(now+duration);oscillator2.stop(now+duration)}function playStringsNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="triangle";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*2;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.1;const decayTime=.3;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playBassNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sawtooth";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.5;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency*.5;const now=time;const attackTime=.05;const decayTime=.2;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playLeadNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sawtooth";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*3;filter.Q.value=2;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.02;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playPadNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="sine";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=frequency*1.2;filter.Q.value=3;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.3;const decayTime=.5;const sustainLevel=.8;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playPluckNoteForSample(row,time,duration,outputNode,sampleNumber){const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=row%12;const octave=Math.floor(row/12);const noteName=noteNames[noteIndex];const frequency=getNoteFrequency(noteName,octave);const oscillator=audioContext.createOscillator();oscillator.type="square";const noteGain=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type="highpass";filter.frequency.value=frequency*.8;filter.Q.value=5;oscillator.connect(filter);filter.connect(noteGain);noteGain.connect(outputNode);oscillator.frequency.value=frequency;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.5;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);oscillator.start(now);oscillator.stop(now+duration)}function playSampleNoteForSample(row,time,duration,outputNode,sampleNumber,sampleRange){if(!currentPlaying[sampleNumber]||!currentPlaying[sampleNumber].buffer)return;const source=audioContext.createBufferSource();source.buffer=currentPlaying[sampleNumber].buffer;const noteGain=audioContext.createGain();source.connect(noteGain);noteGain.connect(outputNode);const semitoneRatio=Math.pow(2,1/12);const middleRow=42;const pitchMultiplier=Math.pow(semitoneRatio,row-middleRow);source.playbackRate.value=pitchMultiplier;const now=time;const attackTime=.01;const decayTime=.1;const sustainLevel=.7;noteGain.gain.setValueAtTime(0,now);noteGain.gain.linearRampToValueAtTime(1,now+attackTime);noteGain.gain.linearRampToValueAtTime(sustainLevel,now+attackTime+decayTime);noteGain.gain.linearRampToValueAtTime(0,now+duration);const bufferDuration=currentPlaying[sampleNumber].buffer.duration;const startTime=bufferDuration*(sampleRange.start/100);const endTime=bufferDuration*(sampleRange.end/100);source.start(now,startTime);source.stop(now+duration,endTime)}function getNoteFrequency(noteName,octave){const A4=440;const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const noteIndex=noteNames.indexOf(noteName);const semitoneDistance=(octave-4)*12+(noteIndex-9);return A4*Math.pow(2,semitoneDistance/12)}function applyPianoRollSettings(){if(!currentSampleForPopup)return;if(!currentPlaying[currentSampleForPopup].effects){currentPlaying[currentSampleForPopup].effects={}}currentPlaying[currentSampleForPopup].effects.pianoRoll=JSON.parse(JSON.stringify(pianoRollData[currentSampleForPopup]))}function openSampleSelectionPopup(){if(!currentSampleForPopup)return;currentSampleForSelection=currentSampleForPopup;const sample=currentPlaying[currentSampleForPopup];if(!sample.buffer){console.error("No sample buffer available for selection");return}const data=pianoRollData[currentSampleForPopup];sampleSelectionStart=data.sampleRange.start;sampleSelectionEnd=data.sampleRange.end;sampleSelectionZoomLevel=1;document.getElementById("sample-selection-start").value=sampleSelectionStart;document.getElementById("sample-selection-end").value=sampleSelectionEnd;updateSampleSelectionDisplay();document.getElementById("sample-name").textContent=`Sample ${currentSampleForPopup}`;document.getElementById("sample-duration").textContent=`${sample.buffer.duration.toFixed(2)}s`;drawSampleWaveform();sampleSelectionPopup.style.display="block"}});