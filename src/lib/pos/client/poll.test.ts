import { describe, expect, it } from 'vitest';
import { pollDelay } from './poll';

const now = 1_000_000_000;
const min = 60_000;

describe('pollDelay', () => {
  it('polls every 15 s while the till is in use', () => {
    expect(pollDelay({ hidden: false, lastActivity: now - 2 * min, now })).toBe(15_000);
  });
  it('slows to once a minute after 10 quiet minutes', () => {
    expect(pollDelay({ hidden: false, lastActivity: now - 11 * min, now })).toBe(60_000);
  });
  it('checks only every 5 minutes while the screen is hidden', () => {
    expect(pollDelay({ hidden: true, lastActivity: now, now })).toBe(5 * min);
  });
});
