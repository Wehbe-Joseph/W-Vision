#!/usr/bin/env bash
# Push local env files to Vercel (requires: npx vercel login && npx vercel link)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v vercel >/dev/null 2>&1; then
  VERCEL="npx vercel@latest"
else
  VERCEL="vercel"
fi

push_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  echo "Syncing $file ..."
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | xargs)"
    [[ -z "$key" ]] && continue
    echo "$val" | $VERCEL env add "$key" production preview development --force 2>/dev/null || true
  done < "$file"
}

push_env_file "artifacts/api-server/.env"
push_env_file "artifacts/tourvision/.env"

echo ""
echo "IMPORTANT: override PUBLIC_API_BASE_URL with your live Vercel URL, e.g.:"
echo "  echo 'https://your-project.vercel.app' | $VERCEL env add PUBLIC_API_BASE_URL production preview development --force"
echo ""
echo "After deploy, verify integrations:"
echo "  curl https://your-project.vercel.app/api/healthz/integrations"
