# AI Study Planner — ITS205 Group 9
# Krishna Gurung (S2400480) & Sunil Bhandari (S2400541)

## How to Run (Simple Steps)

### Step 1 — Install dependencies (only needed once)
Open VS Code terminal and type:

  cd backend
  npm install

### Step 2 — Start the backend server
In the same terminal:

  node server.js

You should see:  ✅ Study Planner backend running at http://localhost:5000
Leave this terminal open.

### Step 3 — Open the frontend
Open the file:  frontend/index.html
Just double-click it — it opens in your browser.

That's it! The app is running.

---

## How to Test Each Functional Requirement

FR-02 (Authentication):
  - Click Register tab → create an account → log in

FR-06 (AI Schedule Generation):
  - Go to Subjects → add 3 subjects with deadlines
  - Click "Generate AI Schedule"
  - Go to Schedule tab to see the generated sessions

FR-08 (Adaptive Rescheduling):
  - On Schedule page → click any session to select it
  - Click "Mark Missed" → see the notification and updated schedule

---

## Project Structure

  backend/
    server.js       ← Express backend (auth + scheduling API)
    package.json    ← dependencies
    db/             ← created automatically, stores user data as JSON files

  frontend/
    index.html      ← entire React frontend (single file)
