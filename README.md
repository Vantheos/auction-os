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

## Deploying to Vercel

1. Push the repo to GitHub.
2. In Vercel dashboard: New Project → Import the repo.
3. In project settings, set environment variables (use `vercel env add` for each):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (Supabase pooled connection string for serverless)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Set Supabase project's "Allowed redirect URLs" to include the Vercel deployment domain.
5. Apply migrations on the production Supabase: connect with `supabase link` and run `supabase db push`.
6. Run `npm run seed:admin` against the production DB to provision the initial admin (one time).

> **Required before login works:** in each Supabase project (Dev, Test, Prod), enable the JWT custom-claim hook in **Authentication → Hooks → Custom Access Token Hook** with the URI `public.custom_access_token_hook`. Without this, JWTs lack the `role` claim and API requests will 401.
