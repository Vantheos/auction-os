# Testing policy

Phase 3.5 added a client-side test surface (RTL + happy-dom) on top of the
existing API integration suite. The rules below are the going-forward bar
for any new code that touches a mutation, a user-visible flow, or the
pre-push gate.

## Rules

### 1. New mutation hook → hook test required

Any new `useMutation` (or hook that wraps one) needs at minimum:

- **Invalidation test.** After the mutation settles, every queryKey the hook
  intends to invalidate is actually invalidated. Catches the queryKey-drift
  class of bug — Phase 3's T-A6/A8/A10 (`['lots']` vs `['lots-infinite']`).
  Pattern reference: [`tests/client/patterns/01-query-invalidation.test.tsx`](../tests/client/patterns/01-query-invalidation.test.tsx).
- **Error-path test.** A failing mutation produces the right user feedback
  (toast variant + content). Catches the "silent failure" class — Phase 3's
  missing toast wiring on single-lot mutations. Pattern reference:
  [`tests/client/patterns/03-error-toast.test.tsx`](../tests/client/patterns/03-error-toast.test.tsx).
- **Optimistic test (if applicable).** If the hook does an optimistic
  cache write, assert the optimistic value, the rollback on error, and the
  invalidate on settle — all in one test. Pattern reference:
  [`tests/client/patterns/02-optimistic-update-rollback.test.tsx`](../tests/client/patterns/02-optimistic-update-rollback.test.tsx).

### 2. New user-visible flow → Playwright spec required

Deferred to Phase 4. The Phase 4 plan includes a Playwright workstream;
new flows added between now and then carry an implicit "needs e2e" debt
that Phase 4 will pay down. Document the flow in the Phase 4 spec when
adding it so it can't be forgotten. Rationale for the deferral lives in
`docs/superpowers/specs/2026-05-02-phase-3-5-design.md` §4.

### 3. Pre-push trio (unchanged, but reaffirmed)

Before any push that could trigger a Vercel deploy:

```
npm test    # 175+ tests across api + client projects, all green
npm run lint   # 0 errors, 0 warnings
npm run build  # tsc -b && vite build, clean
```

All three must be green. Phase 3.5 added the client suite to `npm test` via
`vitest.workspace.ts` — no script change needed.

## Patterns

When writing a new test, copy the closest pattern file as a starting point
rather than freelancing. The catalog lives at
[`docs/testing-patterns.md`](./testing-patterns.md).

## Helpers

- [`tests/helpers/render-with-providers.tsx`](../tests/helpers/render-with-providers.tsx)
  — `renderWithProviders` (components) and `renderHookWithProviders` (hooks).
- [`tests/helpers/mock-api.ts`](../tests/helpers/mock-api.ts) — replaces
  `@/lib/api` with a per-test route map. Strips query strings before
  matching (`'GET /lots'` covers `/lots?limit=50&offset=0`).
- [`tests/helpers/fixtures.ts`](../tests/helpers/fixtures.ts) — `makeLot`
  and `makePhoto` factories.

## Known gaps

These are intentional carve-outs from the test surface; flagged so that
"why is X not tested?" doesn't keep coming up.

- **Mobile-specific UI checks** (dvh, safe-area-inset, iOS auto-zoom,
  touch targets). CSS + browser concerns; not unit-testable. Covered by
  the manual checklist in `feedback_mobile_ui_checklist.md` (project memory).
- **State change + move toast wiring on `LotDetail`.** The four
  single-lot mutation toasts share one wiring shape; save and delete are
  tested in [`tests/client/components/LotDetail.test.tsx`](../tests/client/components/LotDetail.test.tsx).
  Add state-change and move tests when those flows are touched (driving
  the nested ChangeStateMenu / MoveLotDialog UIs is significant test
  surface for diminishing return on a pattern that's already pinned).
- **`upload-processor` retry/backoff paths.** The success path's
  invalidation timing is tested
  ([`tests/client/lib/upload-processor.test.ts`](../tests/client/lib/upload-processor.test.ts)),
  but the transient-failure backoff and permanent-failure paths aren't.
  The processor is a module-level singleton with significant idb +
  fetch + timer mocking surface; add when the retry logic changes.
