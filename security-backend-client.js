// Security Manager with Backend Integration
// Uses Express backend server for persistent storage instead of IndexedDB

class SecurityManager {
    constructor(backendUrl = 'http://localhost:3000') {
        this.backendUrl = backendUrl;
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.fileEncryption = null;
        this.backgroundCanvas = null;
        
        // Code-based backup (in case backend unavailable)
        this.correctCode = [
            "PSYPOWER2024",
            "STUDIO123",
            "UNLOCKED",
            "WELCOME"
        ];
        
        this.devMode = false;
        this.maxAttempts = 5;
        this.attemptCount = 0;
        this.lockoutTime = 300000; // 5 minutes
        this.isLocked = false;
        this.lockoutEndTime = 0;
    }

    /**
     * Initialize security (check if already authenticated)
     */
    async init() {
        try {
            // Check if we have a valid token
            if (this.token) {
                const response = await fetch(`${this.backendUrl}/api/auth/verify`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.user = data.user;
                    console.log('✅ Token verified, user authenticated');
                    return true;
                } else {
                    // Token expired or invalid
                    this.clearAuth();
                    this.showLoginScreen();
                    return false;
                }
            } else {
                this.showLoginScreen();
                return false;
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            this.showLoginScreen();
            return false;
        }
    }

    /**
     * Register new user
     */
    async registerUser(email, username, password, code) {
        try {
            const response = await fetch(`${this.backendUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email.toLowerCase(),
                    username: username,
                    password: password,
                    code: code
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Registration failed');
            }

            // Store token and user info
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('authToken', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            console.log('✅ Registration successful');
            return data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Login user with email and password
     */
    async loginUser(email, password) {
        try {
            const response = await fetch(`${this.backendUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email.toLowerCase(),
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            // Store token and user info
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('authToken', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            console.log('✅ Login successful');
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    /**
     * Check if email already registered
     */
    async checkEmailExists(email) {
        try {
            const response = await fetch(`${this.backendUrl}/api/auth/check-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: email.toLowerCase() })
            });

            const data = await response.json();
            return data.exists;
        } catch (error) {
            console.error('Error checking email:', error);
            return false;
        }
    }

    /**
     * Check if code has been used
     */
    async checkCodeUsed(code) {
        try {
            const response = await fetch(`${this.backendUrl}/api/auth/check-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code: code })
            });

            const data = await response.json();
            return data.used;
        } catch (error) {
            console.error('Error checking code:', error);
            return false;
        }
    }

    /**
     * Logout user
     */
    logout() {
        this.clearAuth();
        this.showLoginScreen();
        console.log('✅ Logged out');
    }

    /**
     * Clear authentication
     */
    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    }

    /**
     * Show login screen
     */
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
            
            <div id="auth-form" class="login-form">
                <p style="margin-bottom: 20px; color: #aaa;">Secure Login</p>
                
                <input type="text" id="username-input" placeholder="Username (new users only)" style="
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
                
                <input type="password" id="code-input" placeholder="Registration Code (new users)" style="
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
                    margin-bottom: 15px;
                ">Login / Register</button>
                
                <p id="login-status" style="margin-top: 15px; color: #aaa; font-size: 12px;"></p>
            </div>
        `;

        document.body.appendChild(loginScreen);

        // Add event listeners
        const loginBtn = document.getElementById('login-btn');
        const statusMsg = document.getElementById('login-status');

        loginBtn.addEventListener('click', async () => {
            await this.attemptLogin(statusMsg);
        });

        // Allow Enter key to login
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && document.getElementById('login-screen')) {
                this.attemptLogin(statusMsg);
            }
        });
    }

    /**
     * Attempt login or registration
     */
    async attemptLogin(statusMsg) {
        const usernameInput = document.getElementById('username-input');
        const emailInput = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');
        const codeInput = document.getElementById('code-input');

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const code = codeInput.value.trim();

        // Validate email and password (required for both)
        if (!email) {
            this.showAuthError('Please enter an email.', statusMsg);
            return;
        }

        if (!password) {
            this.showAuthError('Please enter a password.', statusMsg);
            return;
        }

        try {
            statusMsg.textContent = 'Checking credentials...';
            statusMsg.style.color = '#717d9f';

            // Check if email exists
            const emailExists = await this.checkEmailExists(email);

            if (emailExists) {
                // Existing user - login with email + password
                statusMsg.textContent = 'Logging in...';
                try {
                    await this.loginUser(email, password);
                    this.showWelcomePopup();
                    this.removeLoginScreen();
                } catch (error) {
                    this.showAuthError(error.message, statusMsg);
                    passwordInput.value = '';
                }
            } else {
                // New user - require code and username
                if (!username) {
                    this.showAuthError('New users must enter a username.', statusMsg);
                    return;
                }

                if (!code) {
                    this.showAuthError('New users must enter a registration code.', statusMsg);
                    return;
                }

                // Check if code was already used
                const codeUsed = await this.checkCodeUsed(code);
                if (codeUsed) {
                    this.showAuthError('This code has already been used.', statusMsg);
                    codeInput.value = '';
                    return;
                }

                // Check if code is valid (backup check if backend unavailable)
                if (!this.correctCode.includes(code)) {
                    this.showAuthError('Invalid registration code.', statusMsg);
                    codeInput.value = '';
                    return;
                }

                // Register new user
                statusMsg.textContent = 'Registering...';
                try {
                    await this.registerUser(email, username, password, code);
                    this.showWelcomePopup();
                    this.removeLoginScreen();
                } catch (error) {
                    this.showAuthError(error.message, statusMsg);
                    codeInput.value = '';
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.showAuthError('Connection error. Please try again.', statusMsg);
        }
    }

    /**
     * Show authentication error
     */
    showAuthError(message, statusMsg) {
        statusMsg.textContent = message;
        statusMsg.style.color = '#ff6b6b';
    }

    /**
     * Show welcome popup
     */
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
            
            <ul style="text-align: left; display: inline-block; color: #aaa; list-style: none; padding: 0;">
                <li style="margin-bottom: 10px;">✅ Full Psychological Studio</li>
                <li style="margin-bottom: 10px;">✅ All Audio Effects</li>
                <li style="margin-bottom: 10px;">✅ Advanced EQ System</li>
                <li style="margin-bottom: 10px;">✅ LFO Automation</li>
                <li style="margin-bottom: 10px;">✅ Arrangement Tools</li>
                <li style="margin-bottom: 10px;">✅ Premium Features</li>
            </ul>
            
            <p style="color: #999; margin-top: 30px; font-size: 14px; font-style: italic;">Click anywhere to continue</p>
        `;

        popupOverlay.appendChild(popupContent);
        document.body.appendChild(popupOverlay);

        popupOverlay.addEventListener('click', () => {
            popupOverlay.remove();
        });

        popupContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Remove login screen
     */
    removeLoginScreen() {
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            if (this.backgroundCanvas) {
                this.backgroundCanvas.destroy();
                this.backgroundCanvas = null;
            }
            loginScreen.remove();
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.user;
    }
}

// Initialize on page load
let securityManager;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize security manager (connect to backend)
    const backendUrl = window.BACKEND_URL || 'http://localhost:3000';
    securityManager = new SecurityManager(backendUrl);

    // Check authentication
    const isAuth = await securityManager.init();

    if (!isAuth) {
        console.log('User not authenticated, showing login screen');
    } else {
        console.log('User authenticated:', securityManager.getUser());
    }
});
