const ACTIVE_MS = 15_000;
const IDLE_MS = 60_000;
const HIDDEN_MS = 5 * 60_000;
const QUIET_AFTER_MS = 10 * 60_000;

/**
 * How long until the next background sync: every 15 s while the till is in use,
 * once a minute after 10 quiet minutes, every 5 minutes while the screen is
 * hidden. Local writes and coming back online always sync right away.
 */
export function pollDelay({ hidden, lastActivity, now }: { hidden: boolean; lastActivity: number; now: number }): number {
  if (hidden) return HIDDEN_MS;
  return now - lastActivity < QUIET_AFTER_MS ? ACTIVE_MS : IDLE_MS;
}
