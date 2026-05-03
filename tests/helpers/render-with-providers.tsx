// tests/helpers/render-with-providers.tsx
// Wraps a component (or hook) under test in the same provider stack as
// src/main.tsx, substituting MemoryRouter for BrowserRouter and giving each
// render a fresh QueryClient (no cache leakage between tests). Returns the
// standard RTL result extended with the queryClient so tests can inspect
// cache state (e.g. assert that a mutation invalidated a specific queryKey).

import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { ReactElement, ReactNode } from 'react';

export type ProviderOptions = {
  initialEntries?: string[];
  // Default: false. Set true when the test needs to assert toast content
  // appearing in the DOM. Default-off keeps DOM smaller and queries faster
  // for the common case where you only care about component behavior.
  withToaster?: boolean;
  queryClient?: QueryClient;
};

export type RenderWithProvidersOptions = ProviderOptions & {
  renderOptions?: Omit<RenderOptions, 'wrapper'>;
};

export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient;
};

export type RenderHookWithProvidersOptions<TProps> = ProviderOptions & {
  hookOptions?: Omit<RenderHookOptions<TProps>, 'wrapper'>;
};

export type RenderHookWithProvidersResult<TResult, TProps> = RenderHookResult<
  TResult,
  TProps
> & {
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

// Opt into the v7 behavior so the deprecation warnings don't pollute test
// stderr. These don't change current behavior; they just silence the notices.
const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function buildWrapper(opts: ProviderOptions, queryClient: QueryClient) {
  const initialEntries = opts.initialEntries ?? ['/'];
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries} future={ROUTER_FUTURE}>
          <ToastProvider>
            {children}
            {opts.withToaster ? <Toaster /> : null}
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  opts: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const queryClient = opts.queryClient ?? createTestQueryClient();
  const Wrapper = buildWrapper(opts, queryClient);
  const result = render(ui, { wrapper: Wrapper, ...opts.renderOptions });
  return Object.assign(result, { queryClient });
}

export function renderHookWithProviders<TResult, TProps = unknown>(
  hook: (initialProps: TProps) => TResult,
  opts: RenderHookWithProvidersOptions<TProps> = {},
): RenderHookWithProvidersResult<TResult, TProps> {
  const queryClient = opts.queryClient ?? createTestQueryClient();
  const Wrapper = buildWrapper(opts, queryClient);
  const result = renderHook(hook, { wrapper: Wrapper, ...opts.hookOptions });
  return Object.assign(result, { queryClient });
}
