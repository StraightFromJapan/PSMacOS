const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// JSON Database paths
const dbPath = path.join(dataDir, 'database.json');

// Initialize database structure
let db = {
    users: [],
    devices: [],
    sessions: []
};

// Load database from file
function loadDatabase() {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = JSON.parse(data);
            console.log('Database loaded:', dbPath);
        } else {
            saveDatabase();
            console.log('Database initialized:', dbPath);
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db = { users: [], devices: [], sessions: [] };
    }
}

// Save database to file
function saveDatabase() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Load database on startup
loadDatabase();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Helper: Hash password with PBKDF2
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateLicenseCode() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// === ENDPOINTS ===

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register new user (admin only - for generating license codes)
app.post('/api/register', (req, res) => {
    try {
        const { username, adminKey } = req.body;

        console.log('Registration request received:', { username, adminKey: adminKey ? 'present' : 'missing' });

        // Admin authentication
        if (adminKey !== 'PSYPOWER_ADMIN_2025') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        // Check if username exists
        if (db.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const licenseCode = generateLicenseCode();

        const newUser = {
            id: db.users.length + 1,
            username,
            password_hash: null,
            license_code: licenseCode,
            created_at: new Date().toISOString(),
            last_login: null,
            is_activated: false
        };

        db.users.push(newUser);
        saveDatabase();

        console.log('✅ User registered:', username, 'License:', licenseCode.substring(0, 20) + '...');
        console.log('Total users in DB:', db.users.length);

        res.json({
            success: true,
            username,
            license_code: licenseCode,
            user_id: newUser.id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login with username/password (up to 3 devices)
app.post('/api/login', (req, res) => {
    try {
        const { username, password, hardware_id } = req.body;

        if (!username || !password || !hardware_id) {
            return res.status(400).json({ error: 'Username, password, and hardware ID required' });
        }

        const user = db.users.find(u => u.username === username);

        if (!user || !user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (passwordHash !== user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_activated) {
            return res.status(401).json({ error: 'License not activated. Please activate first.' });
        }

        // Check current device count
        const devices = db.devices.filter(d => d.user_id === user.id);
        const existingDevice = devices.find(d => d.hardware_id === hardware_id);

        if (!existingDevice) {
            // New device
            if (devices.length >= 3) {
                return res.status(403).json({ 
                    error: 'Maximum device limit reached (3 devices). Please deactivate a device first.',
                    device_count: devices.length
                });
            }

            // Add new device
            const newDevice = {
                id: db.devices.length + 1,
                user_id: user.id,
                hardware_id,
                device_name: `Device ${devices.length + 1}`,
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString()
            };
            db.devices.push(newDevice);
        } else {
            // Update last seen
            existingDevice.last_seen = new Date().toISOString();
        }

        // Generate session token (30 days)
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const newSession = {
            id: db.sessions.length + 1,
            user_id: user.id,
            session_token: sessionToken,
            hardware_id,
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString()
        };
        db.sessions.push(newSession);

        // Update last login
        user.last_login = new Date().toISOString();

        saveDatabase();

        res.json({
            success: true,
            session_token: sessionToken,
            expires_at: expiresAt.toISOString(),
            username: user.username,
            device_count: existingDevice ? devices.length : devices.length + 1,
            is_new_device: !existingDevice
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Activate license with hardware binding (first time setup)
// User uploads .psylic file (contains licenseCode) + enters username + password
app.post('/api/activate-license', (req, res) => {
    try {
        const { licenseCode, username, password, hardwareID } = req.body;

        console.log('Activation request received:', { 
            licenseCode: licenseCode ? licenseCode.substring(0, 20) + '...' : 'missing',
            username,
            hardwareID: hardwareID ? 'present' : 'missing', 
            password: password ? 'present' : 'missing' 
        });
        console.log('Current users in database:', db.users.length);

        if (!licenseCode || !username || !hardwareID || !password) {
            return res.status(400).json({ error: 'License code, username, hardware ID, and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Find unused license by license code
        const user = db.users.find(u => u.license_code === licenseCode && !u.is_activated);

        if (!user) {
            console.log('❌ License code not found or already used');
            return res.status(404).json({ error: 'Invalid or already activated license code' });
        }

        console.log('✅ Valid unused license found, binding to username:', username);

        // Bind license to the username/password they provide
        user.username = username;
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        user.password_hash = passwordHash;
        user.is_activated = true;

        // Add first device (Device 1 of 3)
        const newDevice = {
            id: db.devices.length + 1,
            user_id: user.id,
            hardware_id: hardwareID,
            device_name: 'Device 1',
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString()
        };
        db.devices.push(newDevice);

        // Generate session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const newSession = {
            id: db.sessions.length + 1,
            user_id: user.id,
            session_token: sessionToken,
            hardware_id: hardwareID,
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString()
        };
        db.sessions.push(newSession);

        saveDatabase();

        res.json({
            success: true,
            session_token: sessionToken,
            expires_at: expiresAt.toISOString(),
            username: user.username,
            message: 'License activated successfully'
        });

    } catch (error) {
        console.error('Activation error:', error);
        res.status(500).json({ error: 'Activation failed' });
    }
});

// Verify session
app.post('/api/verify-session', (req, res) => {
    try {
        const { session_token, hardware_id } = req.body;

        if (!session_token || !hardware_id) {
            return res.status(400).json({ error: 'Session token and hardware ID required' });
        }

        const session = db.sessions.find(s => 
            s.session_token === session_token && 
            s.hardware_id === hardware_id && 
            new Date(s.expires_at) > new Date()
        );

        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const user = db.users.find(u => u.id === session.user_id);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.json({
            valid: true,
            username: user.username,
            license_code: user.license_code,
            expires_at: session.expires_at
        });

    } catch (error) {
        console.error('Session verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    try {
        const { session_token } = req.body;

        if (session_token) {
            const sessionIndex = db.sessions.findIndex(s => s.session_token === session_token);
            if (sessionIndex !== -1) {
                db.sessions.splice(sessionIndex, 1);
                saveDatabase();
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Get user info
app.get('/api/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        const { session_token } = req.headers;

        // Verify session
        const session = db.sessions.find(s => 
            s.session_token === session_token && 
            new Date(s.expires_at) > new Date()
        );
        
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = db.users.find(u => u.username === username);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            username: user.username,
            license_code: user.license_code,
            created_at: user.created_at,
            last_login: user.last_login
        });

    } catch (error) {
        console.error('User fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ License backend running on port ${PORT}`);
    console.log(`Database: ${dbPath}`);
});
