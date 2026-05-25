# Production deployment (Vercel — frontend + API)

One Vercel project serves **both** the React app and the Express API (`/api/*` serverless function). **No local API is required in production** — the browser calls same-origin `/api/...` on your Vercel domain.

Copy env vars from `artifacts/tourvision/.env.vercel.example` into the Vercel dashboard.

---

## Critical Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `artifacts/tourvision` (recommended). If the repo root is used instead, `api/[...path].js` at the monorepo root is also provided. |
| **Framework Preset** | Vite |
| **Output Directory** | leave empty (uses `vercel.json`) |
| **Build / Install commands** | leave empty (uses `vercel.json`), or set Build Command to `pnpm run build` — **not** `vite build` alone (that skips the API bundle) |
| **Include files outside root directory** | **Enabled** (required for monorepo build) |

The Express API is deployed via `artifacts/tourvision/api/index.js` with rewrite `/api/*` → `/api` (imports bundled `api/serverless.mjs` at build time). It is **not** a separate Railway service unless you choose that option below.

If Root Directory is wrong, `/api/*` never deploys and tour generation fails. After deploy, `curl https://YOUR_APP.vercel.app/api/healthz` must return JSON like `{"status":"ok"}`, not `FUNCTION_INVOCATION_FAILED`.

**Delete `VITE_API_BASE_URL` on Vercel** unless you host the API on a separate live domain. If it still points at Railway or `localhost`, the browser will skip your Vercel API entirely.

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
| `APIFY_TOKEN` | Yes (for listing scrape) |
| `GEMINI_API_KEY` | Yes (for room classification) |
| `PUBLIC_API_BASE_URL` | Optional — auto-set from `VERCEL_PROJECT_PRODUCTION_URL` when unset |
| `TOURVISION_PUBLIC_URL` | Optional — same as your Vercel URL (panorama links in emails) |

`VITE_API_BASE_URL` must be **empty or unset** when API runs on the same Vercel domain. **Never** set it to `localhost` or Railway in production.

Apply variables to **Production**, **Preview**, and **Development**, then **Redeploy**.

---

## 2. Supabase Auth URLs

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://w-vision-tourvision-iauj.vercel.app`
- **Redirect URLs**:
  - `https://w-vision-tourvision-iauj.vercel.app`
  - `https://w-vision-tourvision-iauj.vercel.app/dashboard`
  - `https://w-vision-tourvision-iauj.vercel.app/login`

---

## 3. Verify after deploy

```bash
curl https://w-vision-tourvision-iauj.vercel.app/api/healthz
# {"status":"ok"}

curl https://w-vision-tourvision-iauj.vercel.app/api/healthz/integrations
# {"status":"ok","integrations":{"apify":{"configured":true},...}}
```

If `status` is `"degraded"`, any integration with `"configured": false` is missing on Vercel. Fix env vars and redeploy.

Then sign in and use **Generate 3D Tour**.

---

## Optional: separate API on Railway

See `Dockerfile` and `railway.toml` if you want the API on Railway instead. In that case set `VITE_API_BASE_URL` to the Railway URL and remove reliance on the `/api` serverless function.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **`FUNCTION_INVOCATION_FAILED`** on every `/api/*` call | Usually **`DATABASE_URL` missing** on Vercel. Add all API vars from `.env.vercel.example`, redeploy, then `curl .../api/healthz/integrations` |
| HTTP **405** on `/api/*` (HTML response) | SPA rewrite is catching `/api` — redeploy latest `main`; `vercel.json` must rewrite `/api/(.*)` → `/api` before the `index.html` rule |
| HTTP **404** on `/api/*` | Confirm Root Directory is `artifacts/tourvision` and `api/index.js` exists after build |
| Apify / Gemini never called | Open `/api/healthz/integrations` — add missing env vars on Vercel |
| Generation starts then stops | Check Vercel function logs; DB / classification errors |
| Build fails on `serverless.mjs` | Run `pnpm --filter @workspace/api-server build` before deploy |
