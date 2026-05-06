// tests/lib/ai-compose-status.test.ts
import { describe, it, expect } from 'vitest';
import { determineFieldStatus, mapStatus, buildErrorString } from '../../src/lib/ai/compose';

describe('determineFieldStatus', () => {
  it('all fields succeed when AI returns everything', () => {
    expect(determineFieldStatus({
      brand: 'Stanley', briefDescription: 'Wrench Set', descriptionBody: 'Used wrench set.', price: 120,
    })).toEqual({ title: 'success', description: 'success', price: 'success' });
  });

  it('title fails when brand is null (price + description still ok)', () => {
    expect(determineFieldStatus({
      brand: null, briefDescription: 'X', descriptionBody: 'Body', price: 5,
    })).toEqual({ title: 'failure', description: 'success', price: 'success' });
  });

  it('title fails when briefDescription is null', () => {
    const r = determineFieldStatus({
      brand: 'Stanley', briefDescription: null, descriptionBody: 'Body', price: 5,
    });
    expect(r.title).toBe('failure');
  });

  it('title fails when price is null (cascade — title needs price)', () => {
    expect(determineFieldStatus({
      brand: 'Stanley', briefDescription: 'X', descriptionBody: 'Body', price: null,
    })).toEqual({ title: 'failure', description: 'success', price: 'failure' });
  });

  it('description fails when body is null', () => {
    const r = determineFieldStatus({
      brand: 'Stanley', briefDescription: 'X', descriptionBody: null, price: 5,
    });
    expect(r.description).toBe('failure');
  });

  it('description fails when body is whitespace-only', () => {
    const r = determineFieldStatus({
      brand: 'Stanley', briefDescription: 'X', descriptionBody: '   ', price: 5,
    });
    expect(r.description).toBe('failure');
  });

  it('all fail when AI returns nothing', () => {
    expect(determineFieldStatus({
      brand: null, briefDescription: null, descriptionBody: null, price: null,
    })).toEqual({ title: 'failure', description: 'failure', price: 'failure' });
  });
});

describe('mapStatus', () => {
  it('all success → success', () => {
    expect(mapStatus({ title: 'success', description: 'success', price: 'success' })).toBe('success');
  });
  it('all failure → failure', () => {
    expect(mapStatus({ title: 'failure', description: 'failure', price: 'failure' })).toBe('failure');
  });
  it('mixed → partial (any 1 success)', () => {
    expect(mapStatus({ title: 'failure', description: 'success', price: 'failure' })).toBe('partial');
  });
  it('mixed → partial (any 2 success)', () => {
    expect(mapStatus({ title: 'success', description: 'success', price: 'failure' })).toBe('partial');
  });
});

describe('buildErrorString', () => {
  it('returns null when all succeeded', () => {
    expect(buildErrorString({ title: 'success', description: 'success', price: 'success' })).toBeNull();
  });
  it('lists single failed field', () => {
    expect(buildErrorString({ title: 'success', description: 'success', price: 'failure' })).toBe('price');
  });
  it('lists multiple failed fields comma-separated', () => {
    expect(buildErrorString({ title: 'failure', description: 'success', price: 'failure' })).toBe('title, price');
  });
});
