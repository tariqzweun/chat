# Chatly Star2-style — Full Package (Admin ready)

This package is a complete web chat project with an Admin panel.

Features:
- Register/login (JWT)
- Realtime chat via Socket.IO
- Rooms (create/remove)
- Admin panel (create rooms, ban users, promote moderators)
- Avatar upload
- XP & Level (initial XP = 1000)
- File fallback storage (data/store.json) or MongoDB if MONGODB_URI set

Admin auto-promotion:
Set env var ADMIN_USERS to a comma separated list of usernames that should be admins, e.g.
ADMIN_USERS=admin,owner

Run locally:
1. npm install
2. cp .env.example .env (edit ADMIN_USERS, JWT_SECRET, MONGODB_URI as needed)
3. npm start

Open:
- Frontend: http://localhost:3000
- Admin UI: http://localhost:3000/admin.html
