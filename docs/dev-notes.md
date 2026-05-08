# Dev notes — accumulated gotchas

> **Living document.** Add to this whenever a session discovers a non-obvious
> pattern, dependency quirk, or cross-surface coupling. The intent is to
> stop future sessions from rediscovering the same things.
>
> **Read this file at the start of any session that involves:**
> - touching the AI subsystem (anthropic.ts, prompts.ts, ai-finalize, ai-backlog, ai-run)
> - changing UI in inventory or catalog (desktop and mobile have parallel components)
> - modifying API endpoints whose responses are written to TanStack Query cache
> - extending bulk actions, lot mutations, or schedule logic
> - applying or generating migrations
> - debugging anything that "fails for no reason"

## Build, dependencies, and SDK quirks

### Anthropic SDK 0.95+ uses Zod 4 at runtime, types as Zod 3

Symptom: AI runs fail immediately with `"Cannot read properties of undefined reading 'def'"`.

Cause: `@anthropic-ai/sdk/helpers/zod.js` does `import * as z from 'zod/v4'` and calls `z.toJSONSchema(schema)` (a Zod 4 API that reads `schema.def`). If you hand it a Zod 3 schema (`import { z } from 'zod'`), it accesses `.def` on a value that uses `_def` instead → undefined → crash. The error fires before any HTTP request is sent, so no token spend.

Fix lives in [src/lib/ai/anthropic.ts](../src/lib/ai/anthropic.ts):
```ts
import { z } from 'zod/v4';
// ...
output_config: { format: zodOutputFormat(AiOutputSchema as unknown as Parameters<typeof zodOutputFormat>[0]) },
```

The `zod/v4` namespace ships alongside Zod 3 in zod 3.25+. The cast bridges the SDK's `.d.ts` (still typed against Zod 3) until upstream ships Zod 4 types. Drop the cast when that happens.

**Lesson:** when adopting AI/SDK helpers, run a smoke probe (`npm run probe:ai -- --lots 1`) against real Anthropic before declaring the integration done. The unit tests use the SDK mock and won't catch this class of issue.

### Supabase Storage rejects some image MIME types silently

The lot-photos bucket policy accepts `image/jpeg` and `image/png`. webp / heic / gif / etc. produce a signed upload URL that returns an error when the bytes are PUT, leaving an orphan `lot_photo` row in `pending` or `failed` status and an upload-queue entry stuck in IDB.

Pre-server validation is the right layer to gate this. See [src/components/catalog/LotInProgress.tsx](../src/components/catalog/LotInProgress.tsx) `ALLOWED_PHOTO_MIME` and the pre-`captureFirst` check.

**Lesson:** any external upload target with a content-policy filter needs client-side validation BEFORE creating server-side rows. Don't let a doomed upload create persistent state.

## Cross-surface consistency — UI

### Desktop and mobile inventory filters are SEPARATE components

[src/components/inventory/InventoryFilters.tsx](../src/components/inventory/InventoryFilters.tsx) (desktop, inline above the table) and [src/components/inventory/InventoryFiltersMobileSheet.tsx](../src/components/inventory/InventoryFiltersMobileSheet.tsx) (mobile bottom-drawer) render the same `Filters` type but have independent JSX. Adding or removing a chip on the desktop side does NOT propagate to mobile — you must update both.

**Lesson before any inventory-filter change:** grep for the `Filters` type and update every component that renders a chip set. Same applies to the inventory list rendering: [InventoryTable.tsx](../src/components/inventory/InventoryTable.tsx) (desktop) vs [InventoryMobile.tsx](../src/components/inventory/InventoryMobile.tsx).

### URL-param navigation must preserve filter params

When you need to add a query param to the current URL (e.g., `?openLot=<id>`), DO NOT use a hardcoded `<Link to={"/inventory?openLot=..."}>` — that wipes whatever filter params are already set. Build a new URLSearchParams from the current one, mutate just the key you care about, and pass the result to `setSearchParams`.

[src/routes/Inventory.tsx](../src/routes/Inventory.tsx)'s `setOpenLot` is the pattern to follow.

### Same-component-different-surfaces parallels

When fixing a bug in a shared component, check whether the same component renders elsewhere too. Examples:
- `JobExportButton` is rendered in both `Inventory.tsx` (per-job filtered) and `CustomerDetail.tsx` (per job in the list). Fixing visibility logic touches both consumers via shared component.
- `PhotoStrip` is rendered in both catalog (`LotInProgress`) and lot detail (`LotDetail`). Layout changes apply to both.
- `LotDetail` is rendered inside a Radix Dialog used by Inventory; the Dialog renders the same on desktop and mobile, so a fix to `LotDetail` covers both.

## Cross-surface consistency — server

### "Eligibility for AI" is defined in three places

These three queries must stay in sync. The current definition: `lastAiRunStatus IS NULL AND state IN ('assigned','unassigned') AND (title IS NULL OR title='' OR description IS NULL OR description='' OR price IS NULL)`.

| Surface | Where |
|---|---|
| Cron + Run Now eligibility | [api/ai/backlog.ts](../api/ai/backlog.ts) — main fetch + remaining count |
| Pending-AI badge | [api/system-settings.ts](../api/system-settings.ts) — `fetchAiPendingLotCount` |
| Awaiting AI inventory filter | [api/lots/index.ts](../api/lots/index.ts) — `awaitingAiClause` |

When the eligibility definition changes, all three must update or operators see inconsistent counts vs filter results vs what AI actually picks up.

### PATCH responses must match GET responses in shape

The client uses TanStack Query's `setQueryData` to update the cache from the PATCH response. If GET returns `{ ...row, computedField: N }` and PATCH returns just `{ ...row }`, `computedField` becomes `undefined` after a successful PATCH and the UI renders `"undefined ..."`.

Example: `aiPendingLotCount` is computed in both GET and PATCH for `/api/system-settings`. If you add another computed field, add it to BOTH branches (or extract to a shared helper, like `fetchAiPendingLotCount`).

### Audit attribution requires the asActor wrapper

Lot mutations that should be attributed to a user must go through `asActor(userId, async (tx) => {...})`. The audit trigger reads `request.jwt.claim.sub` which `asActor` sets via `set_config()`. Bare `getDb().transaction()` writes get `changed_by = NULL`.

Cron-driven runs intentionally use bare `getDb().transaction()` so audit writes show `changed_by = NULL` (system-driven). Run Now and per-lot Run AI use `asActor` with the operator's userId.

## Schema constraints

### `lot.state_tuple_consistent` CHECK

```
state IN ('assigned','sold','picked-up') → job_id IS NOT NULL AND lot_number IS NOT NULL
state IN ('unassigned','not-sellable')   → job_id IS NULL     AND lot_number IS NULL
```

Test fixtures and any code that toggles state must preserve this. The bulk move action handles transitions correctly; manual state changes via PATCH are handled by `stateTransitionFields` in [api/_lib/lot-state.ts](../api/_lib/lot-state.ts).

When writing test fixtures: an `unassigned` lot needs both `jobId: null` AND `lotNumber: null`, not just one.

### Prices stored as `numeric(10,2)` strings

`lot.price` round-trips as a string in TS (Drizzle/Postgres convention). Schema validation regex: `/^\d+(\.\d{1,2})?$/`. Don't include `$` or commas. Empty strings are NOT valid — use null.

## State management patterns

### `useState` destructuring without setter is a silent bug

`const [savedCount] = useState(0)` compiles fine but the value is fixed at the initial. Always destructure both `[value, setter]` or you'll have a state that can't update. (Caught in `CatalogSession.tsx` — the savedCount counter was permanently 0.)

### setState-in-effect anti-pattern

`react-hooks/set-state-in-effect` lint rule flags `useEffect(() => setX(y), [...])`. Prefer derived values during render (e.g., `const visualOpen = open && conditionMet`) or move the state update into the user-action handler that caused the change. Existing code uses `/* eslint-disable react-hooks/set-state-in-effect */` for legitimate synchronization cases (e.g., `LotInProgress.tsx` form hydration).

### TanStack Query cache + setQueryData write race

When a mutation's `onSuccess` calls `queryClient.setQueryData(['key'], response)`, the response replaces the cached value entirely. If the response is missing fields the cache had, those fields go undefined. Either:
- Make sure server responses match the GET shape (preferred)
- Use `invalidateQueries` to force a refetch instead (one extra round-trip)

## Vercel platform behaviors

### Crons only run on production deployments

Vercel does NOT trigger configured `crons` on preview branches by default. Testing cron-triggered logic on preview requires either curl-simulating the request with `CRON_SECRET`, or promoting the branch to production. The cron-handler code path (auth, gate logic, drain mechanics) is fully testable in unit tests; only the actual Vercel-fired schedule needs prod.

### Per-commit preview URLs are pinned

`https://auction-<hash>-vantheos-...vercel.app` always serves the code that was built for that commit. To test the latest commit, either use the latest deployment's URL from the dashboard or the branch-pinned URL `https://auction-os-git-<branch-slug>-...vercel.app` which auto-updates.

### Browser IndexedDB is per-origin

Each per-commit preview URL gets its own IDB. Switching previews effectively gives a clean client state. Useful for testing but means stuck queue entries on an old URL persist if you go back to it. The catalog upload queue lives at `auction-os-upload-queue` / store `photo-upload-queue`; the form-mirror cache at `auction-os-form-mirror` / store `lot-form-cache`.

## Testing and pre-push discipline

### Pre-push trio (non-negotiable)

Before any push that triggers a Vercel deploy:
```
npm run build && npm run lint && npm test
```

All three must be green. **Lint warnings count as failures** — the project uses 0/0 as the bar. Common warning to silence: `react-hooks/set-state-in-effect` when the case is a legitimate synchronization (use a derived value or refactor; see above).

### Migrations apply to BOTH Dev and Test DBs

The `apply-migration.ts` script at [scripts/apply-migration.ts](../scripts/apply-migration.ts) is the project's hand-written-migration tool (avoids drizzle-kit's CHECK-constraint introspection bug). Apply to Dev:

```
npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql
```

And to Test:

```
npx dotenv-cli -e .env.test -- npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql
```

Always do both. Tests use the Test DB; missing migration there shows up as "column does not exist" failures.

### `drizzle-kit push --force` is denied by default

The user's Bash permission rule blocks unauthorized `drizzle-kit push --force` (it's a blind apply that bypasses migration review). Use `apply-migration.ts` instead.

## Process patterns

### Read the spec, then trust the code

The Phase specs in `docs/superpowers/specs/` are snapshots in time. Implementation drifts. When the spec disagrees with the code, the code is authoritative — but flag the drift so future sessions don't re-read the wrong spec. Spec amendments are inline blocks (see existing examples like §3.4 in the Phase 6 design doc).

### Phase work goes on `phase-N-<slug>` branches; main is reserved for v1 cutover

Don't push to main during phase work. The Vercel webhook on main triggers production deploy. Phase branches get preview deploys.

### Pushing is a shared-state action

Auto mode covers local-only work. Pushing to a branch that has a Vercel deploy hook crosses into shared-state — confirm with the user before push when auto mode is off, or trust the user's prior approval when auto mode is on.

### Author email determines Vercel attribution

Repo-local git config must use `Vantheos <ops@vantheos.com>`. Wrong author email → AAndreManN attribution → Vercel rejects deploys. (Captured in user's auto-memory.)

## Adding to this file

If you discover a new gotcha:
1. Add it to the relevant section above.
2. Date the addition if it's tied to a specific upstream change (SDK version, etc.).
3. Link to the relevant code path so future sessions can verify the fix is still in place.
4. Be specific. "X breaks when Y" beats "be careful with X."

If a gotcha becomes obsolete (upstream fix lands, code refactor moots the issue), strike it through with `~~old text~~` and add a dated note explaining why it's no longer relevant. Don't delete — the history is valuable for future debugging.
