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
        console.warn('⚠️ EQ canvas not found');
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
        drawWaveform();
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

// Draw waveform visualization
function drawWaveform() {
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
