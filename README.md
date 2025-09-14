
# Star2Chat Pro (Final)

This is a complete modern chat platform (Flask + Socket.IO) prepared for deployment on Railway.
Features:
- Roles: admin / moderator / user / guest
- Admin panel: create rooms, assign moderators, view users
- Realtime rooms + private messages
- User presence & members list per room
- TailwindCSS for modern UI (via CDN)
- PostgreSQL support via DATABASE_URL (Railway)

Deployment:
1. Push this repo to GitHub.
2. Connect with Railway and deploy from GitHub.
3. Add PostgreSQL plugin on Railway and set the DATABASE_URL variable (Railway often provides it automatically).
4. (Optional) set SECRET_KEY variable for production.

Once deployed, visit `/setup-admin` to create the first admin account.
