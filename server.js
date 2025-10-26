// server.js
const express = require('express');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Known good fingerprints
const knownFingerprints = [
    'a1b2c3d4e5f67890...', // Add your actual script fingerprint here
];

app.use(express.json());

app.post('/validate', (req, res) => {
    const { fingerprint, timestamp } = req.body;
    
    // Check if fingerprint is in our list of known good fingerprints
    const isValid = knownFingerprints.includes(fingerprint);
    
    // Return validation result
    res.json({ valid: isValid });
});

app.listen(port, () => {
    console.log(`Validation server running at http://localhost:${port}`);
});