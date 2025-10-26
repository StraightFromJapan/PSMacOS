// Background Canvas Class (unchanged)
class BackgroundCanvas {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 50;
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '0';
        this.container.appendChild(this.canvas);
        
        this.createParticles();
        this.animate();
    }
    
    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
    }
    
    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 3 + 1,
                color: `rgba(113, 125, 159, ${Math.random() * 0.5 + 0.2})`,
                speedX: (Math.random() - 0.5) * 0.5,
                speedY: (Math.random() - 0.5) * 0.5
            });
        }
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            p.x += p.speedX;
            p.y += p.speedY;
            
            if (p.x < 0 || p.x > this.canvas.width) p.speedX *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.speedY *= -1;
            
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
            
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const distance = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
                
                if (distance < 100) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(113, 125, 159, ${0.2 * (1 - distance / 100)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            }
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        window.removeEventListener('resize', this.resize);
    }
}

class FileEncryption {
    constructor(password) {
        this.password = password;
    }

    encryptFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const encrypted = this._xorEncrypt(content, this.password);
                resolve(encrypted);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    decryptFile(encryptedData) {
        return this._xorEncrypt(encryptedData, this.password);
    }

    _xorEncrypt(data, password) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);
        const dataView = new DataView(data);
        const result = new ArrayBuffer(data.byteLength);
        const resultView = new DataView(result);

        for (let i = 0; i < data.byteLength; i++) {
            const passwordByte = passwordBytes[i % passwordBytes.length];
            resultView.setUint8(i, dataView.getUint8(i) ^ passwordByte);
        }

        return result;
    }
}

class SecurityManager {
    constructor() {
        this.devMode = true;
        this.db = null;
        this.usedCodes = []; // Cache for used codes
        
        // BYPASS AUTHENTICATION - Always authenticate immediately
        this.bypassAuthentication = false; // DISABLED - use normal auth flow
        
        if (this.bypassAuthentication) {
            this.authenticateWithoutCode();
        } else if (this.devMode) {
            this.initSecurity();
        } else {
            this.performIntegrityCheck().then(() => {
                if (!this.verifySignature()) {
                    this.handleTampering();
                }
                
                this.validateWithServer().catch(error => {
                    console.error('Server validation failed:', error);
                });
                
                this.initSecurity();
            }).catch(error => {
                console.error('Integrity check failed:', error);
                this.handleTampering();
            });
        }
    }
    
    authenticateWithoutCode() {
        // Set authentication token without requiring a code
        const token = "bypass_token_" + Date.now();
        const expiry = new Date().getTime() + (24 * 60 * 60 * 1000);
        localStorage.setItem('psychStudioAuth', JSON.stringify({ token, expiry }));
        
        // Show the app immediately
        this.showApp();
        
        // Initialize the app
        if (typeof window.initApp === 'function') {
            window.initApp();
        }
    }
    
    async initSecurity() {
        // Initialize available codes
        this.correctCode = [
            "020969666900", "030969666800", "040969666700", 
            "050969666600", "060969666500", "070969666400", 
            "080969666300", "090969666200", "100969666001", 
            "200969666002", "0a2b0c9x6y9z61626392010", "0a2b0c9x6y9z62626392010", 
            "0a2b0c9x6z9z62696392010", "0a2b0c9x6y9w62626392810", "0a2f0c9x6y9z62626390010", 
            "0a2bhc9x6y9z62w26392010", "0a2x0c9xwy9z6262y392010"
        ];
        
        this.maxAttempts = 3;
        this.lockoutTime = 300000;
        this.isLocked = false;
        this.lockoutEndTime = 0;
        this.fileEncryption = null;
        this.backgroundCanvas = null;
        
        // Initialize IndexedDB for persistent storage
        await this.initIndexedDB();
        
        // Load used codes from both storage systems
        await this.loadUsedCodes();
        
        this.loadSecurityState();
        this.init();
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PsychStudioDB', 2);
            
            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create usedCodes object store if it doesn't exist
                if (!db.objectStoreNames.contains('usedCodes')) {
                    const codeStore = db.createObjectStore('usedCodes', { keyPath: 'code' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
        });
    }
    
    async loadUsedCodes() {
        try {
            // Get used codes from IndexedDB
            const indexedDBUsedCodes = await this.getAllUsedCodesFromIndexedDB();
            
            // Get used codes from localStorage
            const localUsedCodes = this.getUsedCodes();
            
            // Merge both sources, with IndexedDB taking precedence
            this.usedCodes = [...new Set([...localUsedCodes, ...indexedDBUsedCodes])];
            
            // Sync any used codes that are only in localStorage to IndexedDB
            for (const codeData of localUsedCodes) {
                if (!indexedDBUsedCodes.some(c => c.code === codeData.code)) {
                    await this.saveUsedCodeToIndexedDB(codeData);
                }
            }
            
            // Update localStorage with any data only in IndexedDB
            localStorage.setItem('psychStudioUsedCodes', JSON.stringify(this.usedCodes));
            
            // Filter out used codes from available codes
            const usedCodeStrings = this.usedCodes.map(c => c.code);
            this.correctCode = this.correctCode.filter(code => !usedCodeStrings.includes(code));
            
            return this.usedCodes;
        } catch (error) {
            console.error('Error loading used codes:', error);
            return [];
        }
    }
    
    async saveUsedCodeToIndexedDB(codeData) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction('usedCodes', 'readwrite');
            const objectStore = transaction.objectStore('usedCodes');
            const request = objectStore.put(codeData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllUsedCodesFromIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction('usedCodes', 'readonly');
            const objectStore = transaction.objectStore('usedCodes');
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    getUsedCodes() {
        const usedCodesJson = localStorage.getItem('psychStudioUsedCodes');
        return usedCodesJson ? JSON.parse(usedCodesJson) : [];
    }
    
    async markCodeAsUsed(code) {
        const codeUsageData = {
            code: code,
            usedAt: new Date().toISOString()
        };
        
        // Store in localStorage
        const localUsedCodes = this.getUsedCodes();
        localUsedCodes.push(codeUsageData);
        localStorage.setItem('psychStudioUsedCodes', JSON.stringify(localUsedCodes));
        
        // Store in IndexedDB
        await this.saveUsedCodeToIndexedDB(codeUsageData);
        
        // Update cache
        this.usedCodes.push(codeUsageData);
        
        // Remove code from available codes
        const codeIndex = this.correctCode.indexOf(code);
        if (codeIndex !== -1) {
            this.correctCode.splice(codeIndex, 1);
        }
    }
    
    init() {
        if (this.isAuthenticated()) {
            this.showApp();
        } else {
            this.showLoginScreen();
        }
    }
    
    isAuthenticated() {
        // Always return true for bypass mode
        if (this.bypassAuthentication) {
            return true;
        }
        
        // Check localStorage for auth marker
        const authData = localStorage.getItem('psychStudioAuth');
        if (!authData) {
            console.log('[Security] No auth data in localStorage - NOT authenticated');
            return false;
        }
        
        try {
            const { token, expiry } = JSON.parse(authData);
            const now = new Date().getTime();
            const isValid = token && now < expiry;
            
            if (isValid) {
                console.log('[Security] ✓ Token valid. Expires in:', Math.round((expiry - now) / 1000 / 60), 'minutes');
            } else {
                console.log('[Security] ✗ Token expired or invalid. Expiry:', new Date(expiry).toISOString());
            }
            
            return isValid;
        } catch (e) {
            console.error('[Security] Error parsing auth data:', e);
            return false;
        }
    }
    
    generateToken() {
        // Generate a unique token based on current timestamp + random
        // This ensures each code entry creates a fresh 24-hour token
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 10);
        return btoa('PsychStudio_' + timestamp + '_' + randomStr).substring(0, 32);
    }
    
    getDeviceFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Psychological Studio', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Psychological Studio', 4, 17);
        
        return canvas.toDataURL();
    }
    
    showLoginScreen() {
        // Skip login screen in bypass mode
        if (this.bypassAuthentication) {
            this.showApp();
            return;
        }
        
        const existingLoginScreen = document.getElementById('login-screen');
        if (existingLoginScreen) {
            existingLoginScreen.remove();
        }
        
        const loginScreen = document.createElement('div');
        loginScreen.id = 'login-screen';
        loginScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            color: white;
            font-family: Arial, sans-serif;
            overflow: hidden;
        `;
        
        this.backgroundCanvas = new BackgroundCanvas(loginScreen);
        
        const loginForm = document.createElement('div');
        loginForm.style.cssText = `
            position: relative;
            z-index: 10;
            text-align: center; 
            max-width: 400px; 
            padding: 40px; 
            background: rgba(0,0,0,0.3); 
            border-radius: 10px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            backdrop-filter: blur(5px);
        `;
        
        loginForm.innerHTML = `
            <h1 style="margin-bottom: 30px; color: #717d9f;">Psychological Studio</h1>
            
            <div id="code-login-form" class="login-form">
                <p style="margin-bottom: 20px; color: #aaa;">Enter Registration Code</p>
                <input type="password" id="unlock-code" placeholder="Enter code" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 20px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 18px;
                    text-align: center;
                    box-sizing: border-box;
                ">
                <button id="unlock-btn" style="
                    width: 100%;
                    padding: 15px;
                    background: #930018;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.3s;
                ">Unlock</button>
            </div>
            
            <div id="error-message" style="color: #ff4444; margin-top: 15px; min-height: 20px;"></div>
            <div id="attempts-left" style="color: #aaa; margin-top: 10px; font-size: 14px;"></div>
        `;
        
        loginScreen.appendChild(loginForm);
        document.body.appendChild(loginScreen);
        
        const unlockBtn = document.getElementById('unlock-btn');
        const unlockInput = document.getElementById('unlock-code');
        
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => this.attemptUnlock());
        }
        
        if (unlockInput) {
            unlockInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.attemptUnlock();
            });
        }
        
        this.updateAttemptsDisplay();
        
        if (this.isLocked) {
            this.startLockoutCountdown();
        }
    }
    
    async attemptUnlock() {
        if (this.isLocked) {
            const remainingTime = Math.ceil((this.lockoutEndTime - new Date().getTime()) / 1000);
            this.showError(`Too many attempts. Try again in ${remainingTime} seconds.`);
            return;
        }
        
        const codeInput = document.getElementById('unlock-code');
        const enteredCode = codeInput ? codeInput.value.trim() : '';
        
        // Check if it's a valid code
        if (this.correctCode.includes(enteredCode)) {
            // Mark code as used immediately
            await this.markCodeAsUsed(enteredCode);
            
            // Authenticate with the code
            this.authenticate(enteredCode);
        } else {
            // Check if it's a used code
            const codeData = this.usedCodes.find(c => c.code === enteredCode);
            if (codeData) {
                this.showError('This code has already been used and cannot be used again.');
            } else {
                this.attemptCount++;
                this.saveSecurityState();
                
                this.updateAttemptsDisplay();
                
                if (this.attemptCount >= this.maxAttempts) {
                    this.lockout();
                } else {
                    this.showError(`Incorrect code. ${this.maxAttempts - this.attemptCount} attempts remaining.`);
                }
                
                if (codeInput) {
                    codeInput.value = '';
                }
            }
        }
    }
    
    authenticate(code) {
        console.log('[Security] authenticate() called with code:', code);
        
        const token = this.generateToken();
        const now = new Date().getTime();
        const expiry = now + (24 * 60 * 60 * 1000); // 24 hours from NOW
        
        const authData = { token, expiry, createdAt: now, expiresAt: new Date(expiry).toISOString() };
        localStorage.setItem('psychStudioAuth', JSON.stringify(authData));
        
        console.log('[Security] ✓ Token generated and saved to localStorage');
        console.log('[Security] Token expires in 24 hours at:', new Date(expiry).toISOString());
        console.log('[Security] Checking window.electronAPI...');
        console.log('[Security] typeof window:', typeof window);
        console.log('[Security] window.electronAPI defined:', typeof window !== 'undefined' && window.electronAPI);
        console.log('[Security] window.electronAPI.setAuthenticated type:', typeof window.electronAPI);
        
        // Save authentication state in Electron app
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.setAuthenticated === 'function') {
            console.log('[Security] ✓ Calling window.electronAPI.setAuthenticated()');
            window.electronAPI.setAuthenticated();
            console.log('[Security] ✓ IPC signal sent to main process');
        } else {
            console.error('[Security] ✗ electronAPI NOT available or method not a function');
            console.log('[Security] window properties:', window.electronAPI);
        }
        
        this.fileEncryption = new FileEncryption(code);
        this.resetSecurityState();
        
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            if (this.backgroundCanvas) {
                this.backgroundCanvas.destroy();
                this.backgroundCanvas = null;
            }
            loginScreen.remove();
        }
        
        this.showApp();
        
        this.loadProtectedFiles().catch(error => {
            console.error('Failed to load protected files:', error);
        });
    }
    
    async performIntegrityCheck() {
        if (this.devMode || this.bypassAuthentication) return;
        
        const expectedHash = "9c7bdfb63892de62581e2a861329e801af2e709adbd32f12753e138a394c22be";
        
        const currentHash = await this.calculateScriptHash();
        
        if (currentHash !== expectedHash) {
            this.handleTampering();
        }
    }
    
    calculateScriptHash() {
        const scripts = document.getElementsByTagName('script');
        let currentScript = '';
        
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].src.includes('security.js') || 
                scripts[i].textContent.includes('class SecurityManager')) {
                currentScript = scripts[i].textContent;
                break;
            }
        }
        
        if (!currentScript) {
            return "default";
        }
        
        let hash = 0;
        for (let i = 0; i < currentScript.length; i++) {
            const char = currentScript.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return hash.toString();
    }
    
    verifySignature() {
        if (this.devMode || this.bypassAuthentication) return true;
        
        const scripts = document.getElementsByTagName('script');
        let scriptContent = '';
        
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].src.includes('security.js') || 
                scripts[i].textContent.includes('class SecurityManager')) {
                scriptContent = scripts[i].textContent;
                break;
            }
        }
        
        if (!scriptContent) return false;
        
        const signatureMatch = scriptContent.match(/\/\/ SIGNATURE:([a-f0-9]+)/);
        if (!signatureMatch) return false;
        
        const signature = signatureMatch[1];
        const content = scriptContent.replace(/\/\/ SIGNATURE:[a-f0-9]+/, '');
        
        const calculatedSignature = this.simpleHash(content);
        return calculatedSignature === signature;
    }
    
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    
    async validateWithServer() {
        if (this.devMode || this.bypassAuthentication) return true;
        
        try {
            const requestId = this.generateRequestId();
            const fingerprint = this.getScriptFingerprint();
            
            const response = await fetch('https://your-secure-server.com/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-ID': requestId
                },
                body: JSON.stringify({
                    fingerprint: fingerprint,
                    timestamp: Date.now()
                })
            });
            
            if (!response.ok) {
                throw new Error('Server validation failed');
            }
            
            const data = await response.json();
            
            if (!data.valid) {
                this.handleTampering();
            }
            
            return true;
        } catch (error) {
            console.error('Server validation error:', error);
            return false;
        }
    }
    
    generateRequestId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    getScriptFingerprint() {
        const scripts = document.getElementsByTagName('script');
        let scriptContent = '';
        
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].src.includes('security.js') || 
                scripts[i].textContent.includes('class SecurityManager')) {
                scriptContent = scripts[i].textContent;
                break;
            }
        }
        
        return btoa(scriptContent)
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 32);
    }
    
    handleTampering() {
        localStorage.clear();
        sessionStorage.clear();
        
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                color: #f00;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-family: monospace;
                z-index: 999999;
            ">
                <h1>SECURITY BREACH DETECTED</h1>
                <p>The application has been tampered with.</p>
                <p>All data has been erased.</p>
            </div>
        `;
        
        throw new Error("Security script tampered with");
    }
    
    loadSecurityState() {
        const securityState = localStorage.getItem('psychStudioSecurity');
        
        if (securityState) {
            try {
                const state = JSON.parse(securityState);
                this.attemptCount = state.attemptCount || 0;
                this.lockoutEndTime = state.lockoutEndTime || 0;
                
                if (this.lockoutEndTime > 0 && new Date().getTime() > this.lockoutEndTime) {
                    this.resetSecurityState();
                } else {
                    this.isLocked = this.lockoutEndTime > 0;
                }
            } catch (e) {
                this.resetSecurityState();
            }
        } else {
            this.resetSecurityState();
        }
    }
    
    saveSecurityState() {
        const state = {
            attemptCount: this.attemptCount,
            lockoutEndTime: this.lockoutEndTime
        };
        localStorage.setItem('psychStudioSecurity', JSON.stringify(state));
    }
    
    resetSecurityState() {
        this.attemptCount = 0;
        this.isLocked = false;
        this.lockoutEndTime = 0;
        this.saveSecurityState();
    }
    
    lockout() {
        this.isLocked = true;
        this.lockoutEndTime = new Date().getTime() + this.lockoutTime;
        this.saveSecurityState();
        
        this.showError('Too many failed attempts. Application locked for 300 seconds.');
        
        const attemptsLeft = document.getElementById('attempts-left');
        if (attemptsLeft) {
            attemptsLeft.textContent = 'Application locked. Please wait...';
        }
        
        this.startLockoutCountdown();
    }
    
    startLockoutCountdown() {
        const countdown = setInterval(() => {
            const remainingTime = Math.ceil((this.lockoutEndTime - new Date().getTime()) / 1000);
            
            if (remainingTime <= 0) {
                clearInterval(countdown);
                this.isLocked = false;
                this.attemptCount = 0;
                this.saveSecurityState();
                this.updateAttemptsDisplay();
            } else {
                const attemptsLeft = document.getElementById('attempts-left');
                if (attemptsLeft) {
                    attemptsLeft.textContent = `Application locked. Try again in ${remainingTime} seconds.`;
                }
            }
        }, 1000);
    }
    
    updateAttemptsDisplay() {
        const attemptsLeft = document.getElementById('attempts-left');
        if (attemptsLeft) {
            if (this.isLocked) {
                const remainingTime = Math.ceil((this.lockoutEndTime - new Date().getTime()) / 1000);
                attemptsLeft.textContent = `Application locked. Try again in ${remainingTime} seconds.`;
            } else {
                attemptsLeft.textContent = `Attempts remaining: ${this.maxAttempts - this.attemptCount}`;
            }
        }
    }
    
    showError(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            setTimeout(() => {
                errorElement.textContent = '';
            }, 5000);
        }
    }
    
    showApp() {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'flex';
            window.dispatchEvent(new Event('resize'));
        }
        
        // Initialize the main application
        if (typeof window.initMainApp === 'function') {
            window.initMainApp();
        }
    }
    
    logout() {
        localStorage.removeItem('psychStudioAuth');
        this.resetSecurityState();
        location.reload();
    }
    
    async loadProtectedFiles() {
        console.log("Loading protected files...");
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the security manager with bypass enabled
    window.securityManager = new SecurityManager();
});
//SIGNATURE:7c3d5a1b8e9f2c4d6a0b7e1f3c5a8d9e2b4f6a1c