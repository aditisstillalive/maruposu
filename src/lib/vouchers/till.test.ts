import { describe, expect, it } from 'vitest';
import { tillVoucher, withoutVoucher } from './till';
import type { VoucherRule } from './rules';

const rule: VoucherRule = { batch_name: 'Launch', kind: 'amount', value: 20000, max_discount: null, min_spend: 50000, expires_at: '2026-12-01T00:00:00.000Z', channels: 'both' };
const vouchers = { rules: [rule], codes: { 'MRC-AB23-CD45': 0, 'MRC-ZZZZ-9999': 0 } };
const at = new Date('2026-11-11T05:00:00.000Z');

describe('tillVoucher (offline, from the snapshot)', () => {
  it('finds a typed code however it was typed', () => {
    expect(tillVoucher(vouchers, 'ab23cd45', 60000, at)).toMatchObject({ code: 'MRC-AB23-CD45', rule, check: { ok: true, discount: 20000 } });
  });
  it('explains a badly typed code', () => {
    expect(tillVoucher(vouchers, 'AB23', 60000, at)).toMatchObject({ code: null, check: { ok: false, reason: 'Format kode: MRC-XXXX-XXXX' } });
  });
  it('refuses a code the till does not know (used, voided or not synced)', () => {
    expect(tillVoucher(vouchers, 'MRC-AAAA-2222', 60000, at).check).toEqual({ ok: false, reason: 'Kode tidak ditemukan atau sudah terpakai' });
    expect(tillVoucher(undefined, 'MRC-AB23-CD45', 60000, at).check.ok).toBe(false);
  });
  it('checks the minimum spend on the subtotal it is given (after the promo)', () => {
    expect(tillVoucher(vouchers, 'MRC-AB23-CD45', 45000, at).check).toEqual({ ok: false, reason: 'Min. belanja Rp 50.000' });
  });
});

describe('withoutVoucher', () => {
  it('drops a code the till just used so it cannot be taken twice while offline', () => {
    expect(withoutVoucher(vouchers, 'MRC-AB23-CD45')).toEqual({ rules: [rule], codes: { 'MRC-ZZZZ-9999': 0 } });
  });
});
