# Client testing patterns

Canonical patterns for client-side tests live as heavily-commented test files
under `tests/client/patterns/`. Tests-as-docs stay in sync with the helpers and
prove themselves green every CI run; markdown explanations rot.

When writing a new test, copy the closest pattern file as a starting point and
adapt the synthetic toy hook/component to your real one. The structural moves
(setup, mock routes, assertions) stay the same.

## Pattern catalog

| Writing… | Start from |
|---|---|
| A mutation hook → assert it invalidates the right queryKey | [`tests/client/patterns/01-query-invalidation.test.tsx`](../tests/client/patterns/01-query-invalidation.test.tsx) |
| …same hook with optimistic update + rollback on error | [`tests/client/patterns/02-optimistic-update-rollback.test.tsx`](../tests/client/patterns/02-optimistic-update-rollback.test.tsx) |
| …assert a failing mutation produces a toast with the server message | [`tests/client/patterns/03-error-toast.test.tsx`](../tests/client/patterns/03-error-toast.test.tsx) |
| A component with role-gated controls (`useRole`-driven render) | [`tests/client/patterns/04-role-gated-render.test.tsx`](../tests/client/patterns/04-role-gated-render.test.tsx) |

## Helpers

- [`tests/helpers/render-with-providers.tsx`](../tests/helpers/render-with-providers.tsx)
  — wraps the subject in `QueryClientProvider` (per-call fresh client),
  `MemoryRouter`, and `ToastProvider`. `Toaster` is opt-in via `withToaster:
  true`. Exports `renderWithProviders` (components) and
  `renderHookWithProviders` (hooks).
- [`tests/helpers/mock-api.ts`](../tests/helpers/mock-api.ts) — replaces
  `@/lib/api` with a per-test route map. Routes match exact `METHOD /path`
  first, then patterns with `:param` segments. Tracks calls for assertion via
  `getApiCalls()`.

## Boilerplate at the top of every client test that hits the API

```ts
vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());
```

Vitest hoists `vi.mock` to the top of the file regardless of where it appears,
which is why the factory `await`s the helper module rather than referencing
the `apiMockImpl` import directly.

## Going-forward rule

The "new mutation hook → hook test required" policy will land in
`docs/testing-policy.md` (workstream D of Phase 3.5).
