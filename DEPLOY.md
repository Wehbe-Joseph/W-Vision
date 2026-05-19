# Production deployment (Vercel — frontend + API)

One Vercel project serves **both**:

- React app (static files in `public/`)
- Express API (serverless function at `api/index.ts`, routes `/api/*`)

You do **not** need Railway unless you prefer a separate API host.

---

## 1. Vercel environment variables

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add everything from `artifacts/api-server/.env` plus the frontend keys from `artifacts/tourvision/.env`:

**Frontend (build-time):**

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | `artifacts/tourvision/.env` |
| `VITE_SUPABASE_ANON_KEY` | `artifacts/tourvision/.env` |

**API (runtime — serverless function):**

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `WORLD_LABS_API_KEY` | Yes (for 3D generation) |
| `APIFY_TOKEN` | Yes (for listing scrape) |
| `PUBLIC_API_BASE_URL` | Yes — set to `https://YOUR-VERCEL-DOMAIN.vercel.app` (no trailing slash) |
| `RESEND_API_KEY` | Optional |
| `WORLD_LABS_ENABLED` | Optional (`true` / `false`) |

`VITE_API_BASE_URL` is **not** required when API runs on the same Vercel domain (default).

Apply variables to **Production**, **Preview**, and **Development**, then **Redeploy**.

---

## 2. Supabase Auth URLs

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/dashboard`, `https://your-app.vercel.app/login`

---

## 3. Verify after deploy

```bash
curl https://YOUR-VERCEL-DOMAIN.vercel.app/api/healthz
# {"status":"ok"}
```

Then sign in and use **Generate 3D Tour**.

---

## Optional: separate API on Railway

See `Dockerfile` and `railway.toml` if you want the API on Railway instead. In that case set `VITE_API_BASE_URL` to the Railway URL and remove reliance on the `/api` serverless function.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTTP **405** on Generate | Redeploy latest `main`; ensure `/api` rewrite exists in `vercel.json` |
| **500** on `/api/*` | Missing env vars on Vercel (check function logs) |
| Generation starts then stops | Check Vercel function logs; World Labs / DB errors |
| Build fails on `serverless.mjs` | Run `pnpm --filter @workspace/api-server build` before deploy |
