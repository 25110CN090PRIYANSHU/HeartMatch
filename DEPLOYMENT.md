# 🚀 HeartMatch Deployment Guide

This guide explains how to deploy HeartMatch with all 5 new features included:
1. **Discover & Matching:** Swipe mode, Compatibility % scoring, Category/Gender & Sort filters.
2. **Profile & Media:** Up to 6-photo gallery (GridFS backed), Profile Prompts / Icebreakers.
3. **Matches & "Who Liked You":** Matches vs Likes You tabs, Search bar, 1-click Like Back & Pass, Match Celebration popup.
4. **Chat & Real-Time:** Voice notes recording & playback, message emoji reactions, typing indicators, read receipts (`✓✓`).
5. **Privacy & Settings:** Incognito / Ghost Mode toggle (`isIncognito`), location preferences.

---

## ⚙️ Environment Variables

Set the following environment variables in your hosting dashboard (Render, Railway, Heroku, VPS, or `.env` file):

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `MONGO_URI` | **Yes** | MongoDB connection string (Atlas or self-hosted) | `mongodb+srv://user:pass@cluster.mongodb.net/heartmatch` |
| `JWT_SECRET` | **Yes** | Secret key for JWT auth tokens | `any-random-long-secret-key-12345` |
| `PORT` | No | Server port (defaults to `5000` or host assigned) | `5000` |
| `NODE_ENV` | No | Environment mode | `production` |
| `APP_URL` | No | Full public URL of your app | `https://your-domain.com` |
| `SMTP_HOST` | Optional | SMTP host for verification / reset emails | `smtp.gmail.com` |
| `SMTP_PORT` | Optional | SMTP port | `587` |
| `SMTP_USER` | Optional | SMTP email address | `noreply@yourdomain.com` |
| `SMTP_PASS` | Optional | SMTP app password | `app-password-here` |
| `MAIL_FROM` | Optional | From email header | `"HeartMatch" <noreply@yourdomain.com>` |
| `ADMIN_EMAIL` | Optional | Admin account email | `admin@heartmatch.com` |

---

## 🌐 Deploy to Render (Recommended - Free & Instant)

1. Create a free account at [render.com](https://render.com).
2. Connect your Git repository or upload the files.
3. In **render.yaml** (already included in the root):
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add your **`MONGO_URI`** under Environment Variables.
5. Click **Deploy Web Service**.

---

## 🚂 Deploy to Railway / Heroku

1. **Build Command:** `npm install`
2. **Start Command:** `npm start`
3. Add `MONGO_URI` and `JWT_SECRET` in the Variables tab.

---

## 💻 Self-Hosted / VPS (Ubuntu, Debian, CentOS)

```bash
# 1. Clone or extract files
cd /var/www/heartmatch

# 2. Install dependencies
npm install --production

# 3. Create .env file
cp .env.example .env
nano .env

# 4. Start with PM2 for 24/7 uptime
npm install -g pm2
pm2 start server/server.js --name "heartmatch"
pm2 save
pm2 startup
```

---

## 🧪 Local Testing

```bash
npm install
npm start
# Open http://localhost:5000 in your browser
```
