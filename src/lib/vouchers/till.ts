// The till's view of printed vouchers: what the last snapshot said is usable.
import { normalizeCode, voucherUsable, type VoucherCheck, type VoucherRule } from './rules';

export type TillVouchers = { rules: VoucherRule[]; codes: Record<string, number> };

/** A typed code checked against the snapshot, for a bill whose subtotal after the promo is `subtotal`. */
export function tillVoucher(vouchers: TillVouchers | undefined, input: string, subtotal: number, at: Date): { code: string | null; rule: VoucherRule | null; check: VoucherCheck } {
  const code = normalizeCode(input);
  if (!code) return { code: null, rule: null, check: { ok: false, reason: 'Format kode: MRC-XXXX-XXXX' } };
  const index = vouchers?.codes[code];
  const rule = index === undefined ? null : vouchers!.rules[index] ?? null;
  return { code, rule, check: voucherUsable(rule, subtotal, at) };
}

/** The snapshot's vouchers without one the till just used. */
export function withoutVoucher(vouchers: TillVouchers, code: string): TillVouchers {
  const codes = { ...vouchers.codes };
  delete codes[code];
  return { rules: vouchers.rules, codes };
}
