# TourVision

## Overview

Full-stack SaaS app that converts property listing URLs into 3D virtual tours powered by World Labs Marble API. Built as a pnpm monorepo with React+Vite frontend, Express 5 backend, and PostgreSQL/Drizzle ORM.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (wouter routing, framer-motion, shadcn/ui, recharts)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in lib/api-spec)
- **Build**: esbuild (CJS bundle)

## Design System

- **Background**: warm cream/beige ~#EDE8E1 (HSL 38 22% 90%)
- **Foreground**: near-black warm brown ~#1A1714 (HSL 24 12% 9%)
- **Primary**: near-black (dark buttons/accents on the light surface)
- **Fonts**: Bebas Neue (display/headings), Space Grotesk (body/sans), Space Mono (mono)
- **Theme**: Light warm cream — single theme, no dark mode toggle

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Artifacts

- **artifacts/tourvision** (`@workspace/tourvision`) — React+Vite web app at `/`, port 18992
- **artifacts/api-server** (`@workspace/api-server`) — Express 5 API at `/api`, port 8080

## Libs

- **lib/api-spec** — OpenAPI spec + Orval config (generates hooks and Zod schemas)
- **lib/api-client-react** — generated React Query hooks (`@workspace/api-client-react`)
- **lib/api-zod** — generated Zod schemas (`@workspace/api-zod`)
- **lib/db** — Drizzle ORM schema and client (`@workspace/db`)

## DB Schema

Tables: `profiles`, `tours`, `tour_photos`, `tour_views`, `buyer_leads`, `angle_flags`

Key columns:
- `tours.floor_count` — number of floors detected
- `tour_photos.floor_number` — which floor this room/photo is on
- `tour_photos.marble_world_id` / `marble_embed_url` — World Labs Marble integration fields
- `tours.share_token` — unique token for public tour sharing

## Auth Pattern

- Mock auth via localStorage (`tourvision_user`) in the frontend
- Backend routes read `x-user-id` header for user identification
- Demo user ID: `00000000-0000-0000-0000-000000000001`

## Tour Viewer Special Features

- Floating hamburger button (top-left, dark bg, green on hover)
- Room sidebar: slides from left in 300ms, 280px desktop / full-width mobile, rgba(8,8,8,0.95) + backdrop blur
- Room thumbnails shown inline in sidebar with floor number
- AI Confidence Layer toggle (shows real photo vs AI-generated zones)
- Falls back to room thumbnail image when Marble iframe is blocked/unavailable

## API Routes

- `GET /api/healthz`
- `GET /api/user/profile`
- `PUT /api/user/profile`
- `GET /api/user/limits`
- `POST /api/user/onboarding`
- `POST /api/tours` — create tour (triggers simulated processing)
- `GET /api/tours` — list tours
- `GET /api/tours/:tourId` — get single tour
- `DELETE /api/tours/:tourId`
- `GET /api/tours/:tourId/status`
- `POST /api/tours/:tourId/floors` — set floor count
- `GET /api/tours/public/:shareToken` — public tour (no auth)
- `POST /api/tours/:tourId/leads` — capture buyer lead
- `GET /api/analytics/overview`
- `GET /api/analytics/tour-stats`
- `POST /api/tours/:tourId/flags` — flag AI angle

## World Labs Marble Integration

Not yet connected to a real API key. The `marble_world_id` and `marble_embed_url` fields are ready in the DB. Connect via environment variable `MARBLE_API_KEY` when available.
