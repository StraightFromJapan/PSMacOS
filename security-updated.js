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
        // PERFORMANCE OPTIMIZATION: Disabled animated particles for smooth performance
        // Just draw a static gradient background once
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // No animation loop - single static frame
        return;
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
        this.userName = '';
        this.userEmail = '';
        this.userPassword = '';
        this.registeredUsers = []; // Cache for registered users
        
        // API URL - Connected to Render backend
        this.API_URL = window.location.hostname === 'localhost' || window.location.protocol === 'file:'
            ? 'http://localhost:3001'
            : 'https://psbe-gl5j.onrender.com';
        
        if (this.devMode) {
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
    
    async initSecurity() {
        // Initialize available codes
        // Accept only codes from the provided lists
        this.correctCode = [
            // String codes
            "020PSY969666POWER900", "030PSY969666POWER800", "040PSY969666POWER700", "050PSY969666POWER600", "060PSY969666POWER500", "070PSY969666POWER400", "080PSY969666POWER300", "090PSY969666POWER200", "100PSY969666POWER001", "200PSY969666POWER002", "0a2b0c9x6y9z61626392010", "0a2b0c9x6y9z62626392010", "0a2b0c9x6z9z62696392010", "0a2b0c9x6y9w62626392810", "0a2f0c9x6y9z62626390010", "0a2bhc9x6y9z62w26392010", "0a2x0c9xwy9z6262y392010",
            // Unicode codes (all provided blocks)
            "⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌ⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
            "⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶"
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
        
        // Load registered users
        await this.loadRegisteredUsers();
        
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
                
                // Create registeredUsers object store if it doesn't exist
                if (!db.objectStoreNames.contains('registeredUsers')) {
                    const userStore = db.createObjectStore('registeredUsers', { keyPath: 'email' });
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
    
    async loadRegisteredUsers() {
        try {
            // Get registered users from IndexedDB
            const indexedDBUsers = await this.getAllRegisteredUsersFromIndexedDB();
            
            // Get registered users from localStorage
            const localUsers = this.getRegisteredUsers();
            
            // Merge both sources, with IndexedDB taking precedence
            this.registeredUsers = [...new Map([...localUsers, ...indexedDBUsers].map(u => [u.email, u])).values()];

            // Sync any users that are only in localStorage to IndexedDB
            for (const userData of localUsers) {
                if (!indexedDBUsers.some(u => u.email === userData.email)) {
                    await this.saveUserToIndexedDB(userData);
                }
            }
            
            // Update localStorage with all users
            localStorage.setItem('psychStudioRegisteredUsers', JSON.stringify(this.registeredUsers));
            
            return this.registeredUsers;
        } catch (error) {
            console.error('Error loading registered users:', error);
            // Fallback to localStorage only
            const localUsers = this.getRegisteredUsers();
            this.registeredUsers = localUsers;
            return localUsers;
        }
    }
    
    async saveUserToIndexedDB(userData) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction('registeredUsers', 'readwrite');
            const objectStore = transaction.objectStore('registeredUsers');
            const request = objectStore.put(userData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllRegisteredUsersFromIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                console.warn('Database not initialized, returning empty array');
                resolve([]);
                return;
            }
            
            try {
                const transaction = this.db.transaction('registeredUsers', 'readonly');
                const objectStore = transaction.objectStore('registeredUsers');
                const request = objectStore.getAll();
                
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error('Error getting users from IndexedDB:', request.error);
                    resolve([]);
                };
            } catch (error) {
                console.error('Error accessing IndexedDB:', error);
                resolve([]);
            }
        });
    }
    
    getRegisteredUsers() {
        const usersJson = localStorage.getItem('psychStudioRegisteredUsers');
        return usersJson ? JSON.parse(usersJson) : [];
    }
    
    async registerUser(email, username, password) {
        const userData = {
            email: email,
            username: username,
            password: this.hashPassword(password), // Hash password before storing
            registeredAt: new Date().toISOString()
        };
        
        // Store in localStorage
        const localUsers = this.getRegisteredUsers();
        localUsers.push(userData);
        localStorage.setItem('psychStudioRegisteredUsers', JSON.stringify(localUsers));
        
        // Store in IndexedDB
        await this.saveUserToIndexedDB(userData);
        
        // Update cache
        this.registeredUsers.push(userData);
    }
    
    hashPassword(password) {
        // Simple hash function - in production use bcrypt or similar
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    
    verifyPassword(password, storedHash) {
        return this.hashPassword(password) === storedHash;
    }
    
    findUserByEmail(email) {
        return this.registeredUsers.find(u => u.email === email);
    }
    
    init() {
        if (this.isAuthenticated()) {
            this.showApp();
        } else {
            this.showLoginScreen();
        }
    }
    
    isAuthenticated() {
        const authData = localStorage.getItem('psychStudioAuth');
        if (!authData) return false;
        
        try {
            const { token, expiry, user } = JSON.parse(authData);
            
            // Check if token is still valid
            if (new Date().getTime() >= expiry) {
                return false;
            }
            
            // For returning users (stored user email), verify token
            // For code-based auth, verify token with code
            return token === this.generateToken() || (user && this.findUserByEmail(user));
        } catch (e) {
            return false;
        }
    }
    
    generateToken() {
        const fingerprint = this.getDeviceFingerprint();
        return btoa(this.correctCode[0] + fingerprint).substring(0, 32);
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
        // Hide the existing background canvas from HTML
        const existingCanvas = document.getElementById('backgroundCanvas');
        if (existingCanvas) {
            existingCanvas.style.display = 'none';
        }
        
        // Ensure app container is hidden
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'none';
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
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="license-tab" class="auth-tab active-tab" style="
                    flex: 1;
                    padding: 10px;
                    background: #930018;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: background 0.3s;
                ">Activate License</button>
                <button id="login-tab" class="auth-tab" style="
                    flex: 1;
                    padding: 10px;
                    background: rgba(255,255,255,0.1);
                    color: #aaa;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: background 0.3s;
                ">Login</button>
            </div>
            
            <div id="license-form" class="login-form">
                <p style="margin-bottom: 20px; color: #aaa;">Upload License File & Create Account</p>
                
                <div id="drop-zone" style="
                    width: 100%;
                    padding: 40px;
                    margin-bottom: 15px;
                    border: 2px dashed rgba(255,255,255,0.3);
                    border-radius: 5px;
                    background: rgba(255,255,255,0.05);
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-sizing: border-box;
                ">
                    <div style="font-size: 40px; margin-bottom: 10px;">📄</div>
                    <div style="color: #aaa;">Drop .psylic file here or click to browse</div>
                    <div id="file-name" style="color: #4CAF50; margin-top: 10px; font-size: 14px;"></div>
                </div>
                
                <input type="file" id="license-file-input" accept=".psylic,.txt,.json" style="display: none;">
                
                <input type="text" id="license-username" placeholder="Choose Username" style="
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
                <input type="password" id="license-password" placeholder="Create Password (6+ characters)" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 20px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    box-sizing: border-box;
                ">
                <button id="activate-license-btn" style="
                    width: 100%;
                    padding: 15px;
                    background: #930018;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.3s;
                " disabled>Activate License</button>
                <div style="margin-top: 15px; padding: 10px; background: rgba(147, 0, 24, 0.2); border-radius: 5px; font-size: 12px; color: #aaa;">
                    <strong>Note:</strong> Your username and password will be bound to this license. You can use it on up to 3 devices.
                </div>
            </div>
            
            <div id="login-credentials-form" class="login-form" style="display: none;">
                <p style="margin-bottom: 20px; color: #aaa;">Sign in with your credentials</p>
                <input type="text" id="login-username" placeholder="Username" style="
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
                <input type="password" id="login-password" placeholder="Password" style="
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 20px;
                    border: none;
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    box-sizing: border-box;
                ">
                <button id="login-btn" style="
                    width: 100%;
                    padding: 15px;
                    background: #930018;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.3s;
                ">Sign In</button>
            </div>
            
            <div id="error-message" style="color: #ff4444; margin-top: 15px; min-height: 20px;"></div>
`;        loginScreen.appendChild(loginForm);
        document.body.appendChild(loginScreen);
        
        // Tab switching
        const licenseTab = document.getElementById('license-tab');
        const loginTab = document.getElementById('login-tab');
        const licenseForm = document.getElementById('license-form');
        const loginCredentialsForm = document.getElementById('login-credentials-form');
        
        licenseTab.addEventListener('click', () => {
            licenseTab.style.background = '#930018';
            licenseTab.style.color = 'white';
            loginTab.style.background = 'rgba(255,255,255,0.1)';
            loginTab.style.color = '#aaa';
            licenseForm.style.display = 'block';
            loginCredentialsForm.style.display = 'none';
        });
        
        loginTab.addEventListener('click', () => {
            loginTab.style.background = '#930018';
            loginTab.style.color = 'white';
            licenseTab.style.background = 'rgba(255,255,255,0.1)';
            licenseTab.style.color = '#aaa';
            licenseForm.style.display = 'none';
            loginCredentialsForm.style.display = 'block';
        });
        
        // License file upload
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('license-file-input');
        const activateBtn = document.getElementById('activate-license-btn');
        let selectedLicenseFile = null;
        
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#930018';
            dropZone.style.background = 'rgba(147, 0, 24, 0.1)';
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
            dropZone.style.background = 'rgba(255,255,255,0.05)';
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(255,255,255,0.3)';
            dropZone.style.background = 'rgba(255,255,255,0.05)';
            
            if (e.dataTransfer.files.length > 0) {
                selectedLicenseFile = e.dataTransfer.files[0];
                document.getElementById('file-name').textContent = selectedLicenseFile.name;
                activateBtn.disabled = false;
                activateBtn.style.opacity = '1';
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedLicenseFile = e.target.files[0];
                document.getElementById('file-name').textContent = selectedLicenseFile.name;
                activateBtn.disabled = false;
                activateBtn.style.opacity = '1';
            }
        });
        
        activateBtn.addEventListener('click', () => this.activateLicense(selectedLicenseFile));
        
        // Login with credentials
        const loginBtn = document.getElementById('login-btn');
        const loginUsername = document.getElementById('login-username');
        const loginPassword = document.getElementById('login-password');
        
        loginBtn.addEventListener('click', () => {
            this.loginWithCredentials(loginUsername.value, loginPassword.value);
        });
        
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loginWithCredentials(loginUsername.value, loginPassword.value);
            }
        });
    }
    
    async activateLicense(file) {
        if (!file) {
            this.showError('Please select a license file');
            return;
        }
        
        const username = document.getElementById('license-username').value;
        const password = document.getElementById('license-password').value;
        
        if (!username || !password) {
            this.showError('Please enter username and password');
            return;
        }
        
        const activateBtn = document.getElementById('activate-license-btn');
        activateBtn.disabled = true;
        activateBtn.textContent = 'Activating...';
        
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const licenseData = JSON.parse(e.target.result);
                    
                    // Validate license structure - check for either 'code' or 'licenseCode'
                    const code = licenseData.code || licenseData.licenseCode;
                    if (!code) {
                        this.showError('Invalid license file format');
                        activateBtn.disabled = false;
                        activateBtn.textContent = 'Activate License';
                        return;
                    }
                    
                    // Get hardware ID
                    const hardwareID = this.getDeviceFingerprint();
                    
                    // Call backend API to activate license with timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                    
                    const response = await fetch(`${this.API_URL}/api/activate-license`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            licenseCode: code,
                            username: username,
                            password: password,
                            hardwareID: hardwareID
                        }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    const result = await response.json();
                    
                    if (!result.success) {
                        this.showError(result.error || 'Activation failed');
                        activateBtn.disabled = false;
                        activateBtn.textContent = 'Activate License';
                        return;
                    }
                    
                    // Update license file with hardware binding
                    licenseData.hardwareID = hardwareID;
                    licenseData.username = username;
                    licenseData.activatedAt = result.user.activatedAt;
                    
                    // Download updated license file
                    this.downloadUpdatedLicense(licenseData);
                    
                    // Create auth token
                    const authData = {
                        token: this.generateToken(),
                        username: username,
                        licenseCode: licenseData.code,
                        hardwareID: hardwareID,
                        expiry: new Date().getTime() + (30 * 24 * 60 * 60 * 1000),
                        user: username
                    };
                    
                    // Store authentication
                    localStorage.setItem('psychStudioAuth', JSON.stringify(authData));
                    
                    // Show success message
                    this.showError('✓ License activated successfully!');
                    document.getElementById('error-message').style.color = '#4CAF50';
                    
                    // Launch app after 1 second
                    setTimeout(() => {
                        this.showApp();
                    }, 1000);
                    
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    
                    // Check if it's a timeout error
                    if (parseError.name === 'AbortError') {
                        this.showError('Activation timeout - backend server may be starting up. Please try again in 30 seconds.');
                    } else if (parseError.message && parseError.message.includes('fetch')) {
                        this.showError('Network error - cannot reach activation server. Check your internet connection.');
                    } else {
                        this.showError('Invalid license file format or server error');
                    }
                    
                    activateBtn.disabled = false;
                    activateBtn.textContent = 'Activate License';
                }
            };
            
            reader.readAsText(file);
            
        } catch (error) {
            console.error('File read error:', error);
            this.showError('Failed to read license file');
            activateBtn.disabled = false;
            activateBtn.textContent = 'Activate License';
        }
    }
    
    downloadUpdatedLicense(licenseData) {
        const blob = new Blob([JSON.stringify(licenseData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PsyStudio_License_${licenseData.username}.psylic`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    async loginWithCredentials(username, password) {
        if (!username || !password) {
            this.showError('Please enter username and password');
            return;
        }
        
        const loginBtn = document.getElementById('login-btn');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        
        try {
            // Get hardware ID
            const hardwareID = this.getDeviceFingerprint();
            
            // Call backend API to login
            const response = await fetch(`${this.API_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    hardwareID: hardwareID
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                this.showError(result.error || 'Login failed');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
                return;
            }
            
            // Create auth token
            const authData = {
                token: result.token,
                username: username,
                licenseCode: result.user.licenseCode,
                hardwareID: hardwareID,
                expiry: new Date().getTime() + (30 * 24 * 60 * 60 * 1000),
                user: username
            };
            
            // Store authentication
            localStorage.setItem('psychStudioAuth', JSON.stringify(authData));
            
            // Show success message
            this.showError('✓ Login successful!');
            document.getElementById('error-message').style.color = '#4CAF50';
            
            // Launch app after 1 second
            setTimeout(() => {
                this.showApp();
            }, 1000);
            
        } catch (error) {
            this.showError('Connection error. Please check your internet connection.');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    }
    
    async attemptUnlock() {
        if (this.isLocked) {
            const remainingTime = Math.ceil((this.lockoutEndTime - new Date().getTime()) / 1000);
            this.showError(`Too many attempts. Try again in ${remainingTime} seconds.`);
            return;
        }
        
        // Get user input - ONLY USERNAME AND CODE
        const usernameInput = document.getElementById('username-input');
        const codeInput = document.getElementById('unlock-code');
        
        this.userName = usernameInput ? usernameInput.value.trim() : '';
        const enteredCode = codeInput ? codeInput.value.trim() : '';
        
        // Validate username
        if (!this.userName) {
            this.showError('Please enter a username.');
            return;
        }
        
        // Validate code
        if (!enteredCode) {
            this.showError('Please enter a registration code.');
            return;
        }
        
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
    
    authenticateReturningUser(user) {
        const token = this.generateToken();
        // PERMANENT authorization - no expiry date
        const expiry = new Date(9999, 12, 31).getTime(); // Year 9999
        localStorage.setItem('psychStudioAuth', JSON.stringify({ token, expiry, user: user.email }));
        
        this.fileEncryption = new FileEncryption(this.userPassword);
        this.resetSecurityState();
        
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            if (this.backgroundCanvas) {
                this.backgroundCanvas.destroy();
                this.backgroundCanvas = null;
            }
            loginScreen.remove();
        }
        
        // Show welcome popup
        this.showWelcomePopup();
        
        this.loadProtectedFiles().catch(error => {
            console.error('Failed to load protected files:', error);
        });
    }
    
    authenticate(code) {
        const token = this.generateToken();
        // PERMANENT authorization - no expiry date
        const expiry = new Date(9999, 12, 31).getTime(); // Year 9999
        localStorage.setItem('psychStudioAuth', JSON.stringify({ token, expiry, user: this.userEmail }));
        
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
        
        // Show welcome popup
        this.showWelcomePopup();
        
        this.loadProtectedFiles().catch(error => {
            console.error('Failed to load protected files:', error);
        });
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
            <h2 style="color: #717d9f; margin-bottom: 20px; font-size: 28px;">Welcome ${this.userName}!</h2>
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
                this.showApp();
            });
        }
    }
    
    async performIntegrityCheck() {
        if (this.devMode) return;
        
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
        if (this.devMode) return true;
        
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
        if (this.devMode) return true;
        
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
        // Remove login screen
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            if (this.backgroundCanvas) {
                this.backgroundCanvas.destroy();
                this.backgroundCanvas = null;
            }
            loginScreen.remove();
        }
        
        // Show the original background canvas
        const existingCanvas = document.getElementById('backgroundCanvas');
        if (existingCanvas) {
            existingCanvas.style.display = 'block';
        }
        
        // Show the app container
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'flex';
            window.dispatchEvent(new Event('resize'));
        }
    }
    
    logout() {
        localStorage.removeItem('psychStudioAuth');
        this.resetSecurityState();
        location.reload();
    }
    
    async loadProtectedFiles() {

    }
}

document.addEventListener('DOMContentLoaded', async () => {
    window.securityManager = new SecurityManager();
});
//SIGNATURE:7c3d5a1b8e9f2c4d6a0b7e1f3c5a8d9e2b4f6a1c
