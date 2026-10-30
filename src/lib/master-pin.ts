import bcrypt from 'bcrypt';

// The 6-digit master PIN only has a million combinations, so a slow hash alone
// isn't enough: failed attempts are throttled per client IP (PinThrottle table).
export const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export function hashMasterPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export function verifyMasterPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

type ThrottleState = { failures: number; locked_until: Date | null };

export function isLocked(state: ThrottleState | null, now: Date): boolean {
  return !!state?.locked_until && state.locked_until > now;
}

/** State after one more failed attempt. */
export function nextThrottle(state: ThrottleState, now: Date): ThrottleState {
  const lockExpired = !!state.locked_until && state.locked_until <= now;
  const failures = (lockExpired ? 0 : state.failures) + 1;
  return {
    failures,
    locked_until: failures >= PIN_MAX_FAILURES ? new Date(now.getTime() + PIN_LOCK_MS) : null,
  };
}
