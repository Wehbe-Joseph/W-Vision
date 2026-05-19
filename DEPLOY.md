# Production deployment (Vercel + API)

The app has **two parts**:

| Part | Host | Example |
|------|------|---------|
| Frontend (React) | **Vercel** | `https://your-app.vercel.app` |
| API (Express) | **Railway** (or Render/Fly) | `https://your-api.up.railway.app` |

Tour generation fails with **HTTP 405** or “could not reach the API server” when the frontend is live but the API is not deployed or `VITE_API_BASE_URL` is missing.

---

## 1. Deploy the API on Railway

1. Open [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select **W-Vision**.
2. Railway should detect `Dockerfile` + `railway.toml` at the repo root.
3. In Railway → **Variables**, add the same keys as `artifacts/api-server/.env` (at minimum):
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WORLD_LABS_API_KEY`
   - `APIFY_TOKEN`
   - `PUBLIC_API_BASE_URL` = your Railway public URL + no trailing slash (e.g. `https://w-vision-api-production.up.railway.app`)
4. Deploy and wait until healthy. Test:
   ```bash
   curl https://YOUR-RAILWAY-URL/api/healthz
   ```
   Expected: `{"status":"ok"}`

Copy the public Railway URL (no trailing slash).

---

## 2. Configure Vercel (frontend)

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add:

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | Same as local `artifacts/tourvision/.env` |
| `VITE_SUPABASE_ANON_KEY` | Same as local |
| `VITE_API_BASE_URL` | **Your Railway API URL** (e.g. `https://xxx.up.railway.app`) |

Apply to **Production**, **Preview**, and **Development** if you use preview deploys.

**Redeploy** the Vercel project (Deployments → … → Redeploy) so the build picks up `VITE_API_BASE_URL`.

---

## 3. Supabase Auth (production)

In Supabase → **Authentication** → **URL Configuration**, add your Vercel URL:

- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/dashboard`, `https://your-app.vercel.app/login`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTTP **405** on Generate | API not reachable; set `VITE_API_BASE_URL` and redeploy Vercel |
| “Could not reach the API server” | Railway API down or wrong URL; check `/api/healthz` |
| Vercel build fails: `VITE_API_BASE_URL is required` | Add that env var in Vercel, then redeploy |
| CORS errors | API has `cors({ origin: true })`; ensure `VITE_API_BASE_URL` matches Railway URL exactly |
