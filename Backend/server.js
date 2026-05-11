/*
  AI Study Planner - Backend Server
  ITS205 Software Engineering - Group 9
  Krishna Gurung (S2400480) & Sunil Bhandari (S2400541)

  To run:
    1. npm install
    2. node server.js
    3. Server runs on http://localhost:5000
*/

const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app    = express();
const PORT   = 5000;
const SECRET = "its205_group9_secret_key"; // JWT secret key

// ── Middleware ────────────────────────────────────────────────────
app.use(cors());                    // allow frontend to talk to backend
app.use(express.json());            // read JSON from requests

// ── Simple file-based database ────────────────────────────────────
// Instead of PostgreSQL we use JSON files (same concept, simpler setup)
const DB_FOLDER = path.join(__dirname, "db");
if (!fs.existsSync(DB_FOLDER)) fs.mkdirSync(DB_FOLDER);

const USERS_FILE = path.join(DB_FOLDER, "users.json");

// Helper: read a JSON file
function readFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Helper: write a JSON file
function writeFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Helper: get the data file for a specific user
function userDataFile(username) {
  return path.join(DB_FOLDER, `${username}.json`);
}

// ── Auth Middleware (FR-02) ───────────────────────────────────────
// This runs before protected routes to check the JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1]; // format: "Bearer <token>"
  try {
    const decoded = jwt.verify(token, SECRET);
    req.username = decoded.username; // attach username to the request
    next(); // move on to the actual route
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ═════════════════════════════════════════════════════════════════
// AUTH ROUTES (FR-02)
// ═════════════════════════════════════════════════════════════════

// POST /api/register — create a new account
app.post("/api/register", async (req, res) => {
  const { username, password, dailyHours } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  const users = readFile(USERS_FILE);
  if (users[username]) {
    return res.status(400).json({ error: "Username already exists" });
  }

  // Hash the password before saving (security requirement FR-02)
  const hashedPassword = await bcrypt.hash(password, 10);
  users[username] = { password: hashedPassword, dailyHours: dailyHours || 4 };
  writeFile(USERS_FILE, users);

  // Create empty data file for this user
  writeFile(userDataFile(username), { subjects: [], schedule: [], missed: [] });

  res.json({ message: "Account created successfully" });
});

// POST /api/login — login and get a JWT token
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const users = readFile(USERS_FILE);
  if (!users[username]) {
    return res.status(400).json({ error: "User not found" });
  }

  // Compare the password with the stored hash
  const match = await bcrypt.compare(password, users[username].password);
  if (!match) {
    return res.status(400).json({ error: "Incorrect password" });
  }

  // Create a JWT token that expires in 24 hours
  const token = jwt.sign({ username }, SECRET, { expiresIn: "24h" });
  res.json({ token, username, dailyHours: users[username].dailyHours });
});

// ═════════════════════════════════════════════════════════════════
// SUBJECTS ROUTES (FR-05)
// ═════════════════════════════════════════════════════════════════

// GET /api/subjects — get all subjects for logged in user
app.get("/api/subjects", requireAuth, (req, res) => {
  const data = readFile(userDataFile(req.username));
  res.json(data.subjects || []);
});

// POST /api/subjects — add a new subject
app.post("/api/subjects", requireAuth, (req, res) => {
  const { name, deadline, priority, hours } = req.body;
  if (!name || !deadline) {
    return res.status(400).json({ error: "Name and deadline are required" });
  }

  const data = readFile(userDataFile(req.username));
  if (data.subjects.find(s => s.name === name)) {
    return res.status(400).json({ error: "Subject already exists" });
  }

  data.subjects.push({ name, deadline, priority: priority || "Medium", hours: hours || 3 });
  writeFile(userDataFile(req.username), data);
  res.json({ message: "Subject added", subjects: data.subjects });
});

// DELETE /api/subjects/:name — delete a subject
app.delete("/api/subjects/:name", requireAuth, (req, res) => {
  const data = readFile(userDataFile(req.username));
  data.subjects = data.subjects.filter(s => s.name !== req.params.name);
  writeFile(userDataFile(req.username), data);
  res.json({ message: "Subject deleted", subjects: data.subjects });
});

// ═════════════════════════════════════════════════════════════════
// SCHEDULE ROUTES (FR-06)
// ═════════════════════════════════════════════════════════════════

// POST /api/schedule/generate — AI schedule generation
app.post("/api/schedule/generate", requireAuth, (req, res) => {
  const data    = readFile(userDataFile(req.username));
  const users   = readFile(USERS_FILE);
  const dailyHours = users[req.username]?.dailyHours || 4;

  if (!data.subjects || data.subjects.length === 0) {
    return res.status(400).json({ error: "No subjects found. Add subjects first." });
  }

  const sessions = generateSchedule(data.subjects, dailyHours);
  data.schedule  = sessions;
  writeFile(userDataFile(req.username), data);
  res.json({ message: `Generated ${sessions.length} sessions`, schedule: sessions });
});

// GET /api/schedule — get the current schedule
app.get("/api/schedule", requireAuth, (req, res) => {
  const data = readFile(userDataFile(req.username));
  res.json(data.schedule || []);
});

// POST /api/schedule/complete/:id — mark session as complete
app.post("/api/schedule/complete/:id", requireAuth, (req, res) => {
  const data = readFile(userDataFile(req.username));
  const session = data.schedule.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  session.status = "completed";
  writeFile(userDataFile(req.username), data);
  res.json({ message: "Session marked complete", schedule: data.schedule });
});

// POST /api/schedule/missed/:id — mark missed + adaptive reschedule (FR-08)
app.post("/api/schedule/missed/:id", requireAuth, (req, res) => {
  const data    = readFile(userDataFile(req.username));
  const users   = readFile(USERS_FILE);
  const session = data.schedule.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Mark this session as missed
  session.status = "missed";
  const missedSubject = session.subject;

  // Log the missed session
  if (!data.missed) data.missed = [];
  data.missed.push({ subject: missedSubject, time: new Date().toISOString() });

  // Boost the missed subject priority and regenerate schedule (FR-08)
  const boostedSubjects = data.subjects.map(s => {
    if (s.name === missedSubject) {
      // Make it urgent: set deadline to today so it gets top priority
      return { ...s, priority: "High", deadline: new Date().toISOString().split("T")[0] };
    }
    return s;
  });

  const dailyHours   = users[req.username]?.dailyHours || 4;
  const pastSessions = data.schedule.filter(s => s.status !== "scheduled"); // keep done/missed
  const newSessions  = generateSchedule(boostedSubjects, dailyHours);
  data.schedule      = [...pastSessions, ...newSessions];

  writeFile(userDataFile(req.username), data);
  res.json({
    message: `Session missed. "${missedSubject}" has been re-prioritised and schedule regenerated.`,
    missedSubject,
    schedule: data.schedule
  });
});

// ═════════════════════════════════════════════════════════════════
// AI SCHEDULING ALGORITHM (FR-06)
// ═════════════════════════════════════════════════════════════════
function generateSchedule(subjects, dailyHours) {
  const today    = new Date();
  const sessions = [];
  const slotsPerDay = Math.floor(dailyHours); // e.g. 4 hours = 4 slots of 1hr each

  // Step 1: Score each subject
  // Score = priority weight + urgency bonus (closer deadline = higher score)
  const scored = subjects.map(subject => {
    const deadline  = new Date(subject.deadline);
    const daysLeft  = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)));
    const urgency   = 10 / daysLeft; // the fewer days left, the higher the urgency
    const priorityWeight = { High: 3, Medium: 2, Low: 1 }[subject.priority] || 2;
    return { ...subject, score: priorityWeight + urgency, daysLeft };
  });

  // Step 2: Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Step 3: Build list of available time slots over next 7 days
  const slots = [];
  for (let day = 0; day < 7; day++) {
    const date = new Date(today);
    date.setDate(today.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    for (let slot = 0; slot < slotsPerDay; slot++) {
      const hour = 8 + slot; // sessions start at 8am
      slots.push({ date: dateStr, time: `${String(hour).padStart(2,"0")}:00` });
    }
  }

  // Step 4: Allocate slots to subjects proportionally based on score
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  let slotIndex = 0;

  for (const subject of scored) {
    if (slotIndex >= slots.length) break;
    const proportion = subject.score / totalScore;
    const numSlots   = Math.max(1, Math.round(proportion * slots.length));

    for (let i = 0; i < numSlots; i++) {
      if (slotIndex >= slots.length) break;
      const slot = slots[slotIndex];
      sessions.push({
        id:       `${subject.name}_${slot.date}_${slot.time}`.replace(/\s/g, "_"),
        subject:  subject.name,
        date:     slot.date,
        time:     slot.time,
        duration: 1,
        status:   "scheduled"
      });
      slotIndex++;
    }
  }

  // Sort by date and time for display
  sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return sessions;
}

// ── Start the server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Study Planner backend running at http://localhost:${PORT}`);
});
