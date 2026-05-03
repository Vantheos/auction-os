// tests/helpers/setup-client.ts
// Client project setup. Registers @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) on vitest's expect, and
// wires RTL's cleanup() to run after each test. RTL's auto-cleanup only
// fires when vitest globals are exposed; we keep globals off everywhere
// else, so we register cleanup explicitly here.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
