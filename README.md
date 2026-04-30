# Auction Inventory SaaS

See `docs/superpowers/specs/2026-04-29-v1-design.md` for the v1 design spec.
See `ui-design/design_handoff/` for visual designs.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in Supabase credentials.
3. `npm run supabase:start` to start local Supabase (Postgres + Auth on port 54321).
4. `npm run db:push` to apply Drizzle schema.
5. `npm run seed:admin` to provision the initial admin user.
6. `npm run dev` to start the Vite dev server.

## Tech stack

React + Vite + TypeScript + Tailwind + shadcn/ui · Hono on Vercel · Supabase (Postgres + Auth + RLS + Storage) · Drizzle ORM
