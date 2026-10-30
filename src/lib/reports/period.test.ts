import { describe, expect, it } from 'vitest';
import { daysIn, previousPeriod, resolvePeriod } from './period';

describe('resolvePeriod', () => {
  const today = '2026-10-30';
  it('resolves the presets in business days', () => {
    expect(resolvePeriod('today', today)).toEqual({ from: today, to: today });
    expect(resolvePeriod('yesterday', today)).toEqual({ from: '2026-10-29', to: '2026-10-29' });
    expect(resolvePeriod('7d', today)).toEqual({ from: '2026-10-24', to: today });
    expect(resolvePeriod('30d', today)).toEqual({ from: '2026-10-01', to: today });
    expect(resolvePeriod('this_month', today)).toEqual({ from: '2026-10-01', to: today });
    expect(resolvePeriod('last_month', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('takes a custom range, putting the dates in order', () => {
    expect(resolvePeriod({ from: '2026-10-10', to: '2026-10-01' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
  });
});

describe('previousPeriod', () => {
  it('is the same length, right before', () => {
    expect(previousPeriod({ from: '2026-10-24', to: '2026-10-30' })).toEqual({ from: '2026-10-17', to: '2026-10-23' });
    expect(previousPeriod({ from: '2026-10-30', to: '2026-10-30' })).toEqual({ from: '2026-10-29', to: '2026-10-29' });
  });
});

describe('daysIn', () => {
  it('lists every day', () => {
    expect(daysIn({ from: '2026-10-30', to: '2026-11-01' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
