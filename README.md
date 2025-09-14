# Chatly
Realtime chat app (Socket.IO) — ready for GitHub + Railway

## Local run
1. `git clone <repo>`
2. `npm install`
3. copy `.env.example` to `.env` and set `MONGODB_URI` if you have one
4. `npm start` (or `npm run dev`)

Open `http://localhost:3000`

## Deploy to Railway
1. أنشئ repo في GitHub وادفع الملفات.
2. في Railway: New Project -> Deploy from GitHub -> اختر الريبو.
3. في settings ضع `MONGODB_URI` كـ Environment Variable إن أردت تخزين الرسائل.
4. Railway سيقوم بتشغيل `npm start` تلقائياً ويعطيك رابط عام.

## Notes
- If you don't provide `MONGODB_URI`, the server will use a simple file-based store at `data/store.json` (suitable for testing only).
- For production use, enable MongoDB Atlas and set `MONGODB_URI`.
