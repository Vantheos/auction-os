# Working state — Auction Inventory SaaS

> Quick-resume note. Last updated 2026-04-30 (Stage 0b complete; pre-Stage 0c save point).

## Where we are

**Brainstorming + design pass + Phase 1 plan all complete.** User approved the spec and the 6-phase plan decomposition. **Stage 0a + Stage 0b are done.** Supabase access token revoked. Ready for **Stage 0c — subagent-driven execution of Task 1 + Task 0**.

User has paused here to restart VSCode and clear conversation context before continuing. **Do not dispatch any subagents on resume until the user explicitly says go.**

## Environment topology (decided + executed)

**Cloud-first with three Supabase projects on the user's existing $25/mo Pro plan. No local Supabase. No Docker required.**

| Environment | Purpose | DB | Status |
|---|---|---|---|
| Local dev (`npm run dev`) | Daily coding | **Dev** Supabase project | Created `auction-os-dev` (us-east-1, ACTIVE_HEALTHY, ref `yhqvzfiogobmbfhyxyll`) |
| `npm test` (Vitest) | API tests with `truncateAll()` | **Test** Supabase project | Created `auction-os-test` (us-east-1, ACTIVE_HEALTHY, ref `flpwsibabhdmpjcdzoqd`) |
| Vercel preview (per branch / PR) | Auto-deployed preview URLs | **Dev** Supabase project | Vercel project linked: `vantheos-4047s-projects/auction-os` |
| Vercel production (`main`) | Production | **Prod** Supabase project | Created `auction-os-prod` (us-east-1, ACTIVE_HEALTHY, ref `przkbkjxdqsxoqkngvog`) |

**Accounts (all under user's personal accounts; will migrate to relative's accounts before production data, per user decision):**
- GitHub: **`Vantheos`** — authenticated via stored gh credentials (no env var). GitHub repo not yet created.
- Vercel: `vantheos-4047` personal scope, free Hobby tier (sufficient for Phase 1)
- Supabase: AndreMan org, $25/mo Pro plan

## Key architectural decision made during Stage 0b

**Supabase JWT signing is ES256 (asymmetric), not HS256.** Modern Supabase publishes the public verification key at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. The Hono auth middleware uses `jose.createRemoteJWKSet` to fetch and cache it — **no shared `JWT_SECRET` is stored anywhere**.

This required updates to:
- `.env.setup.example` — `JWT_SECRET` lines removed
- Phase 1 plan Task 0.1, 0.2, 0.3 — env var references removed
- Phase 1 plan Task 1.5 — `.env.example` updated
- Phase 1 plan Task 9.3 — auth middleware code rewritten for ES256 + JWKS
- Phase 1 plan Task 10.2, 10.4 — test infrastructure regenerates an ES256 keypair per test run and injects local JWKS via a `setJwksForTesting()` escape hatch
- Phase 1 plan Task 21 — deployment env var list updated
- v1 design spec §3 — JWT signing and verification approach documented

## Files of record

| File | Purpose |
|---|---|
| `.env.setup` | Populated with all credentials for the three Supabase projects (gitignored) |
| `.env.setup.example` | Template, ES256 model |
| `.gitignore` | Protects `.env*` and `.vercel/` |
| `.vercel/` | Vercel project link metadata (gitignored) |
| `docs/superpowers/specs/2026-04-29-v1-design.md` | v1 design spec (engineering source of truth) |
| `docs/superpowers/plans/2026-04-29-phase-1-foundation.md` | **Phase 1 plan** — Tasks 0–21. Self-consistent for ES256. |
| `overview.md` | Working narrative (v1.0) |
| `ui-design.md` | Pre-design brief, points to `ui-design/design_handoff/` |
| `ui-design/design_handoff/` | Final visual mockups |
| `STATE.md` | This file |

## Stage 0 sub-stage progress

| Sub-stage | Description | Status |
|---|---|---|
| Stage 0a | CLI auth verification (Node, git, Docker, Vercel CLI, gh CLI, npm prefix on PATH) | ✅ Complete |
| Stage 0b | Supabase projects + Vercel link + .env.setup populated + ES256/JWKS adopted + PAT revoked | ✅ Complete |
| Stage 0c | Subagent executes Task 1 (`npm install` + scaffold) → Task 0 (write verify-env + env-setup scripts, run them) | ← next (pending user "go") |
| Stage 1+ | Subagent continues with Tasks 2–21 (frontend scaffold, schema, RLS, audit, API endpoints, etc.) | pending |

## Phase decomposition

| # | Phase | Status |
|---|---|---|
| 1 | Foundation | **In progress** — Stage 0c next |
| 2 | Mobile cataloging + label printing | Pending |
| 3 | Inventory management | Pending |
| 4 | Lifecycle, audit, frozen states | Pending |
| 5 | AI subsystem | Pending |
| 6 | Admin & polish | Pending |

## Resume prompt (paste verbatim after restart + new conversation)

> Continue work on auction-os. Stage 0a + 0b are complete per `STATE.md`. Read `STATE.md` first, then `docs/superpowers/plans/2026-04-29-phase-1-foundation.md`. The Supabase PAT was revoked at the end of Stage 0b — do not regenerate it; the env-setup script doesn't need it. Stage 0c is **subagent-driven execution starting with plan Task 1**, but **wait for me to explicitly say "go" before dispatching the first subagent**. Use subagent-driven-development mode (fresh subagent per task; user reviews between tasks).

## Key user preferences captured (in memory)

- Top-down spec process; one focused round per area
- File-based feedback for substantive input
- Mention CWD only when it matters
- Validate environment before running commands (pre-flight checks first)
- Don't just agree — push back when better alternatives exist
- Minimize manual human effort; automate where possible
