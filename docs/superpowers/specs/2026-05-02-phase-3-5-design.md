# Phase 3.5 — Client test infrastructure

> **Date:** 2026-05-02
> **Status:** Drafted, not started
> **Branch:** TBD (`phase-3-5-test-infra` after Phase 3 signs off)
> **Slot:** Between Phase 3 sign-off and Phase 4 kickoff
> **Trigger:** The Phase 3 sign-off cycle exposed a TanStack Query queryKey-mismatch regression (`['lots']` vs `['lots-infinite']`) that no existing test could catch. Phase 4 (AI subsystem) will add 5-10+ new mutation hooks; we need a safety net before then.

## 1. Goal

Add the smallest viable client-side test surface that prevents the class of bugs the existing API-only suite is structurally blind to. Specifically: React Query cache wiring, optimistic-update behavior, error-toast wiring, and conditional render branches.

Non-goal: backfill comprehensive client tests for everything written in Phases 1-3. Backfill only the surfaces that just bit us, plus establish patterns for future work.

## 2. Why now

Three reasons:

1. **Cost already paid.** Phase 3 sign-off found T-A6, T-A8, T-A10 — three findings that traced to a single missed queryKey. A unit test would have caught it in seconds.
2. **Phase 4 amplifies the risk.** AI mutation hooks (title/description/reference price generation) are async, multi-step, and have implicit cache dependencies on lot data. Wiring bugs there will be subtle.
3. **Cheap to add.** Vitest is already running. The infra is `@testing-library/react` + `happy-dom` + a `mockApi` helper. ~1 day of setup.

## 3. Scope

### 3.1 In scope

**A. Test infrastructure**
- Dev deps: `@testing-library/react`, `@testing-library/user-event`, `happy-dom`
- `vitest.config.ts` test environment switching: `node` for `tests/api/**`, `happy-dom` for `tests/client/**`
- `tests/helpers/mock-api.ts` — stub the `api` function from `@/lib/api`; per-test routes
- `tests/helpers/render-with-providers.tsx` — wrap component under test with `QueryClientProvider` (per-test client, no cache leakage), `ToastProvider`, `MemoryRouter`
- `tests/client/` directory created

**B. Canonical patterns** (one each, copy-paste targets)
- Query invalidation: assert that mutation X invalidates query Y
- Optimistic update: assert immediate UI flip, then server-confirm or rollback
- Error toast wiring: assert that a failing mutation produces the right toast variant + content
- Role-gated render: assert that components hide/show controls based on `useRole`

**C. Backfill — only what just regressed**
- `useLotMutations` (4 hooks) — invalidation tests, optimistic-update tests, error-toast tests
- `useBulkLotAction` — invalidation test
- `LotDetail` — error-toast wiring test (single-lot mutations)
- `Inventory` — assert list refetches after a lot mutation (the actual regression we just fixed)

**E. Server-side helper extraction (added 2026-05-02)**
- Extract shared internal state-transition logic from `api/lots/[id].ts` (single PATCH) and `api/lots/bulk.ts` `applyChangeState` into `api/_lib/lot-state.ts` (e.g., `applyStateTransition(tx, lotId, to)`). Both endpoints currently duplicate the "clear jobId/lotNumber when transitioning to unassigned/not-sellable" cleanup.
- Surfaced during T-A10 sign-off review: not bug-worthy alone, but worth fixing while the test infra is being built so the new tests can pin behavior at the helper level.
- Estimated: 0.25 day. Brings 3.5 total to ~2 days.

**D. Going-forward rule**
- Add to CLAUDE.md or a new `docs/testing-policy.md`:
  - New mutation hook → hook test required (invalidation + error path)
  - New user-visible flow → Playwright spec required (deferred to Phase 4 — see §4)
  - Pre-push trio extended: build + lint + vitest (already; just confirms client tests run with the existing `npm test`)

### 3.2 Out of scope (deliberately)

- Comprehensive component tests for every page (Customers, Settings, Catalog, etc.) — too much surface, low ROI
- Form validation tests for every Zod schema — covered by Zod itself
- Visual regression / screenshot tests — too brittle for the design system's current churn
- Storybook or component sandbox — separate question, not test infra
- E2E Playwright tests — deferred to Phase 4 (see §4)

## 4. Playwright e2e — deferred, not abandoned

Playwright e2e is the right tool for "wires" — login → API → DB → UI. But:

- **Local `vercel dev` is blocked** by the documented body-parsing quirk (STATE.md plan deviations #10). Playwright must run against a deployed Vercel preview, which adds latency.
- **Test-data scaffolding is the hard part.** Each spec needs known fixtures. We'd extend `seed:test-lots` into `seed:e2e` (idempotent reset to known state) and create dedicated playwright users so manual testing doesn't collide.
- **Phase 4 is the natural slot** — AI flows benefit most from e2e coverage, and we'll have to build the test-data scaffolding anyway for AI-generated content assertions.

Phase 4 plan should include a Playwright workstream as a parallel deliverable. Initial target: 5-10 golden-path specs:
- Login per role + correct landing route
- Inventory → modal → save → list reflects change (the exact regression we just fixed)
- Bulk delete → list reflects
- Move dialog → state transitions to assigned
- Catalog session → first photo capture → lot creation → next lot
- Role gating: warehouse cannot reach /settings, etc.

Selectors: `data-testid` attrs, not text content. Add as we go.

## 5. Effort estimate

| Workstream | Effort |
|---|---|
| Add deps + vitest config switch + helpers (3.1.A) | 0.5 day |
| Write 4 canonical patterns (3.1.B) | 0.5 day |
| Backfill regression tests (3.1.C) | 0.5 day |
| Update docs + CLAUDE.md going-forward rule (3.1.D) | 0.25 day |
| **Total** | **~1.75 days** |

## 6. Sequencing

1. **Finish Phase 3 sign-off as-is.** No scope expansion mid-test cycle.
2. **Update STATE.md** with the Phase 3 sign-off summary + carry-forward to Phase 3.5.
3. **Branch:** `phase-3-5-test-infra` off `phase-3-mobile-cataloging`.
4. **Execute Phase 3.5** in the order above (infra → patterns → backfill → docs).
5. **Sign off Phase 3.5** — same gate as other phases: trio green + canonical patterns demonstrably catch the kind of regression they're supposed to (run a temporary breaking change against the test, see it fail, revert).
6. **Phase 4 kickoff** — top-down spec discussion for AI subsystem; include the Playwright workstream in the Phase 4 plan.

## 7. Acceptance gate

- [ ] `npm test` runs both API and client tests; both green
- [ ] At least one regression test, when temporarily inverted, would have caught the queryKey mismatch
- [ ] `tests/client/` has the four canonical patterns documented
- [ ] CLAUDE.md or `docs/testing-policy.md` codifies the going-forward rule
- [ ] STATE.md updated; ready for Phase 4 spec discussion

## 8. Open questions

1. **Should canonical patterns live as comments inside test files, or as a separate `docs/testing-patterns.md`?** — leaning toward the latter so they're discoverable without grepping.
2. **`@testing-library/user-event` v14 vs RTL `fireEvent`?** — `user-event` is preferred for realism but slower. Default to `user-event`; drop to `fireEvent` only when speed matters.
3. **MSW vs hand-rolled `mockApi`?** — MSW is the industry standard but adds a service worker layer we don't need. Hand-rolled stub of `@/lib/api` is simpler given we have one chokepoint. Default to hand-rolled; revisit if the surface grows.

These are minor — flag-and-decide during execution, not before.
