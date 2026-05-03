# Phase 3.5 — Client test infrastructure

> **Date:** 2026-05-02 (originally drafted 2026-05-02 PM; expanded scope 2026-05-02 evening after Phase 3 sign-off testing wrapped)
> **Status:** Drafted, not started — agreed scope locked in
> **Branch:** `phase-3-5-test-infra` off `phase-3-mobile-cataloging` after Phase 3 signs off
> **Slot:** Between Phase 3 sign-off and Phase 4 kickoff
> **Trigger:** The Phase 3 sign-off cycle exposed a much larger set of React Query / form-state / hook-wiring bugs than the original spec anticipated. Phase 4 (AI subsystem) will add 5-10+ new mutation hooks; we need a safety net before then.

## 1. Goal

Add the smallest viable client-side test surface that prevents the class of bugs the existing API-only suite is structurally blind to. Specifically: React Query cache wiring, optimistic-update behavior, error-toast wiring, form dirty-state tracking, and conditional render branches.

Non-goal: backfill comprehensive client tests for everything written in Phases 1-3. Backfill only the surfaces that just bit us, plus establish patterns for future work.

## 2. Why now

Three reasons:

1. **Cost already paid — bigger than expected.** Phase 3 sign-off found a long list of bugs in untested layers, not just one. Beyond the original queryKey mismatch (T-A6/A8/A10): toast wiring, empty-string `""` → server "Invalid" save errors, RHF reset-after-save behavior, optimistic update / rollback, PhotoManager session-coupling, upload processor invalidation timing. **None of these have regression tests today.**
2. **Phase 4 amplifies the risk significantly.** AI mutation hooks (per-lot AI run trigger, schedule config, status flips, cost tracking) are async, multi-step, and have implicit cache dependencies on lot data. Wiring bugs there will be subtle and hard to find via manual testing.
3. **Going-forward rule must be in place BEFORE Phase 4 starts.** "New hook → hook test required" is a policy. If it doesn't exist when Phase 4 momentum starts, AI hooks will ship without tests and we're back to bug-hunting sign-off cycles.

## 3. Scope

### 3.1 In scope

#### A. Test infrastructure (~0.5 day)

- Dev deps: `@testing-library/react`, `@testing-library/user-event`, `happy-dom`
- `vitest.config.ts` test environment switching: `node` for `tests/api/**`, `happy-dom` for `tests/client/**`
- `tests/helpers/mock-api.ts` — stub the `api` function from `@/lib/api`; per-test routes
- `tests/helpers/render-with-providers.tsx` — wrap component under test with `QueryClientProvider` (per-test client, no cache leakage), `ToastProvider`, `MemoryRouter`
- `tests/client/` directory created

#### B. Canonical patterns — copy-paste reference tests (~0.5 day)

One reference file per pattern, well-commented so future tests can branch from them:

- **B1.** Query invalidation: assert mutation X invalidates query Y (the queryKey alignment check)
- **B2.** Optimistic update: assert immediate UI flip, server-confirm path, AND rollback on error
- **B3.** Error-toast wiring: assert a failing mutation produces the right toast variant + content (title, description with server message)
- **B4.** Role-gated render: assert components hide/show controls based on `useRole`

#### C. Backfill regression tests (~1 day) — EXPANDED 2026-05-02 evening

Tests for each bug shipped during Phase 3 sign-off, so the same regression can never silently re-emerge:

**C1. `useLotMutations` (4 hooks) — invalidation**
- `useUpdateLot` / `useChangeLotState` / `useMoveLot` / `useDeleteLot` each invalidate `['lot', id]` and `['lots-infinite']` on settlement.

**C2. `useBulkLotAction` — invalidation**
- After bulk mutate, both `['lot']` (for any open modal) and `['lots-infinite']` (for inventory list) invalidate.

**C3. `useUpdateLot` + `useChangeLotState` — optimistic update + rollback**
- onMutate writes to `['lot', id]` cache before the server responds.
- onError rolls back to the captured previous value.
- onSettled invalidates regardless of outcome.

**C4. `LotDetail` — error toast wiring**
- Failing single-lot mutation (update / change-state / move / delete) produces a `danger` toast with the title + server-message description.
- Successful mutation produces a `success` toast.

**C5. `Inventory` — list refetches after mutation**
- The actual queryKey-mismatch regression. After a mutation, `useInfiniteLots` refetches and the visible list reflects the change.

**C6. `LotEditForm.handleValid` — empty-string → null normalization**
- Submitting with `price=""` (the bug that surfaced "Invalid" toast) sends `price: null` to the server, not `""`.
- Same for title / description / ref1 / ref2 / specialNotesText.

**C7. `LotEditForm` — `reset(values)` post-save behavior**
- After a successful submit, `formState.isDirty` returns to false.
- `onDirtyChange(false)` fires, so the unsaved-changes warning correctly stops triggering on close.
- After a FAILED submit (onSubmit rethrows), reset is NOT called — form stays dirty so the warning still fires.

**C8. `PhotoManager.onLotDeleted` — callback routing**
- When `onLotDeleted` is provided (cataloging path), the callback is awaited; default DELETE + invalidate is NOT called.
- When `onLotDeleted` is NOT provided (LotDetail path), the default DELETE + invalidate runs.

**C9. (Stretch) `upload-processor` — invalidation timing**
- After successful upload, `flipStatus` PATCH is followed by `invalidateQueries(['lot-photos', lotId])` BEFORE `dequeueUpload`. This prevents the blank-thumbnail flicker.
- Hard to test cleanly because the processor is a module-level singleton with a fetch call. May skip if mocking surface is too large; document as an explicit known-untested line in `docs/testing-policy.md`.

#### D. Going-forward rule (~0.25 day)

Documented in CLAUDE.md or a new `docs/testing-policy.md`:
- **New mutation hook → hook test required** (invalidation + error path at minimum; optimistic if applicable)
- **New user-visible flow → Playwright spec required** (deferred to Phase 4 — see §4)
- **Pre-push trio extended:** build + lint + vitest (already; just confirms client tests run with the existing `npm test`)

#### E. Server-side helper extraction (~0.25 day) — added 2026-05-02

Extract shared internal state-transition logic from `api/lots/[id].ts` (single PATCH) and `api/lots/bulk.ts` (`applyChangeState`) into `api/_lib/lot-state.ts`, e.g., `applyStateTransition(tx, lotId, to)`. Both endpoints currently duplicate the "clear jobId/lotNumber when transitioning to unassigned/not-sellable" cleanup. Surfaced during T-A10 sign-off review: not bug-worthy alone, but worth fixing while the test infra is being built so the new tests can pin behavior at the helper level.

### 3.2 Out of scope (deliberately)

- Comprehensive component tests for every page (Customers, Settings, Catalog picker, etc.) — too much surface, low ROI
- Form validation tests for every Zod schema — Zod itself is well-tested
- Visual regression / screenshot tests — too brittle for the design system's current churn
- Storybook or component sandbox — separate question, not test infra
- Mobile-specific UI checks (dvh, safe-area, auto-zoom) — these are CSS+browser concerns, not unit-testable; covered by the manual mobile UI checklist (`feedback_mobile_ui_checklist.md`)
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
- Pull-to-refresh on cataloging session preserves in-progress lot

Selectors: `data-testid` attrs, not text content. Add as we go.

## 5. Effort estimate (UPDATED 2026-05-02 evening)

| Workstream | Effort |
|---|---|
| A — Test infrastructure setup | 0.5 day |
| B — Canonical patterns (4 reference tests) | 0.5 day |
| C — Backfill regression tests (9 items, was 4) | **1 day** (was 0.5 day) |
| D — Going-forward rule docs | 0.25 day |
| E — Server-side helper extraction | 0.25 day |
| **Total** | **~2.5 days** (was 1.75 days) |

Increase comes entirely from C: the original four-item backfill was the queryKey-mismatch + immediate consequences. Adding C3, C5, C6, C7, C8, C9 mirrors the actual bugs that surfaced during sign-off testing and would prevent each one's regression.

## 6. Sequencing

1. **Phase 3 signs off** — branch `phase-3-mobile-cataloging` declared complete; carry-forwards (T-G1, T-G2, T-G6) explicitly tracked.
2. **STATE.md updated** with the Phase 3 sign-off summary + carry-forward to Phase 3.5.
3. **Branch:** create `phase-3-5-test-infra` off `phase-3-mobile-cataloging`.
4. **Execute Phase 3.5** in the order: A (infra) → B (canonical patterns) → C (backfill) → E (server helper extraction) → D (going-forward rule docs).
5. **Sign off Phase 3.5** — same gate as other phases: trio green + canonical patterns demonstrably catch the kind of regression they're supposed to (run a temporary breaking change against the test, see it fail, revert).
6. **Phase 4 kickoff** — top-down spec discussion for AI subsystem; include the Playwright workstream in the Phase 4 plan.

## 7. Acceptance gate

- [ ] `npm test` runs both API and client tests; both green
- [ ] At least one regression test, when temporarily inverted, would have caught the queryKey mismatch
- [ ] At least one regression test, when temporarily inverted, would have caught the empty-string "Invalid" save bug
- [ ] `tests/client/` has the four canonical patterns documented
- [ ] CLAUDE.md or `docs/testing-policy.md` codifies the going-forward rule
- [ ] Server-side state-transition helper extracted; both endpoints (single PATCH, bulk change-state) call into it
- [ ] STATE.md updated; ready for Phase 4 spec discussion

## 8. Open questions

1. **Should canonical patterns live as comments inside test files, or as a separate `docs/testing-patterns.md`?** — leaning toward the latter so they're discoverable without grepping.
2. **`@testing-library/user-event` v14 vs RTL `fireEvent`?** — `user-event` is preferred for realism but slower. Default to `user-event`; drop to `fireEvent` only when speed matters.
3. **MSW vs hand-rolled `mockApi`?** — MSW is the industry standard but adds a service worker layer we don't need. Hand-rolled stub of `@/lib/api` is simpler given we have one chokepoint. Default to hand-rolled; revisit if the surface grows.
4. **C9 (upload-processor test) — include or document as untested?** — depends on how clean the mock surface ends up. Try first; if mocking fetch + queryClient + IDB gets gnarly, document the gap in `docs/testing-policy.md` and move on.

These are minor — flag-and-decide during execution, not before.
