const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database setup
const dbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                passwordHash TEXT NOT NULL,
                registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastLogin DATETIME
            )
        `, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
            } else {
                console.log('Users table ready');
            }
        });

        // Used codes table
        db.run(`
            CREATE TABLE IF NOT EXISTS usedCodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                usedBy TEXT,
                usedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating usedCodes table:', err);
            } else {
                console.log('UsedCodes table ready');
            }
        });

        // Login attempts table (for security)
        db.run(`
            CREATE TABLE IF NOT EXISTS loginAttempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                success BOOLEAN NOT NULL,
                attemptedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                ipAddress TEXT
            )
        `, (err) => {
            if (err) {
                console.error('Error creating loginAttempts table:', err);
            } else {
                console.log('LoginAttempts table ready');
            }
        });
    });
}

// Utility functions
function hashPassword(password) {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
}

function verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// Routes

/**
 * Register a new user
 * POST /api/auth/register
 * Body: { email, username, password, code }
 */
app.post('/api/auth/register', (req, res) => {
    const { email, username, password, code } = req.body;

    // Validation
    if (!email || !username || !password || !code) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Check if email already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (row) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Check if code has been used
        db.get('SELECT id FROM usedCodes WHERE code = ?', [code], (err, usedRow) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (usedRow) {
                return res.status(400).json({ success: false, message: 'Code has already been used' });
            }

            // In production, verify code against valid codes (from config or database)
            // For now, we'll accept any code and mark it as used
            const validCodes = process.env.VALID_CODES ? process.env.VALID_CODES.split(',') : [];
            
            if (validCodes.length > 0 && !validCodes.includes(code)) {
                return res.status(400).json({ success: false, message: 'Invalid registration code' });
            }

            // Hash password
            const passwordHash = hashPassword(password);

            // Insert user
            db.run(
                'INSERT INTO users (email, username, passwordHash) VALUES (?, ?, ?)',
                [email, username, passwordHash],
                function(err) {
                    if (err) {
                        console.error('Error inserting user:', err);
                        return res.status(500).json({ success: false, message: 'Registration failed' });
                    }

                    // Mark code as used
                    db.run(
                        'INSERT INTO usedCodes (code, usedBy) VALUES (?, ?)',
                        [code, email],
                        (err) => {
                            if (err) {
                                console.error('Error marking code as used:', err);
                            }
                        }
                    );

                    // Generate token
                    const user = { id: this.lastID, email, username };
                    const token = generateToken(user);

                    res.json({
                        success: true,
                        message: 'Registration successful',
                        token: token,
                        user: user
                    });
                }
            );
        });
    });
});

/**
 * Login with email and password
 * POST /api/auth/login
 * Body: { email, password }
 */
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip;

    // Validation
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    // Find user by email
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!user) {
            // Log failed attempt
            db.run(
                'INSERT INTO loginAttempts (email, success, ipAddress) VALUES (?, ?, ?)',
                [email, 0, clientIp]
            );
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Verify password
        if (!verifyPassword(password, user.passwordHash)) {
            // Log failed attempt
            db.run(
                'INSERT INTO loginAttempts (email, success, ipAddress) VALUES (?, ?, ?)',
                [email, 0, clientIp]
            );
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Update last login
        db.run(
            'UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Log successful attempt
        db.run(
            'INSERT INTO loginAttempts (email, success, ipAddress) VALUES (?, ?, ?)',
            [email, 1, clientIp]
        );

        // Generate token
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username
            }
        });
    });
});

/**
 * Verify token
 * POST /api/auth/verify
 * Headers: { Authorization: "Bearer <token>" }
 */
app.post('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    res.json({
        success: true,
        message: 'Token is valid',
        user: decoded
    });
});

/**
 * Get user info
 * GET /api/auth/user
 * Headers: { Authorization: "Bearer <token>" }
 */
app.get('/api/auth/user', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Get user from database
    db.get('SELECT id, email, username, registeredAt, lastLogin FROM users WHERE id = ?', [decoded.id], (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            user: user
        });
    });
});

/**
 * Check if email exists
 * POST /api/auth/check-email
 * Body: { email }
 */
app.post('/api/auth/check-email', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
    }

    db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({
            success: true,
            exists: !!row
        });
    });
});

/**
 * Check if code has been used
 * POST /api/auth/check-code
 * Body: { code }
 */
app.post('/api/auth/check-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: 'Code required' });
    }

    db.get('SELECT id, usedBy, usedAt FROM usedCodes WHERE code = ?', [code], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({
            success: true,
            used: !!row,
            usedBy: row ? row.usedBy : null,
            usedAt: row ? row.usedAt : null
        });
    });
});

/**
 * Logout (client should delete token)
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful. Please delete your token on the client.'
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n✅ Backend server running on http://localhost:${PORT}`);
    console.log(`📊 Database file: ${dbPath}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  POST   /api/auth/register     - Register new user`);
    console.log(`  POST   /api/auth/login        - Login user`);
    console.log(`  POST   /api/auth/verify       - Verify token`);
    console.log(`  GET    /api/auth/user         - Get user info`);
    console.log(`  POST   /api/auth/check-email  - Check if email exists`);
    console.log(`  POST   /api/auth/check-code   - Check if code was used`);
    console.log(`  POST   /api/auth/logout       - Logout`);
    console.log(`  GET    /api/health            - Health check\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

module.exports = app;
