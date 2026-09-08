import { describe, expect, it } from 'vitest';
import { monthBounds, todayInBrasilia } from './date';

describe('date utilities', () => {
  it('returns the Brasilia calendar day instead of the UTC day', () => {
    expect(todayInBrasilia(new Date('2026-09-08T01:30:00.000Z'))).toBe('2026-09-07');
  });

  it('returns calendar month bounds without UTC conversion', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});
