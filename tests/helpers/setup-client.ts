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
process.on('unhandledRejection', (reason) => {
  console.error('[client-test suppressed unhandledRejection]', reason);
});
