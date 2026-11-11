import { describe, expect, it } from 'vitest';
import { normalizeCode, voucherDiscount, voucherUsable, type VoucherRule } from './rules';

const amount = (value: number, min_spend = 0): VoucherRule => ({ kind: 'amount', value, max_discount: null, min_spend, expires_at: '2026-12-01T00:00:00.000Z', channels: 'both', batch_name: 'Launch' });
const percent = (value: number, max_discount: number | null, min_spend = 0): VoucherRule => ({ ...amount(0, min_spend), kind: 'percent', value, max_discount });

describe('voucherDiscount (same as tokoiboek)', () => {
  it('never takes more than the bill', () => {
    expect(voucherDiscount(amount(20000), 15000)).toBe(15000);
  });
  it('caps a percentage', () => {
    expect(voucherDiscount(percent(1000, 25000), 400000)).toBe(25000);
    expect(voucherDiscount(percent(1000, 25000), 100000)).toBe(10000);
  });
  it('is 0 below the minimum spend or on an empty bill', () => {
    expect(voucherDiscount(amount(20000, 50000), 49999)).toBe(0);
    expect(voucherDiscount(amount(20000), 0)).toBe(0);
  });
  it('rounds a percentage to whole rupiah', () => {
    expect(voucherDiscount(percent(1500, null), 33333)).toBe(5000);
  });
});

describe('normalizeCode', () => {
  it('uppercases and accepts the code with or without dashes and prefix', () => {
    expect(normalizeCode('mrc-ab23-cd45')).toBe('MRC-AB23-CD45');
    expect(normalizeCode('AB23CD45')).toBe('MRC-AB23-CD45');
    expect(normalizeCode(' ab23 cd45 ')).toBe('MRC-AB23-CD45');
    expect(normalizeCode('MRCAB23CD45')).toBe('MRC-AB23-CD45');
  });
  it('refuses anything that is not 8 characters after the prefix', () => {
    expect(normalizeCode('AB23CD4')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
});

describe('voucherUsable (offline check on the till)', () => {
  const at = new Date('2026-11-11T05:00:00.000Z');
  it('gives the discount on the subtotal after the promo', () => {
    expect(voucherUsable(percent(1000, null, 50000), 60000, at)).toEqual({ ok: true, discount: 6000 });
  });
  it('checks the minimum spend after the promo', () => {
    expect(voucherUsable(amount(10000, 50000), 45000, at)).toEqual({ ok: false, reason: 'Min. belanja Rp 50.000' });
  });
  it('refuses an expired code at payment time (expires_at is the first instant it no longer works)', () => {
    expect(voucherUsable({ ...amount(10000), expires_at: at.toISOString() }, 60000, at)).toEqual({ ok: false, reason: 'Voucher sudah kedaluwarsa' });
  });
  it('refuses a web-only code', () => {
    expect(voucherUsable({ ...amount(10000), channels: 'web' }, 60000, at)).toEqual({ ok: false, reason: 'Voucher hanya untuk toko online' });
  });
  it('refuses an unknown or already used code', () => {
    expect(voucherUsable(null, 60000, at)).toEqual({ ok: false, reason: 'Kode tidak ditemukan atau sudah terpakai' });
  });
});
