// tests/helpers/render-with-providers.tsx
// Wraps a component under test in the same provider stack as src/main.tsx,
// substituting MemoryRouter for BrowserRouter and giving each render a fresh
// QueryClient (no cache leakage between tests). Returns the standard RTL
// result extended with the queryClient so tests can inspect cache state
// (e.g. assert that a mutation invalidated a specific queryKey).

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { ReactElement, ReactNode } from 'react';

export type RenderWithProvidersOptions = {
  initialEntries?: string[];
  // Default: false. Set true when the test needs to assert toast content
  // appearing in the DOM. Default-off keeps DOM smaller and queries faster
  // for the common case where you only care about component behavior.
  withToaster?: boolean;
  queryClient?: QueryClient;
  renderOptions?: Omit<RenderOptions, 'wrapper'>;
};

export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient;
};

// Per-test client: retries OFF (otherwise failure-path tests wait through
// react-query's default 3 retries with exponential backoff before settling),
// caches don't expire (test runs are short; gc churn just adds noise).
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  opts: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const queryClient = opts.queryClient ?? createTestQueryClient();
  const initialEntries = opts.initialEntries ?? ['/'];
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>
          {children}
          {opts.withToaster ? <Toaster /> : null}
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(ui, { wrapper: Wrapper, ...opts.renderOptions });
  return Object.assign(result, { queryClient });
}
