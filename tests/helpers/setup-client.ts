// tests/helpers/setup-client.ts
// Client project setup. Registers @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) on vitest's expect, wires
// RTL's cleanup() to run after each test, and absorbs unhandled promise
// rejections from intentional production patterns.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// react-hook-form's handleSubmit re-throws when the user-supplied handler
// rejects. This is by design — LotDetail.handleSave re-throws on save
// failure so the unsaved-changes guard keeps firing. The form's submit
// event handler is unawaited (React doesn't track event-handler return
// values), so the rejection surfaces as "unhandled" at the Node level even
// though browsers and user-event handle it correctly.
//
// Log + swallow rather than crashing the test runner. Real bugs would
// still surface as failing assertions; this only silences the
// process-level detector.
//
// Guard with a globalThis symbol so we attach the handler exactly once
// per worker process. Vitest runs setupFiles per test file with fresh
// module isolation, so without this guard, each file would add another
// listener — after ~10 files Node logs MaxListenersExceededWarning, and
// a single intentional rejection (e.g. the LotEditForm "boom" test)
// fires through every stacked handler. globalThis survives module
// re-instantiation within the worker, so the flag persists across
// files.
const HANDLER_INSTALLED = Symbol.for('auction-os.client-test.unhandled-rejection-handler');
type WithFlag = typeof globalThis & { [HANDLER_INSTALLED]?: boolean };
if (!(globalThis as WithFlag)[HANDLER_INSTALLED]) {
  (globalThis as WithFlag)[HANDLER_INSTALLED] = true;
  process.on('unhandledRejection', (reason) => {
    console.error('[client-test suppressed unhandledRejection]', reason);
  });
}
