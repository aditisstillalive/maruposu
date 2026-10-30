import { describe, expect, it } from 'vitest';
import { masterPinSchema, optionGroupSchema, productSchema, settingSchema } from './schemas';

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
