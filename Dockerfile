# W-Vision API — deploy on Railway/Render/Fly (not Vercel).
# Frontend on Vercel must set VITE_API_BASE_URL to this service's public URL.

FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/artifacts/api-server
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
