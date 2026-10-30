import { describe, expect, it } from 'vitest';
import { consumption, costOf, formatStock, isLow, toBaseQty, unitPriceLabel, weightedAverage, type Recipe } from './inventory';

const recipe: Recipe = {
  product: { kopi: [{ ingredient_id: 'kopi-bubuk', qty: 18 }, { ingredient_id: 'susu', qty: 150 }] },
  option: { ice: [{ ingredient_id: 'es', qty: 150 }], shot: [{ ingredient_id: 'kopi-bubuk', qty: 9 }] },
};

describe('consumption', () => {
  it('adds the product recipe and each chosen option, times the quantity', () => {
    const used = consumption([{ product_id: 'kopi', options: [{ option_id: 'ice' }, { option_id: 'shot' }], qty: 2 }], recipe);
    expect(Object.fromEntries(used)).toEqual({ 'kopi-bubuk': 54, susu: 300, es: 300 });
  });

  it('sums across lines and ignores products and options without a recipe', () => {
    const used = consumption([
      { product_id: 'kopi', options: [], qty: 1 },
      { product_id: 'croissant', options: [{ option_id: 'hot' }], qty: 3 },
      { product_id: 'kopi', options: [{ option_id: 'ice' }], qty: 1 },
    ], recipe);
    expect(Object.fromEntries(used)).toEqual({ 'kopi-bubuk': 36, susu: 300, es: 150 });
  });
});

describe('weightedAverage', () => {
  it('blends the old stock and the new purchase', () => {
    expect(weightedAverage(100, 20_000, 100, 3_000)).toBe(25_000);
  });

  it('ignores negative stock: the new price wins', () => {
    expect(weightedAverage(-50, 20_000, 100, 3_000)).toBe(30_000);
  });

  it('stock without a price (e.g. counted in at go-live) takes the first purchase price', () => {
    // 10 000 ml counted by opname at avg 0, then 12 000 ml bought for Rp 216 000 (Rp 18/ml)
    expect(weightedAverage(10_000, 0, 12_000, 216_000)).toBe(18_000);
  });

  it('keeps the old average when nothing arrives', () => {
    expect(weightedAverage(100, 20_000, 0, 0)).toBe(20_000);
  });
});

describe('costOf', () => {
  it('values quantities at the average cost, rounded to rupiah', () => {
    expect(costOf(new Map([['kopi-bubuk', 54], ['susu', 3]]), { 'kopi-bubuk': 250_000, susu: 15_500 })).toBe(13_547);
  });

  it('treats unknown ingredients as free', () => {
    expect(costOf(new Map([['x', 10]]), {})).toBe(0);
  });
});

describe('toBaseQty', () => {
  it('converts purchase units by their size', () => {
    expect(toBaseQty(2, 'purchase', 12000)).toBe(24000);
    expect(toBaseQty(0.5, 'purchase', 1000)).toBe(500);
    expect(toBaseQty(250, 'base', 12000)).toBe(250);
  });
});

describe('isLow', () => {
  it('is low at or below the minimum, never without one', () => {
    expect(isLow(5, 10)).toBe(true);
    expect(isLow(10, 10)).toBe(true);
    expect(isLow(11, 10)).toBe(false);
    expect(isLow(-5, null)).toBe(false);
  });
});

describe('formatStock', () => {
  it('shows the unit and, with a purchase unit, the breakdown', () => {
    expect(formatStock(24000, { unit: 'ml', purchase_unit: 'karton', purchase_size: 12000 })).toBe('24.000 ml (2 karton)');
    expect(formatStock(1250, { unit: 'ml', purchase_unit: 'karton', purchase_size: 1000 })).toBe('1.250 ml (1 karton + 250 ml)');
    expect(formatStock(300, { unit: 'g', purchase_unit: null, purchase_size: null })).toBe('300 g');
  });

  it('shows negative stock plainly', () => {
    expect(formatStock(-50, { unit: 'ml', purchase_unit: 'karton', purchase_size: 1000 })).toBe('-50 ml');
  });
});

describe('unitPriceLabel', () => {
  it('prices per purchase unit when there is one, else per base unit', () => {
    expect(unitPriceLabel(15_000, { unit: 'ml', purchase_unit: 'karton', purchase_size: 12000 })).toBe('Rp 180.000/karton');
    expect(unitPriceLabel(250_000, { unit: 'g', purchase_unit: null, purchase_size: null })).toBe('Rp 250/g');
    expect(unitPriceLabel(500, { unit: 'g', purchase_unit: null, purchase_size: null })).toBe('Rp 0,5/g');
  });
});
