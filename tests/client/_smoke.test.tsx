// tests/client/_smoke.test.tsx
// Confirms the happy-dom env switch fires for tests/client/** and that the
// provider helper renders without exploding. Not a real test — guards the
// infrastructure itself.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render-with-providers';

describe('client test infra smoke', () => {
  it('renders through providers under happy-dom', () => {
    renderWithProviders(<div data-testid="hi">hi</div>);
    expect(screen.getByTestId('hi')).toHaveTextContent('hi');
  });

  it('exposes window from happy-dom', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
