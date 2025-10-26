const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'psypower-studio-secret-key-change-in-production-12345';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
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
        if (err) console.error('Error creating users table:', err);
        else console.log('✅ Users table ready');
    });

    // Used codes table
    db.run(`
        CREATE TABLE IF NOT EXISTS usedCodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            usedBy TEXT NOT NULL,
            usedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating usedCodes table:', err);
        else console.log('✅ Used codes table ready');
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
        if (err) console.error('Error creating loginAttempts table:', err);
        else console.log('✅ Login attempts table ready');
    });
}

// Valid registration codes - FROM security-updated.js
const VALID_CODES = [
    // String codes
    "020PSY969666POWER900", "030PSY969666POWER800", "040PSY969666POWER700", "050PSY969666POWER600", "060PSY969666POWER500", "070PSY969666POWER400", "080PSY969666POWER300", "090PSY969666POWER200", "100PSY969666POWER001", "200PSY969666POWER002", "0a2b0c9x6y9z61626392010", "0a2b0c9x6y9z62626392010", "0a2b0c9x6z9z62696392010", "0a2b0c9x6y9w62626392810", "0a2f0c9x6y9z62626390010", "0a2bhc9x6y9z62w26392010", "0a2x0c9xwy9z6262y392010",
    // Unicode codes (all provided blocks)
    "⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
    "⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌ⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
    "⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶⭷⭸⭹⭺⭻⭼⭽⭾⭿⮀⮁⮂⮃⮄⮅⮆⮇⮈⮉⮊⮋⮌⮍⮎⮏⮐⮑⮒⮓⮔⮕⮖⮗⮘⮙⮚⮛⮜⮝⮞⮟⮠⮡⮢⮣⮤⮥⮦⮧⮨⮩⮪⮫⮬⮭⮮⮯⮰⮱⮲⮳⮴⮵⮶⮷⮸⮹⮺⮻⮼⮽⮾⮿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ",
    "⮷⮸⮹⮺⮻⮼⮽⮾⮿⯀⯁⯂⯃⯄⯅⯆⯇⯈⯉⯊⯋⯌⯍⯎⯏⯐⯑⯒⯓⯔⯕⯖⯗⯘⯙⯚⯛⯜⯝⯞⯟⯠⯡⯢⯣⯤⯥⯦⯧⯨⯩⯪⯫⯬⯭⯮⯯⯰⯱⯲⯳⯴⯵⯶⯷⯸⯹⯺⯻⯼⯽⯾⯿ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱠⱡⱢⱣⱤⱥⱦⱧⱨⱩⱪⱫⱬⱭⱮⱯⱰⱱⱲⱳⱴⱵⱶⱷⱸⱹⱺⱻⱼⱽⱾⱿⲀⲁⲂⲃⲄⲅⲆⲇⲈⲉⲊⲋⲌⲍⲎⲏⲐⲑⲒⲓⲔⲕ⹿⺀⺁⺂⺃⺄⺅⺆⺇⺈⺉⺊⺋⺌⺍⺎⺏⺐⺑⺒⺓⺔⺕⺖⺗⺘⺙⺚⺛⭖⭗⭘⭙⭚⭛⭜⭝⭞⭟⭠⭡⭢⭣⭤⭥⭦⭧⭨⭩⭪⭫⭬⭭⭮⭯⭰⭱⭲⭳⭴⭵⭶"
];

// Helper: Hash password
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

// Helper: Verify password
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Helper: Generate JWT token
function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Helper: Verify JWT token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// ============================================
// REGISTER ENDPOINT
// ============================================
app.post('/api/auth/register', async (req, res) => {
    const { email, username, password, code } = req.body;

    // Validate input
    if (!email || !username || !password || !code) {
        return res.status(400).json({ message: '❌ All fields are required.' });
    }

    if (!VALID_CODES.includes(code)) {
        return res.status(400).json({ message: '❌ Invalid registration code.' });
    }

    try {
        // Check if code was already used
        db.get('SELECT * FROM usedCodes WHERE code = ?', [code], async (err, codeRow) => {
            if (err) {
                return res.status(500).json({ message: '❌ Database error.' });
            }

            if (codeRow) {
                return res.status(400).json({ message: '❌ This code has already been used and cannot be used again.' });
            }

            // Check if email already registered
            db.get('SELECT * FROM users WHERE email = ?', [email], async (err, userRow) => {
                if (err) {
                    return res.status(500).json({ message: '❌ Database error.' });
                }

                if (userRow) {
                    return res.status(400).json({ message: '❌ Email already registered.' });
                }

                try {
                    // Hash password
                    const passwordHash = await hashPassword(password);

                    // Insert user
                    db.run(
                        'INSERT INTO users (email, username, passwordHash) VALUES (?, ?, ?)',
                        [email, username, passwordHash],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ message: '❌ Registration failed.' });
                            }

                            // Mark code as used (PERMANENTLY - this is the key!)
                            db.run(
                                'INSERT INTO usedCodes (code, usedBy) VALUES (?, ?)',
                                [code, email],
                                (err) => {
                                    if (err) {
                                        console.error('Error marking code as used:', err);
                                        return res.status(500).json({ message: '❌ Failed to register code usage.' });
                                    }
                                    
                                    console.log(`✅ Code "${code}" permanently registered to user ${email}`);
                                }
                            );

                            // Get the newly created user
                            db.get('SELECT id, email, username FROM users WHERE email = ?', [email], (err, user) => {
                                if (err) {
                                    return res.status(500).json({ message: '❌ Failed to retrieve user.' });
                                }

                                const token = generateToken(user);

                                res.json({
                                    message: '✅ Registration successful!',
                                    token: token,
                                    user: {
                                        id: user.id,
                                        email: user.email,
                                        username: user.username
                                    }
                                });
                            });
                        }
                    );
                } catch (error) {
                    res.status(500).json({ message: '❌ Server error: ' + error.message });
                }
            });
        });
    } catch (error) {
        res.status(500).json({ message: '❌ Server error: ' + error.message });
    }
});

// ============================================
// LOGIN ENDPOINT
// ============================================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '❌ Email and password are required.' });
    }

    try {
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ message: '❌ Database error.' });
            }

            if (!user) {
                return res.status(401).json({ message: '❌ User not found.' });
            }

            // Verify password
            const passwordMatch = await verifyPassword(password, user.passwordHash);

            if (!passwordMatch) {
                return res.status(401).json({ message: '❌ Incorrect password.' });
            }

            // Update last login
            db.run(
                'UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );

            const token = generateToken(user);

            res.json({
                message: '✅ Login successful!',
                token: token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username
                }
            });
        });
    } catch (error) {
        res.status(500).json({ message: '❌ Server error: ' + error.message });
    }
});

// ============================================
// VERIFY TOKEN ENDPOINT
// ============================================
app.post('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: '❌ No token provided.' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ message: '❌ Invalid or expired token.' });
    }

    res.json({
        message: '✅ Token is valid!',
        user: decoded
    });
});

// ============================================
// GET USER INFO ENDPOINT
// ============================================
app.get('/api/auth/user', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: '❌ No token provided.' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ message: '❌ Invalid or expired token.' });
    }

    try {
        db.get('SELECT id, email, username, registeredAt, lastLogin FROM users WHERE id = ?', [decoded.id], (err, user) => {
            if (err) {
                return res.status(500).json({ message: '❌ Database error.' });
            }

            if (!user) {
                return res.status(404).json({ message: '❌ User not found.' });
            }

            res.json({
                message: '✅ User info retrieved!',
                user: user
            });
        });
    } catch (error) {
        res.status(500).json({ message: '❌ Server error: ' + error.message });
    }
});

// ============================================
// CHECK EMAIL ENDPOINT
// ============================================
app.post('/api/auth/check-email', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: '❌ Email is required.' });
    }

    try {
        db.get('SELECT id, email, username FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                return res.status(500).json({ message: '❌ Database error.' });
            }

            res.json({
                exists: !!user,
                username: user ? user.username : null
            });
        });
    } catch (error) {
        res.status(500).json({ message: '❌ Server error: ' + error.message });
    }
});

// ============================================
// CHECK CODE ENDPOINT
// ============================================
app.post('/api/auth/check-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ message: '❌ Code is required.' });
    }

    try {
        db.get('SELECT * FROM usedCodes WHERE code = ?', [code], (err, codeRow) => {
            if (err) {
                return res.status(500).json({ message: '❌ Database error.' });
            }

            const isUsed = !!codeRow;
            const isValid = VALID_CODES.includes(code);

            res.json({
                isValid: isValid,
                isUsed: isUsed,
                message: isUsed ? 'Code already used' : isValid ? 'Code is valid' : 'Invalid code'
            });
        });
    } catch (error) {
        res.status(500).json({ message: '❌ Server error: ' + error.message });
    }
});

// ============================================
// LOGOUT ENDPOINT
// ============================================
app.post('/api/auth/logout', (req, res) => {
    res.json({ message: '✅ Logged out successfully!' });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: '✅ Backend server is running',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🎵 Psychological Studio Backend       ║
║   Server Running Successfully           ║
╚════════════════════════════════════════╝

✅ Backend server running on http://localhost:${PORT}
📊 Database: ${dbPath}
🔐 JWT Secret: configured
📝 API Endpoints ready:
   - POST /api/auth/register
   - POST /api/auth/login
   - POST /api/auth/verify
   - GET  /api/auth/user
   - POST /api/auth/check-email
   - POST /api/auth/check-code
   - POST /api/auth/logout
   - GET  /api/health

⚠️  Press Ctrl+C to stop the server
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⛔ Shutting down server...');
    db.close((err) => {
        if (err) console.error('Error closing database:', err);
        else console.log('✅ Database closed');
        process.exit(0);
    });
});
