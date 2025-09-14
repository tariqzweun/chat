# Chatly Advanced
Realtime chat app (Socket.IO) — ready for GitHub + Railway

## Features
- Realtime messaging with Socket.IO
- Rooms (channels) support
- User join/leave presence and users list per room
- Typing indicator
- Image upload via DataURL (small images)
- Message history (MongoDB if MONGODB_URI provided, file fallback for testing)
- Static frontend in /public

## Local run
1. `git clone <repo>`
2. `npm install`
3. copy `.env.example` to `.env` and set `MONGODB_URI` if you want persistence
4. `npm start` (or `npm run dev`)

Open `http://localhost:3000`

## Deploy to Railway
1. Push repo to GitHub.
2. Create new Railway Project -> Deploy from GitHub -> choose repo.
3. Set `MONGODB_URI` env var in Railway if using MongoDB.
4. In Service Settings set Custom Start Command to: `npm start`

Notes:
- If no MONGODB_URI provided, the server will use data/store.json as a simple persistent store (testing only).
