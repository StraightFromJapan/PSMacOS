// Background Canvas Class - EXACT COPY FROM security-updated.js
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

// Backend Security Manager with exact UI from security-updated.js
class SecurityManager {
    constructor() {
        // Auto-detect backend URL: local dev vs production
        const defaultUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000'
            : 'https://psychological-studio-backend.onrender.com';
        this.backendUrl = localStorage.getItem('backendUrl') || defaultUrl;
        this.userName = '';
        this.userEmail = '';
        this.userPassword = '';
        this.token = localStorage.getItem('authToken') || null;
        this.user = JSON.parse(localStorage.getItem('currentUser') || 'null');
        this.backgroundCanvas = null;
        this.attemptCount = 0;
        this.maxAttempts = 5;
        this.lockoutTime = 300000; // 5 minutes
        this.isLocked = false;
        this.lockoutEndTime = 0;
        
        // Valid codes from security-updated.js
        this.validCodes = [
            // String codes
            "020PSY969666POWER900", "030PSY969666POWER800", "040PSY969666POWER700", "050PSY969666POWER600", "060PSY969666POWER500", "070PSY969666POWER400", "080PSY969666POWER300", "090PSY969666POWER200", "100PSY969666POWER001", "200PSY969666POWER002", "0a2b0c9x6y9z61626392010", "0a2b0c9x6y9z62626392010", "0a2b0c9x6z9z62696392010", "0a2b0c9x6y9w62626392810", "0a2f0c9x6y9z62626390010", "0a2bhc9x6y9z62w26392010", "0a2x0c9xwy9z6262y392010",
            // Unicode codes (all provided blocks)
            "⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌ⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶"
        ];
        
        this.loadSecurityState();
        this.init();
    }
    
    async init() {
        // Check if token is still valid
        if (this.token && this.user) {
            try {
                const response = await fetch(`${this.backendUrl}/api/auth/verify`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    // Token is valid, show app
                    this.userName = this.user.username;
                    this.showWelcomePopup();
                    this.showApp();
                    return;
                }
            } catch (error) {
                console.error('Token verification error:', error);
            }
        }
        
        // Token invalid or doesn't exist, show login
        this.showLoginScreen();
    }
    
    showLoginScreen() {
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
                <input type="text" id="username-input" placeholder="Username" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 15px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    box-sizing: border-box;
                ">
                <input type="email" id="email-input" placeholder="Email" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 15px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    box-sizing: border-box;
                ">
                <input type="password" id="password-input" placeholder="Password" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 15px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    box-sizing: border-box;
                ">
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
        
        // Get user input
        const usernameInput = document.getElementById('username-input');
        const emailInput = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');
        const codeInput = document.getElementById('unlock-code');
        
        this.userName = usernameInput ? usernameInput.value.trim() : '';
        this.userEmail = emailInput ? emailInput.value.trim() : '';
        this.userPassword = passwordInput ? passwordInput.value.trim() : '';
        const enteredCode = codeInput ? codeInput.value.trim() : '';
        
        // Validate email and password (required for both paths)
        if (!this.userEmail) {
            this.showError('Please enter an email.');
            return;
        }
        
        if (!this.userPassword) {
            this.showError('Please enter a password.');
            return;
        }
        
        try {
            // Check if email exists
            const checkResponse = await fetch(`${this.backendUrl}/api/auth/check-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.userEmail })
            });
            
            const checkData = await checkResponse.json();
            
            if (checkData.exists) {
                // Returning user - login with email + password only
                await this.loginUser();
            } else {
                // New user - requires username and code
                if (!this.userName) {
                    this.showError('Please enter a username.');
                    return;
                }
                
                if (!enteredCode) {
                    this.showError('Please enter a registration code.');
                    return;
                }
                
                // Register new user
                await this.registerUser(enteredCode);
            }
        } catch (error) {
            this.showError('Connection error: ' + error.message);
            console.error('Unlock error:', error);
        }
    }
    
    async registerUser(code) {
        try {
            // Validate code format first (must be in valid codes list)
            if (!this.validCodes.includes(code)) {
                this.showError('❌ Invalid registration code.');
                const codeInput = document.getElementById('unlock-code');
                if (codeInput) codeInput.value = '';
                return;
            }
            
            this.showError('Processing registration...');
            
            const response = await fetch(`${this.backendUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.userEmail,
                    username: this.userName,
                    password: this.userPassword,
                    code: code
                })
            });
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // Server returned HTML (likely 404 or error page)
                const text = await response.text();
                if (text.includes('Not found') || text.includes('Cannot POST')) {
                    this.showError('❌ Backend server is not running. Please start the backend server with: npm start');
                } else {
                    this.showError('❌ Backend error: Invalid response format');
                }
                console.error('Backend response:', text.substring(0, 200));
                return;
            }
            
            const data = await response.json();
            
            if (response.ok) {
                // Store token and user info
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.token = data.token;
                this.user = data.user;
                
                // Remove login screen
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    if (this.backgroundCanvas) {
                        this.backgroundCanvas.destroy();
                        this.backgroundCanvas = null;
                    }
                    loginScreen.remove();
                }
                
                // Show welcome popup and app
                this.resetSecurityState();
                this.showWelcomePopup();
                this.showApp();
            } else {
                this.showError('❌ ' + (data.message || 'Registration failed'));
                
                const codeInput = document.getElementById('unlock-code');
                if (codeInput) codeInput.value = '';
            }
        } catch (error) {
            this.showError('Error: ' + error.message + ' (Is the backend server running?)');
            console.error('Register error:', error);
        }
    }
    
    async loginUser() {
        try {
            this.showError('Processing login...');
            
            const response = await fetch(`${this.backendUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.userEmail,
                    password: this.userPassword
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Store token and user info
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.token = data.token;
                this.user = data.user;
                
                // Remove login screen
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    if (this.backgroundCanvas) {
                        this.backgroundCanvas.destroy();
                        this.backgroundCanvas = null;
                    }
                    loginScreen.remove();
                }
                
                // Show welcome popup and app
                this.resetSecurityState();
                this.showWelcomePopup();
                this.showApp();
            } else {
                this.showError('Login failed: ' + data.message);
                
                const passwordInput = document.getElementById('password-input');
                if (passwordInput) passwordInput.value = '';
            }
        } catch (error) {
            this.showError('Error: ' + error.message);
            console.error('Login error:', error);
        }
    }
    
    showWelcomePopup() {
        const popupOverlay = document.createElement('div');
        popupOverlay.id = 'welcome-popup-overlay';
        popupOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            font-family: Arial, sans-serif;
        `;
        
        const popupContent = document.createElement('div');
        popupContent.style.cssText = `
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #930018;
            border-radius: 10px;
            padding: 50px;
            max-width: 600px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            color: white;
        `;
        
        popupContent.innerHTML = `
            <h2 style="color: #717d9f; margin-bottom: 20px; font-size: 28px;">Welcome ${this.user.username}!</h2>
            <p style="color: #aaa; margin-bottom: 10px; font-size: 18px;">You now have access to <span style="color: #930018; font-weight: bold;">Pro</span>!</p>
            
            <h3 style="color: #717d9f; margin-top: 30px; margin-bottom: 20px; font-size: 20px;">You can now access:</h3>
            
            <ul style="
                list-style: none;
                text-align: left;
                padding: 20px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 5px;
                margin: 0 auto;
                width: fit-content;
            ">
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Record Session
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Record directly into Button
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Unlimited Sample Upload
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>LFO's & Automations
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Synth with Piano Roll & Sound design controls
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>App Themes
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Arrangement Mode/Track View
                </li>
                <li style="margin: 12px 0; color: #aaa; font-size: 16px;">
                    <span style="color: #930018; margin-right: 10px;">●</span>Future updates
                </li>
            </ul>
            
            <button id="close-welcome-btn" style="
                margin-top: 30px;
                padding: 15px 40px;
                background: #930018;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                transition: background 0.3s;
            ">Get Started</button>
        `;
        
        popupOverlay.appendChild(popupContent);
        document.body.appendChild(popupOverlay);
        
        const closeBtn = document.getElementById('close-welcome-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                popupOverlay.remove();
            });
        }
    }
    
    showError(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            setTimeout(() => {
                if (errorElement) errorElement.textContent = '';
            }, 5000);
        }
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
    
    lockout() {
        this.isLocked = true;
        this.lockoutEndTime = new Date().getTime() + this.lockoutTime;
        this.saveSecurityState();
        
        this.showError('Too many failed attempts. Application locked for 300 seconds.');
        
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
                this.updateAttemptsDisplay();
            }
        }, 1000);
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
    
    showApp() {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'flex';
            window.dispatchEvent(new Event('resize'));
        }
    }
    
    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        this.resetSecurityState();
        location.reload();
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    window.securityManager = new SecurityManager();
});
