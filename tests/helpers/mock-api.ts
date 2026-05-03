// tests/helpers/mock-api.ts
// Hand-rolled stub of `@/lib/api` for client tests. The single-function
// surface of api() makes a service-worker layer (MSW) unnecessary — we just
// replace the module export with a vi.fn that consults a per-test route map.
//
// Usage in a test file:
//
//   import { mockApi, resetMockApi, getApiCalls } from '../helpers/mock-api';
//
//   vi.mock('@/lib/api', async () => {
//     const { apiMockImpl } = await import('../helpers/mock-api');
//     return { api: apiMockImpl };
//   });
//
//   beforeEach(() => resetMockApi());
//
//   it('does the thing', async () => {
//     mockApi({
//       'GET /lots': () => ({ items: [{ id: '1' }] }),
//       'PATCH /lots/:id': ({ body }) => ({ id: 'x', ...body as object }),
//     });
//     // ...render, interact, assert...
//     expect(getApiCalls()).toEqual([{ method: 'GET', path: '/lots', body: undefined }]);
//   });
//
// Routes match exact `METHOD /path` first, then fall through to pattern
// matching where `:param` segments are wildcards. Returning a function gives
// you access to the call ctx; returning a value (or async function) sends
// it back as the resolved JSON.

import { vi, type Mock } from 'vitest';

type ApiCall = { method: string; path: string; body: unknown };

export type RouteCtx = ApiCall & { init?: RequestInit };
export type RouteHandler = (ctx: RouteCtx) => unknown | Promise<unknown>;
export type RouteSpec = RouteHandler | unknown;
export type RouteMap = Record<string, RouteSpec>;

let routes: RouteMap = {};
let calls: ApiCall[] = [];

function matchRoute(method: string, path: string): { key: string; spec: RouteSpec } | null {
  const exactKey = `${method} ${path}`;
  if (exactKey in routes) return { key: exactKey, spec: routes[exactKey] };
  for (const key of Object.keys(routes)) {
    const sep = key.indexOf(' ');
    if (sep < 0) continue;
    const m = key.slice(0, sep);
    const pattern = key.slice(sep + 1);
    if (m !== method) continue;
    const regexSrc =
      '^' +
      pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:[^/\\]+/g, '[^/]+') +
      '$';
    if (new RegExp(regexSrc).test(path)) return { key, spec: routes[key] };
  }
  return null;
}

export const apiMockImpl: Mock = vi.fn(async (path: string, init?: RequestInit) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: unknown;
  if (init?.body != null) {
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      body = init.body;
    }
  }
  calls.push({ method, path, body });
  const matched = matchRoute(method, path);
  if (!matched) {
    throw new Error(`mockApi: no route registered for ${method} ${path}`);
  }
  if (typeof matched.spec === 'function') {
    return (matched.spec as RouteHandler)({ method, path, body, init });
  }
  return matched.spec;
});

export function mockApi(newRoutes: RouteMap): void {
  routes = { ...routes, ...newRoutes };
}

export function resetMockApi(): void {
  routes = {};
  calls = [];
  apiMockImpl.mockClear();
}

export function getApiCalls(): ApiCall[] {
  return calls.slice();
}

export function getApiSpy(): Mock {
  return apiMockImpl;
}
