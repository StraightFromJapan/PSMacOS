// ========================================
// AUTOMATION & LFO SYSTEM
// Copied from PsychologicalStudio
// ========================================

// Variables for automation canvas
let automationCanvases = {};
let automationContexts = {};
let automationDragState = {};

// Initialize automation canvas for effects popup
function initAutomationCanvas() {
    const canvas = document.getElementById('arr-automation-canvas');
    if (!canvas) {
        console.warn('⚠️ Automation canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    automationCanvases['main'] = canvas;
    automationContexts['main'] = ctx;
    
    setupAutomationInteraction(canvas);
    drawAutomationCurve();

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
                    drawAutomationCurve();
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
            
            drawAutomationCurve();
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
        drawAutomationCurve();
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

// Draw automation curve on canvas
function drawAutomationCurve() {
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

// LFO nodes for preview playback - SUPPORT 4 LFOs LIKE PLAYBACK
let previewLfoNodes = [null, null, null, null];
let previewLfoGainNodes = [null, null, null, null];
let previewLfoUpdateTimeouts = [null, null, null, null];
let previewLfoStartTimes = [null, null, null, null];

// Initialize ALL 4 LFOs for preview playback (matches playback behavior)
function initLfoForPreview() {
    if (!currentClipEffects || !currentClipEffects.lfos) return;
    
    // Cleanup old LFOs first
    cleanupLfo();
    
    // Initialize each of the 4 LFO slots
    currentClipEffects.lfos.forEach((lfo, lfoIndex) => {
        if (!lfo || lfo.target === 'none' || (lfo.depth || 0) === 0) return;
        
        try {
            // Create LFO oscillator and gain for this slot
            const lfoNode = audioContext.createOscillator();
            const lfoGainNode = audioContext.createGain();
            
            lfoNode.type = lfo.waveform || 'sine';
            lfoNode.frequency.value = lfo.rate || 1;
            
            lfoNode.connect(lfoGainNode);
            
            // Store nodes
            previewLfoNodes[lfoIndex] = lfoNode;
            previewLfoGainNodes[lfoIndex] = lfoGainNode;
            
            // Connect to target
            const target = lfo.target || 'none';
            
            if (target === 'filter' && previewFilterNode) {
                // Modulate filter cutoff frequency
                const baseFreq = previewFilterNode.frequency.value || 1000;
                const modulationRange = baseFreq * 0.5; // ±50% modulation
                
                lfoGainNode.gain.value = modulationRange * (lfo.depth / 100);
                lfoGainNode.connect(previewFilterNode.frequency);
                
            } else if (target === 'volume' && previewGainNode) {
                // Modulate volume (tremolo effect)
                const modulationRange = 0.5; // ±50% volume modulation
                
                lfoGainNode.gain.value = modulationRange * (lfo.depth / 100);
                lfoGainNode.connect(previewGainNode.gain);
                
            } else if (target === 'pitch' && previewSource && previewSource.playbackRate) {
                // Modulate pitch using playbackRate
                previewLfoStartTimes[lfoIndex] = audioContext.currentTime;
                updatePitchLfo(lfoIndex);
            }
            
            // Start oscillator
            lfoNode.start();
            
        } catch (err) {
            console.error(`Error initializing preview LFO ${lfoIndex + 1}:`, err);
        }
    });
}

// Update pitch LFO for specific slot (manual implementation using playbackRate - matches arrangement.js)
function updatePitchLfo(lfoIndex) {
    if (!currentClipEffects || !currentClipEffects.lfos || !previewSource) return;
    
    const lfo = currentClipEffects.lfos[lfoIndex];
    if (!lfo || lfo.target !== 'pitch' || (lfo.depth || 0) === 0) {
        if (previewLfoUpdateTimeouts[lfoIndex]) {
            clearTimeout(previewLfoUpdateTimeouts[lfoIndex]);
            previewLfoUpdateTimeouts[lfoIndex] = null;
        }
        return;
    }
    
    const time = audioContext.currentTime;
    const lfoRate = lfo.rate || 1;
    const lfoDepth = lfo.depth / 100;
    const waveform = lfo.waveform || 'sine';
    
    // Calculate phase using relative time (matches arrangement.js)
    const relativeTime = previewLfoStartTimes[lfoIndex] ? (time - previewLfoStartTimes[lfoIndex]) : time;
    const phase = (relativeTime * lfoRate * Math.PI * 2) % (Math.PI * 2);
    
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
    
    // Calculate pitch modulation in semitones (±12 semitones max = 1 octave)
    const maxSemitones = 12;
    const semitones = modulationValue * maxSemitones * lfoDepth;
    
    // Convert semitones to playback rate multiplier
    const pitchMultiplier = Math.pow(2, semitones / 12);
    
    // Use global previewBasePitchRate (set in arrangement.js when preview starts)
    // This includes tempo multiplier and speed effects
    const baseRate = typeof previewBasePitchRate !== 'undefined' ? previewBasePitchRate : 1;
    const newRate = Math.max(0.1, Math.min(16, baseRate * pitchMultiplier)); // Clamp to safe range
    
    // Apply playback rate modulation
    if (previewSource.playbackRate) {
        previewSource.playbackRate.setValueAtTime(newRate, time);
    }
    
    // Schedule next update (100ms for better performance while maintaining smooth modulation)
    previewLfoUpdateTimeouts[lfoIndex] = setTimeout(() => updatePitchLfo(lfoIndex), 100);
}

// Cleanup ALL 4 LFOs on preview stop
function cleanupLfo() {
    for (let i = 0; i < 4; i++) {
        if (previewLfoNodes[i]) {
            try {
                previewLfoNodes[i].stop();
                previewLfoNodes[i].disconnect();
            } catch (e) {}
            previewLfoNodes[i] = null;
        }
        
        if (previewLfoGainNodes[i]) {
            try {
                previewLfoGainNodes[i].disconnect();
            } catch (e) {}
            previewLfoGainNodes[i] = null;
        }
        
        if (previewLfoUpdateTimeouts[i]) {
            clearTimeout(previewLfoUpdateTimeouts[i]);
            previewLfoUpdateTimeouts[i] = null;
        }
        
        // Reset start time
        previewLfoStartTimes[i] = null;
    }
}
