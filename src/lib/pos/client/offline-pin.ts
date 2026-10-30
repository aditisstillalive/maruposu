// Lets the tablet unlock without internet (e.g. the router is down at opening).
// After each successful online unlock we keep a slow hash of the master PIN for
// a week, so the tablet still opens the next morning if the router is down. The
// session it starts ends at 04:00 WIB like the server's. A 6-digit PIN can be
// brute-forced by someone holding the tablet; that is the accepted trade-off
// for working offline (see docs/PLAN.md).
import { getKV, setKV } from './db';
import { businessDayEnd } from '@/lib/device-session';

const ITERATIONS = 100_000;
const VERIFIER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const toHex = (buf: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

export async function saveOfflineVerifier(pin: string, pinVersion: number, now = new Date()): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setKV('offline_pin', { salt: toHex(salt), hash: await derive(pin, salt), pin_version: pinVersion, exp: now.getTime() + VERIFIER_TTL_MS });
}

export async function checkOfflinePin(pin: string, now = new Date()): Promise<boolean> {
  const v = await getKV('offline_pin');
  if (!v || now.getTime() >= v.exp) return false;
  return (await derive(pin, fromHex(v.salt))) === v.hash;
}

export async function startOfflineSession(now = new Date()): Promise<void> {
  await setKV('offline_session', businessDayEnd(now).getTime());
}

export async function offlineSessionValid(now = new Date()): Promise<boolean> {
  const until = await getKV('offline_session');
  return typeof until === 'number' && now.getTime() < until;
}

export async function endOfflineSession(): Promise<void> {
  await setKV('offline_session', 0);
}
