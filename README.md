# Grok-Powered WordPress Automation Engine

Local setup dashboard for configuring xAI, WordPress REST credentials, SFTP hosting, business brief, and theme uploads before running Phases 1–3 automation.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons
- Prisma + SQLite
- OpenAI SDK → xAI (`https://api.x.ai/v1`, default model `grok-4.6`)

## Getting started

```bash
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the settings dashboard.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/config` | Load or save `SiteConfig` |
| POST | `/api/test-connection` | Verify Grok + WordPress REST |
| POST | `/api/upload-theme` | Upload theme `.zip` to `public/uploads/themes` |
| POST | `/api/run-pipeline` | SSE stream — Phases 1–3 automation |

## Remote theme paths (optional)

Set when SFTP paths differ from defaults:

- `WP_REMOTE_ROOT` — WordPress install root (default `/var/www/html`)
- `WP_REMOTE_THEMES_PATH` — themes directory (default `{WP_REMOTE_ROOT}/wp-content/themes`)

## Environment

Copy `.env.example` to `.env` and set `DATABASE_URL` (default SQLite file: `prisma/dev.db`).
