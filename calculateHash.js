const crypto = require('crypto');
const fs = require('fs');

// Read the minified file
const fileContent = fs.readFileSync('security.min.js', 'utf8');

// Calculate SHA-256 hash
const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

console.log('SHA-256 Hash:', hash);