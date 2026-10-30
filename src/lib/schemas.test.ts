import { describe, expect, it } from 'vitest';
import { adminCloseSchema, masterPinSchema, optionGroupSchema, passwordChangeSchema, productSchema, promoSchema, settingSchema } from './schemas';

describe('masterPinSchema', () => {
  it('accepts matching six-digit PINs', () => {
    expect(masterPinSchema.safeParse({ pin: '246810', confirm: '246810' }).success).toBe(true);
  });

  it('rejects a mismatch', () => {
    expect(masterPinSchema.safeParse({ pin: '246810', confirm: '246811' }).success).toBe(false);
  });

  it('rejects trivially guessable PINs', () => {
    for (const pin of ['000000', '111111', '123456', '654321']) {
      expect(masterPinSchema.safeParse({ pin, confirm: pin }).success).toBe(false);
    }
  });
});

describe('settingSchema', () => {
  it('takes the tax rate as a percentage and stores basis points', () => {
    const parsed = settingSchema.parse({ cafe_name: ' Maraca ', tax_name: 'PB1', tax_rate: 10, tax_inclusive: true });
    expect(parsed).toMatchObject({ cafe_name: 'Maraca', tax_rate_bp: 1000, tax_inclusive: true, receipt_footer: null });
  });

  it('keeps two decimals of a percentage', () => {
    expect(settingSchema.parse({ cafe_name: 'M', tax_name: 'PPN', tax_rate: 11.5, tax_inclusive: false }).tax_rate_bp).toBe(1150);
  });

  it('rejects rates outside 0-100', () => {
    expect(settingSchema.safeParse({ cafe_name: 'M', tax_name: 'PB1', tax_rate: 101, tax_inclusive: true }).success).toBe(false);
    expect(settingSchema.safeParse({ cafe_name: 'M', tax_name: 'PB1', tax_rate: -1, tax_inclusive: true }).success).toBe(false);
  });
});

describe('productSchema', () => {
  const base = { name: 'Kopi Susu', category_id: 'c1', price: 25000 };

  it('accepts a whole-rupiah price', () => {
    expect(productSchema.parse(base)).toMatchObject({ name: 'Kopi Susu', price: 25000, option_group_ids: [] });
  });

  it('rejects fractional or negative prices', () => {
    expect(productSchema.safeParse({ ...base, price: 2500.5 }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });
});

describe('optionGroupSchema', () => {
  const option = { name: 'Ice', price_delta: 0 };

  it('forces a variant group to exactly one choice', () => {
    const parsed = optionGroupSchema.parse({ name: 'Suhu', kind: 'variant', required: true, max_select: 3, options: [option] });
    expect(parsed).toMatchObject({ min_select: 1, max_select: 1 });
  });

  it('lets an add-on group pick up to max_select, none required', () => {
    const parsed = optionGroupSchema.parse({ name: 'Topping', kind: 'addon', required: false, max_select: 3, options: [option] });
    expect(parsed).toMatchObject({ min_select: 0, max_select: 3 });
  });

  it('needs at least one option', () => {
    expect(optionGroupSchema.safeParse({ name: 'Suhu', kind: 'variant', required: true, options: [] }).success).toBe(false);
  });

  it('allows at most one default in a variant group', () => {
    const options = [{ ...option, is_default: true }, { name: 'Hot', price_delta: 0, is_default: true }];
    expect(optionGroupSchema.safeParse({ name: 'Suhu', kind: 'variant', required: true, options }).success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  const ok = { current: 'old-password-1', password: 'new-password-123', confirm: 'new-password-123' };

  it('accepts a matching new password of 8+ characters', () => {
    expect(passwordChangeSchema.safeParse({ ...ok, password: 'eightchr', confirm: 'eightchr' }).success).toBe(true);
    expect(passwordChangeSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects a short new password', () => {
    expect(passwordChangeSchema.safeParse({ ...ok, password: 'sevench', confirm: 'sevench' }).success).toBe(false);
  });

  it('rejects a mismatched confirmation', () => {
    expect(passwordChangeSchema.safeParse({ ...ok, confirm: 'new-password-124' }).success).toBe(false);
  });

  it('rejects reusing the current password', () => {
    expect(passwordChangeSchema.safeParse({ current: ok.password, password: ok.password, confirm: ok.password }).success).toBe(false);
  });

  it('requires the current password', () => {
    expect(passwordChangeSchema.safeParse({ ...ok, current: '' }).success).toBe(false);
  });
});

describe('promoSchema', () => {
  const base = { name: 'Diskon 10%', kind: 'percent', value: 10, scope: 'bill' };

  it('stores a percentage as basis points', () => {
    expect(promoSchema.parse(base)).toMatchObject({ value: 1000, code: null, min_spend: 0, days: [], quota: null });
  });

  it('keeps a rupiah amount as is', () => {
    expect(promoSchema.parse({ ...base, kind: 'amount', value: 5000 }).value).toBe(5000);
  });

  it('normalises the coupon code', () => {
    expect(promoSchema.parse({ ...base, code: ' maraca10 ' }).code).toBe('MARACA10');
    expect(promoSchema.parse({ ...base, code: '  ' }).code).toBeNull();
  });

  it('rejects a percentage above 100', () => {
    expect(promoSchema.safeParse({ ...base, value: 150 }).success).toBe(false);
  });

  it('needs targets for product and category promos', () => {
    expect(promoSchema.safeParse({ ...base, scope: 'product', product_ids: [] }).success).toBe(false);
    expect(promoSchema.safeParse({ ...base, scope: 'category', category_ids: ['c1'] }).success).toBe(true);
  });

  it('treats empty time fields from the form as all-day', () => {
    expect(promoSchema.parse({ ...base, time_start: '', time_end: '' })).toMatchObject({ time_start: null, time_end: null });
  });

  it('needs both ends of a happy-hour window', () => {
    expect(promoSchema.safeParse({ ...base, time_start: '14:00' }).success).toBe(false);
    expect(promoSchema.safeParse({ ...base, time_start: '14:00', time_end: '16:00' }).success).toBe(true);
    expect(promoSchema.safeParse({ ...base, time_start: '16:00', time_end: '14:00' }).success).toBe(false);
  });

  it('needs the end date after the start date', () => {
    const range = { starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z' };
    expect(promoSchema.safeParse({ ...base, ...range }).success).toBe(false);
  });
});

describe('adminCloseSchema', () => {
  const denominations = { notes: { '100000': 2 }, coins: 500 };

  it('needs a reason', () => {
    expect(adminCloseSchema.safeParse({ denominations, reason: '  ' }).success).toBe(false);
    expect(adminCloseSchema.parse({ denominations, reason: ' Tablet rusak ' }).reason).toBe('Tablet rusak');
  });

  it('only takes whole, non-negative note counts', () => {
    expect(adminCloseSchema.safeParse({ denominations: { notes: { '100000': -1 }, coins: 0 }, reason: 'x' }).success).toBe(false);
    expect(adminCloseSchema.safeParse({ denominations: { notes: { '100000': 1.5 }, coins: 0 }, reason: 'x' }).success).toBe(false);
  });
});
