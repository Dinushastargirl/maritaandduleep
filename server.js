const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Determine DB_FILE path. Vercel environment is read-only, so write to /tmp on Vercel as a backup.
const isVercel = !!process.env.VERCEL;
const DB_FILE = isVercel 
  ? path.join('/tmp', 'rsvps.json') 
  : path.join(__dirname, 'rsvps.json');

// Initialize optional Vercel KV (Redis) database client if configured in production
let kvClient = null;
const hasVercelKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

if (hasVercelKV) {
  try {
    const { createClient } = require('@vercel/kv');
    kvClient = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    console.log("Vercel KV Client successfully initialized.");
  } catch (err) {
    console.error("Vercel KV Initialization Error:", err);
  }
}

// Enable CORS and body parsing
app.use(cors());
app.use(express.json());

// Serve index.html directly as static landing root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper: Read RSVPs (Async)
async function readRSVPs() {
  // If Vercel KV is configured, read from it
  if (kvClient) {
    try {
      const data = await kvClient.get('rsvps');
      if (data) {
        return Array.isArray(data) ? data : JSON.parse(data);
      }
    } catch (err) {
      console.error("Error reading from Vercel KV:", err);
    }
  }

  // Fallback to local file database
  try {
    if (!fs.existsSync(DB_FILE)) {
      const rootDbFile = path.join(__dirname, 'rsvps.json');
      // If running on Vercel and /tmp/rsvps.json doesn't exist, seed it with the repository's rsvps.json file
      if (isVercel && fs.existsSync(rootDbFile)) {
        try {
          const seededData = fs.readFileSync(rootDbFile, 'utf8');
          fs.writeFileSync(DB_FILE, seededData, 'utf8');
          return JSON.parse(seededData || '[]');
        } catch (seedErr) {
          console.error("Error seeding /tmp database:", seedErr);
        }
      }
      return [];
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error("Error reading file database:", err);
    return [];
  }
}

// Helper: Write RSVPs (Async)
async function writeRSVPs(data) {
  // If Vercel KV is configured, write to it
  if (kvClient) {
    try {
      await kvClient.set('rsvps', data);
      return true;
    } catch (err) {
      console.error("Error writing to Vercel KV:", err);
    }
  }

  // Fallback to local file database
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Error writing file database:", err);
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
app.post('/api/rsvp', async (req, res) => {
  const { name, attending, guests, notes } = req.body;

  if (!name || !attending) {
    return res.status(400).json({ success: false, error: "Name and attendance status are required." });
  }

  const rsvps = await readRSVPs();

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

  if (await writeRSVPs(filteredRSVPs)) {
    return res.json({ success: true, rsvp: newRSVP });
  } else {
    return res.status(500).json({ success: false, error: "Failed to write to database." });
  }
});

// Retrieve all RSVPs (protected)
app.get('/api/rsvps', async (req, res) => {
  if (!verifyPasscode(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized. Invalid passcode." });
  }

  const rsvps = await readRSVPs();
  return res.json({ success: true, rsvps });
});

// Clear/Wipe database (protected)
app.post('/api/clear-rsvps', async (req, res) => {
  if (!verifyPasscode(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized. Invalid passcode." });
  }

  if (await writeRSVPs([])) {
    return res.json({ success: true, message: "RSVP database cleared." });
  } else {
    return res.status(500).json({ success: false, error: "Failed to wipe database." });
  }
});

// Serve local workspace static files
app.use(express.static(__dirname));

// Start server listening (Only when not loaded as a Vercel Serverless module)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`❤️  Duleep & Marita's Wedding Server ❤️`);
    console.log(`Running on: http://localhost:${PORT}`);
    console.log(`Database:   ${DB_FILE}`);
    console.log(`========================================`);
  });
}

module.exports = app;
