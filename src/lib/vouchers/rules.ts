// Printed vouchers from tokoiboek (the source of truth). The math and the code
// format are the same as tokoiboek's src/lib/voucher-rules.ts, so the till and
// the web shop always agree. Used on the till (offline) and on the server.
import { formatRupiah } from '@/lib/money';

export const CODE_PREFIX = 'MRC';

/** What decides a voucher's discount and where/when it works (shared by every code of a batch). */
export type VoucherRule = {
  batch_name: string;
  kind: 'amount' | 'percent';
  /** rupiah, or basis points (1000 = 10%) */
  value: number;
  max_discount: number | null;
  min_spend: number;
  /** ISO: the first instant it no longer works */
  expires_at: string;
  channels: 'web' | 'cafe' | 'both';
};

/** "mrc ab23-cd45", "AB23CD45" → "MRC-AB23-CD45"; null when it can't be a code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = raw.startsWith(CODE_PREFIX) ? raw.slice(CODE_PREFIX.length) : raw;
  if (body.length !== 8) return null;
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Rupiah off a bill of `subtotal`: 0 below the minimum spend, never more than the bill. */
export function voucherDiscount(rule: Pick<VoucherRule, 'kind' | 'value' | 'max_discount' | 'min_spend'>, subtotal: number): number {
  if (subtotal <= 0 || subtotal < rule.min_spend) return 0;
  let discount = rule.kind === 'percent' ? Math.round((subtotal * rule.value) / 10000) : rule.value;
  if (rule.max_discount !== null) discount = Math.min(discount, rule.max_discount);
  return Math.max(0, Math.min(discount, subtotal));
}

export const worksAtCafe = (channels: string) => channels === 'cafe' || channels === 'both';

export type VoucherCheck = { ok: true; discount: number } | { ok: false; reason: string };

/**
 * Whether the till can take this voucher on a bill whose subtotal after the
 * promo is `subtotal`, at `at`. `rule` is null when the code isn't among the
 * usable ones (unknown, used, reserved by a web order or voided).
 */
export function voucherUsable(rule: VoucherRule | null, subtotal: number, at: Date): VoucherCheck {
  if (!rule) return { ok: false, reason: 'Kode tidak ditemukan atau sudah terpakai' };
  if (!worksAtCafe(rule.channels)) return { ok: false, reason: 'Voucher hanya untuk toko online' };
  if (at.getTime() >= new Date(rule.expires_at).getTime()) return { ok: false, reason: 'Voucher sudah kedaluwarsa' };
  if (subtotal < rule.min_spend) return { ok: false, reason: `Min. belanja ${formatRupiah(rule.min_spend)}` };
  const discount = voucherDiscount(rule, subtotal);
  return discount > 0 ? { ok: true, discount } : { ok: false, reason: 'Bill masih kosong' };
}
