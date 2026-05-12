const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'rsvps.json');

// Enable CORS and body parsing
app.use(cors());
app.use(express.json());

// Serve index.html directly as static landing root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper: Read RSVPs
function readRSVPs() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return [];
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error("Error reading database:", err);
    return [];
  }
}

// Helper: Write RSVPs
function writeRSVPs(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Error writing database:", err);
    return false;
  }
}

// Helper: Verify passcode
function verifyPasscode(req) {
  const code = req.headers['x-passcode'] || req.query.passcode;
  return code === 'marita2026' || code === 'love';
}

// --- API ENDPOINTS ---

// Submit RSVP
app.post('/api/rsvp', (req, res) => {
  const { name, attending, guests, notes } = req.body;

  if (!name || !attending) {
    return res.status(400).json({ success: false, error: "Name and attendance status are required." });
  }

  const rsvps = readRSVPs();

  const newRSVP = {
    name: name.trim(),
    attending: attending === 'accept' ? 'accept' : 'decline',
    guests: attending === 'accept' ? parseInt(guests) || 1 : 0,
    notes: (notes || '').trim(),
    timestamp: new Date().toLocaleString()
  };

  // Filter out duplicates (overwrite by exact case-insensitive name match)
  const filteredRSVPs = rsvps.filter(r => r.name.toLowerCase() !== newRSVP.name.toLowerCase());
  filteredRSVPs.push(newRSVP);

  if (writeRSVPs(filteredRSVPs)) {
    return res.json({ success: true, rsvp: newRSVP });
  } else {
    return res.status(500).json({ success: false, error: "Failed to write to database." });
  }
});

// Retrieve all RSVPs (protected)
app.get('/api/rsvps', (req, res) => {
  if (!verifyPasscode(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized. Invalid passcode." });
  }

  const rsvps = readRSVPs();
  return res.json({ success: true, rsvps });
});

// Clear/Wipe database (protected)
app.post('/api/clear-rsvps', (req, res) => {
  if (!verifyPasscode(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized. Invalid passcode." });
  }

  if (writeRSVPs([])) {
    return res.json({ success: true, message: "RSVP database cleared." });
  } else {
    return res.status(500).json({ success: false, error: "Failed to wipe database." });
  }
});

// Serve local workspace static files
app.use(express.static(__dirname));

// Start server listening
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`❤️  Duleep & Marita's Wedding Server ❤️`);
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`Database:   ${DB_FILE}`);
  console.log(`========================================`);
});
