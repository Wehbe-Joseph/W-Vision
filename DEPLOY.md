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

The Express API is deployed via `artifacts/tourvision/api/[...slug].js` (Vercel catch-all for **all** `/api/*` paths; imports bundled `api/serverless.mjs` at build time). It is **not** a separate Railway service unless you choose that option below.

If Root Directory is wrong, `/api/*` never deploys and tour generation fails. After deploy, `curl https://YOUR_APP.vercel.app/api/healthz` must return JSON like `{"status":"ok"}`, not `FUNCTION_INVOCATION_FAILED`.

**Delete `VITE_API_BASE_URL` on Vercel** unless you host the API on a separate live domain. If it still points at Railway or `localhost`, the browser will skip your Vercel API entirely.

---

## 1. Vercel environment variables

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add everything from `artifacts/api-server/.env` plus the frontend keys from `artifacts/tourvision/.env`:

**Frontend (build-time):**

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Supabase project settings |
| `VITE_SITE_URL` | `https://www.getwvision.com` (optional; browser uses current origin) |

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
| `TOURVISION_PUBLIC_URL` | `https://www.getwvision.com` (panorama + email links) |
| `STRIPE_SECRET_KEY` | Yes (for $29 full-house unlock Checkout) |
| `STRIPE_WEBHOOK_SECRET` | Yes — endpoint `https://YOUR_APP.vercel.app/api/billing/webhook` |
| `STRIPE_PRICE_FULL_HOUSE_UNLOCK` | Optional — Stripe Price ID; omit to use inline $29 price |

Run `lib/db/supabase-migration-billing.sql` in Supabase after deploy so `tours` has `expires_at`, `frozen`, `created_on_tier`, `full_house_unlocked`.

`VITE_API_BASE_URL` must be **empty or unset** when API runs on the same Vercel domain. **Never** set it to `localhost` or Railway in production.

Apply variables to **Production**, **Preview**, and **Development**, then **Redeploy**.

---

## 2. Supabase Auth URLs (fixes Google “unsupported” redirect)

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://www.getwvision.com` (Vercel redirects `getwvision.com` → `www` — do **not** add a client-side redirect in the opposite direction or the site will reload in a loop)
- **Redirect URLs** (add every host you use):
  - `https://www.getwvision.com/**`
  - `https://getwvision.com/**`
  - `https://www.getwvision.com/auth/callback`
  - `https://getwvision.com/auth/callback`
  - `https://*.vercel.app/**` (preview deploys)

Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth client (Web application):

- **Authorized JavaScript origins** (optional but recommended):
  - `https://www.getwvision.com`
  - `https://getwvision.com`
  - `https://YOUR_PROJECT_REF.supabase.co`
- **Authorized redirect URIs** — **only** Supabase’s callback (copy from Supabase → Auth → Providers → Google):
  - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
  - Do **not** put `https://getwvision.com/auth/callback` here — Google never redirects to your app directly.

Supabase → **Authentication** → **Providers** → **Google**: paste the **same** Client ID and Client Secret from that Google OAuth client. Enable the provider.

**Error 400: redirect_uri_mismatch** (Google screen): the redirect URI above is missing or wrong in Google Cloud, or Supabase is using a different Client ID than the one you edited. Fix Google first, then re-save credentials in Supabase.

The app does **not** redirect between `www` and apex — Vercel already sends apex → `www`. Never add the opposite redirect in app code.

**PKCE / Google sign-in:** Stay on one host for the whole flow (`www.getwvision.com` after Vercel’s redirect). Both apex and www are fine if listed in Supabase redirect URLs.

---

## 3. Verify after deploy

```bash
curl https://www.getwvision.com/api/healthz
# {"status":"ok"}

curl https://www.getwvision.com/api/healthz/integrations
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
| HTTP **405** on `/api/*` (HTML response) | API function not deployed — use `api/[...slug].js` (not `api/index.js` alone); confirm build log runs `@workspace/api-server build`; `curl /api/healthz` must return JSON not HTML |
| HTTP **404** on `/api/*` | Confirm Root Directory is `artifacts/tourvision` and `api/[...slug].js` exists after build |
| Apify / Gemini never called | Open `/api/healthz/integrations` — add missing env vars on Vercel |
| Generation starts then stops | Check Vercel function logs; DB / classification errors |
| Build fails on `serverless.mjs` | Run `pnpm --filter @workspace/api-server build` before deploy |
