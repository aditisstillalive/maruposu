// When an untouched QR bill cancels itself. Shared by the server sweep and the till.
import type { OrderDoc } from './types';

/** Unpaid QR bills a cashier never touched are voided this long after the last customer submit. */
export const QR_EXPIRE_MS = 30 * 60 * 1000;

/** Milliseconds before an open, untouched QR bill cancels itself (0 when due), or null for any other bill. */
export function qrTimeLeft(o: Pick<OrderDoc, 'status' | 'source' | 'claimed_at' | 'qr_activity_at'>, now: number): number | null {
  if (o.status !== 'open' || o.source !== 'qr' || o.claimed_at || !o.qr_activity_at) return null;
  return Math.max(0, QR_EXPIRE_MS - (now - new Date(o.qr_activity_at).getTime()));
}
