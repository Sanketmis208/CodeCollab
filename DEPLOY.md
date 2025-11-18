# Deploying Collaborative-Code-editor

This guide shows how to deploy the frontend (Vite + React) to Vercel and the backend (Express + Socket.IO + MongoDB) to Render. It includes required environment variables, recommended settings, and quick verification steps.

## Overview
- Frontend: Vercel (static site from Vite `dist`)
- Backend: Render (Web Service) — keeps a long-running Socket.IO server
- Database: MongoDB Atlas (cloud) — provide `MONGO_URL` to the backend

---

## Prepare your project

1. Ensure the repository `Collaborative-Code-editor` is pushed to GitHub and `main` contains the code.
2. Confirm project structure (root contains `client/` and `server/`).

## MongoDB Atlas

1. Create a free cluster on https://www.mongodb.com/cloud/atlas.
2. Create a database user and copy the connection string (URI).
3. For quick testing, allow access from anywhere (0.0.0.0/0) or configure a secure IP list.
4. Save the URI. Example:

```
mongodb+srv://<user>:<password>@cluster0.mongodb.net/mydb?retryWrites=true&w=majority
```

## Backend (Render)

Recommended: Deploy the server as a Render Web Service.

1. Go to https://render.com and sign in.
2. Create a new "Web Service" and connect your GitHub repository `meetjpatel017/Collaborative-Code-editor`.
3. Settings:
   - Branch: `main`
   - Environment: `Node` (Render detects Node)
   - Build Command: leave blank (server has no build step) or `npm install`
   - Start Command: `npm start` (server/package.json defines `start` -> `node src/index.js`)
   - Instance: free plan works for testing

4. Add environment variables in Render dashboard (Service → Environment):
   - `MONGO_URL` = your MongoDB Atlas URI
   - `NODE_ENV` = `production`
   - (Optional) any other secrets used by your app

Notes:
- The server reads `process.env.PORT` — Render will provide the right `PORT`.
- Make sure your `server/src/index.js` can connect using the `MONGO_URL` and is robust to temporary DB unavailability.

## Frontend (Vercel)

Deploy the client on Vercel for a fast static deployment.

1. Go to https://vercel.com and sign in with your GitHub account.
2. Import project → choose `meetjpatel017/Collaborative-Code-editor` → select the `client` directory (or root and set the correct build settings).
3. Project settings for the client:
   - Framework: Other (or Vite)
   - Root Directory: `client` (important)
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. Add Environment Variables (Vercel Project Settings):
   - `VITE_SERVER_URL` = `https://<your-backend-url>` (the Render service URL)

5. Deploy. Vercel will run the build and provide a URL like `https://<project>.vercel.app`.

Notes:
- Vite uses `VITE_` prefix for environment variables that are exposed to the client.
- If the client needs to talk to the Socket.IO server, ensure the backend `CORS` allows the client origin or uses `cors({ origin: true })` like this project already does.

## Optional: Deploy both on Render (single provider)

You can host the client as a static site on Render too (Static Site), but Vercel is simpler for Vite apps. If you prefer a single provider, create a Static Site in Render for the `client` directory and a Web Service for the `server`.

## Local testing before deploy

1. Run MongoDB (Atlas) and set `MONGO_URL` locally (or use `.env` files):

```powershell
# from repository root
cd server
# set MONGO_URL for the session (PowerShell)
$env:MONGO_URL = "mongodb+srv://<user>:<pass>@cluster0.mongodb.net/mydb?retryWrites=true&w=majority"
npm install
npm start

# In another terminal, run the client
cd ../client
npm install
npm run dev
```

2. Open the client dev URL (usually http://localhost:5173 or 5174) and ensure it connects to the backend.

## Verification

- After pushing and deploying, visit the Render service URL (backend) to verify it returns 200 for `GET /api/rooms`.
- Visit the Vercel site and create/join a room to confirm Socket.IO real-time features work.

## Useful CLI commands (optional)

- Vercel CLI (deploy from `client`):

```powershell
# install if needed
npm i -g vercel
cd client
vercel login
vercel --prod
```

- Render CLI is less commonly used; prefer the Render web console. You can also use `git push` to trigger deploys.

## Troubleshooting

- CORS / Socket issues: Confirm the running backend URL is used in `VITE_SERVER_URL` and backend allows requests from the frontend origin.
- DB connection errors: check `MONGO_URL` and Atlas network access/credentials.
- Production build errors: check Vercel build logs or Render service logs for the server.

## Summary

- Backend: Render — `npm start`, set `MONGO_URL` and `NODE_ENV=production`.
- Frontend: Vercel — `npm run build`, output `dist`, set `VITE_SERVER_URL` to the backend URL.

If you want, I can:
- Create this `DEPLOY.md` (done).
- Add a simple GitHub Actions workflow to auto-deploy on push (I can prepare it on request).
- Provide the exact values/commands for your account (I won't run them without your confirmation).

---

Happy to walk through the first deploy interactively — tell me which you'd like to do next (Vercel or Render actions), and I will produce the exact step-by-step commands for you to run locally.
