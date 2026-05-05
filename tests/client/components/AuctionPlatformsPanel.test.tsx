// tests/client/components/AuctionPlatformsPanel.test.tsx
// Phase 5 Area 7 — read-only panel renders the AF360 platform card and
// reveals the field mapping when expanded.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuctionPlatformsPanel } from '@/components/settings/AuctionPlatformsPanel';
import { renderWithProviders } from '../../helpers/render-with-providers';

describe('AuctionPlatformsPanel', () => {
  it('renders the platform name + description + Default pill', () => {
    renderWithProviders(<AuctionPlatformsPanel />);
    expect(screen.getByText('AF360 / HiBid')).toBeInTheDocument();
    expect(screen.getByText(/Auction Flex 360 → HiBid.com/)).toBeInTheDocument();
    expect(screen.getByText('Default platform')).toBeInTheDocument();
  });

  it('field mapping is collapsed by default', () => {
    renderWithProviders(<AuctionPlatformsPanel />);
    expect(screen.queryByText('LotNumber')).not.toBeInTheDocument();
  });

  it('clicking the toggle reveals all 7 csv headers in the mapping table', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuctionPlatformsPanel />);

    await user.click(screen.getByRole('button', { name: /Show field mapping/i }));

    const expectedHeaders = [
      'LotNumber',
      'Title',
      'Description',
      'Quantity',
      'SellerCode',
      'StartBid',
      'Shippable',
    ];
    for (const h of expectedHeaders) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it('renders no add / edit affordance', () => {
    const { container } = renderWithProviders(<AuctionPlatformsPanel />);
    // No "Add platform" or "Edit" button should be present
    const buttons = container.querySelectorAll('button');
    for (const b of buttons) {
      const text = b.textContent ?? '';
      expect(text).not.toMatch(/^Add|^Edit|^New platform/i);
    }
  });
});
