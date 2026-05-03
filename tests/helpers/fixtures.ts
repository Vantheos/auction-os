// tests/helpers/fixtures.ts
// Shared fixture builders for client tests. Keep minimal — only DTOs that
// recur across multiple test files belong here.

import type { LotDTO, LotPhotoDTO } from '@shared/types';

export function makeLot(overrides: Partial<LotDTO> = {}): LotDTO {
  return {
    id: 'lot-1',
    jobId: 'job-1',
    customerId: 'cust-1',
    customerName: 'Acme Co',
    jobNumber: '2026-04-Test-001',
    lotNumber: 1,
    quantity: 1,
    title: null,
    description: null,
    price: null,
    condition: 'used',
    ref1: null,
    ref2: null,
    specialNotesCategory: 'None',
    specialNotesText: null,
    untested: false,
    state: 'unassigned',
    source: 'cataloging',
    lastAiRunStatus: null,
    lastAiRunError: null,
    intakeOperatorId: 'user-1',
    intakeTimestamp: '2026-05-01T12:00:00.000Z',
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-01T12:00:00.000Z',
    coverSignedUrl: null,
    ...overrides,
  };
}

export function makePhoto(overrides: Partial<LotPhotoDTO> = {}): LotPhotoDTO {
  return {
    id: 'photo-1',
    lotId: 'lot-1',
    storagePath: 'lots/lot-1/photo-1.jpg',
    displayOrder: 1,
    status: 'uploaded',
    capturedAt: '2026-05-01T12:00:00.000Z',
    capturedBy: 'user-1',
    signedUrl: 'https://test.local/photo-1.jpg',
    ...overrides,
  };
}
