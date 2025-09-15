# Star2Chat - Starter (Next.js + Express + Socket.IO + Prisma)

## Overview
Starter project for a realtime chat app with roles (OWNER/ADMIN/MODERATOR/USER).

## Setup (local)
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies (root with workspaces):
   ```bash
   npm install
   cd server && npx prisma generate
   ```
3. Create DB migrations (if using Postgres):
   ```bash
   cd prisma
   npx prisma migrate dev --name init
   ```
4. Seed admin (optional):
   ```bash
   node server/scripts/create-admin.js
   ```
5. Start server:
   ```bash
   npm run start:server
   ```
6. Start client (in separate terminal):
   ```bash
   cd client
   npm run dev
   ```

## Deploy
- **Server**: Deploy `server` on Railway (set `DATABASE_URL`, `JWT_SECRET`, `PORT`).
  - Run `npx prisma migrate deploy` during deploy.
- **Client**: Deploy `client` on Vercel or Railway static site. Set `NEXT_PUBLIC_SOCKET_URL` to your server URL.

## Notes
- This is a starter. Add production hardening (input validation, rate-limits, sanitization, file uploads security).
