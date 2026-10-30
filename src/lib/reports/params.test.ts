import { describe, expect, it } from 'vitest';
import { periodFromParams } from './params';

const today = '2026-10-30';

describe('periodFromParams', () => {
  it('defaults to today', () => {
    expect(periodFromParams({}, today)).toEqual({ preset: 'today', period: { from: today, to: today } });
  });

  it('reads a preset or a custom range', () => {
    expect(periodFromParams({ preset: '7d' }, today).period).toEqual({ from: '2026-10-24', to: today });
    expect(periodFromParams({ from: '2026-10-01', to: '2026-10-10' }, today)).toEqual({ preset: null, period: { from: '2026-10-01', to: '2026-10-10' } });
  });

  it('ignores junk and caps a range at 366 days', () => {
    expect(periodFromParams({ preset: 'forever', from: 'x' }, today).preset).toBe('today');
    expect(periodFromParams({ from: '2020-01-01', to: '2026-10-30' }, today).period).toEqual({ from: '2025-10-30', to: '2026-10-30' });
  });
});
