# Chatly Plus (Mig33-style) - Enhanced
Features added over basic MVP:
- Better UI/CSS (modern, responsive)
- Avatar upload (image files saved to /uploads)
- XP and Level calculation (level = floor(xp / 10))
- Message delete (sender can delete own messages)
- Improved message bubbles with avatar + time

Run locally:
1. npm install
2. cp .env.example .env
3. npm start

Deploy: push to GitHub and connect to Railway. Set MONGODB_URI and JWT_SECRET if using DB.
