# WVision local setup checklist

These are the manual steps you need to complete after pulling the latest changes. Code-side wiring (Supabase auth, service-role admin client, env loading, dotenv, drizzle config) is already done.

## 1. Fill in your real secrets

### `artifacts/api-server/.env`

Paste your **Postgres connection string** from Supabase Dashboard -> Project Settings -> Database -> Connection string.

Prefer the **Transaction pooler** URL (IPv4, port 6543); the direct `db.<ref>.supabase.co` host is IPv6-only and often does not resolve on home networks.

Example (replace `REGION` and `YOUR_DB_PASSWORD`):

```
DATABASE_URL=postgresql://postgres.gjpqtjqdmwwjxtsmwaf:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are already populated.

### `artifacts/tourvision/.env`

Already populated with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The browser only ever sees the anon key.

## 2. Push the database schema

From the repo root, after `DATABASE_URL` is correct:

```bash
pnpm --filter @workspace/db run push
```

This creates `users`, `profiles`, `tours`, `tour_photos`, `onboarding_answers`, etc. in your Supabase Postgres.

## 3. Configure Supabase Auth URLs

In Supabase Dashboard -> Authentication -> URL Configuration:

- **Site URL**: `http://localhost:18992`
- **Additional Redirect URLs**:
  - `http://localhost:18992`
  - `http://localhost:18992/dashboard`
  - `http://localhost:18992/login`

Without these, Google OAuth will reject the redirect with `redirect_to is not allowed`.

If you also have Google sign-in enabled, double-check Authentication -> Providers -> Google has your Client ID and Secret saved.

## 4. Start the apps with pnpm (do NOT use npm)

This is a pnpm workspace. The repo root has no `dev` script; the `dev` scripts live in workspace packages and must be invoked with `--filter`.

In two terminals:

```bash
# Terminal 1 - API on :8080
pnpm --filter @workspace/api-server run dev
```

```bash
# Terminal 2 - Frontend on :18992
pnpm --filter @workspace/tourvision run dev
```

Then open http://localhost:18992.

## 5. Rotate keys you previously exposed

Earlier the anon and service_role keys were committed to `.env.example`. Treat them as leaked. In Supabase Dashboard -> Project Settings -> API:

1. Reset the anon and service_role keys.
2. Update only the `.env` files in:
   - `artifacts/tourvision/.env` (anon key only)
   - `artifacts/api-server/.env` (anon + service_role)
3. Restart both dev servers.

`.env` is now ignored by git (`.gitignore` updated). `.env.example` only contains placeholders.

## Troubleshooting

- **`getaddrinfo ENOTFOUND db.<ref>.supabase.co`**: switch to the pooler URL (step 1).
- **`Missing VITE_SUPABASE_URL`**: confirm `artifacts/tourvision/.env` exists and restart Vite.
- **`DATABASE_URL must be set`**: confirm `artifacts/api-server/.env` exists and restart the API.
- **Google OAuth `redirect_to is not allowed`**: add the redirect URL in step 3.
