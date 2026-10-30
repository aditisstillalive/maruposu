import { describe, expect, it } from 'vitest';
import { defaultSelection, makeLine, mergeLine, selectionError, selectionFromLine, setQty } from './cart';
import type { MenuProduct } from './types';

const kopi: MenuProduct = {
  id: 'kopi', category_id: 'cat-kopi', name: 'Es Kopi Susu', price: 22000, photo_url: null, is_sold_out: false,
  groups: [
    { id: 'suhu', name: 'Suhu', kind: 'variant', required: true, min_select: 1, max_select: 1,
      options: [{ id: 'ice', name: 'Ice', price_delta: 0, is_default: true }, { id: 'hot', name: 'Hot', price_delta: 0, is_default: false }] },
    { id: 'extra', name: 'Extra', kind: 'addon', required: false, min_select: 0, max_select: 2,
      options: [{ id: 'shot', name: 'Extra shot', price_delta: 6000, is_default: false }, { id: 'oat', name: 'Oat milk', price_delta: 8000, is_default: false }, { id: 'jelly', name: 'Jelly', price_delta: 4000, is_default: false }] },
  ],
};

describe('selection', () => {
  it('starts from the default variants', () => {
    expect(defaultSelection(kopi)).toEqual({ suhu: ['ice'], extra: [] });
  });

  it('requires a variant and caps add-ons', () => {
    expect(selectionError(kopi, { suhu: [], extra: [] })).toBe('Pilih Suhu');
    expect(selectionError(kopi, { suhu: ['ice'], extra: ['shot', 'oat', 'jelly'] })).toBe('Extra maksimal 2');
    expect(selectionError(kopi, { suhu: ['hot'], extra: ['shot'] })).toBeNull();
  });

  it('turns a selection into priced line options in menu order', () => {
    const line = makeLine(kopi, { suhu: ['hot'], extra: ['oat', 'shot'] }, 2, ' tanpa gula ');
    expect(line.options.map(o => [o.group_name, o.name, o.price_delta])).toEqual([['Suhu', 'Hot', 0], ['Extra', 'Extra shot', 6000], ['Extra', 'Oat milk', 8000]]);
    expect(line).toMatchObject({ product_id: 'kopi', category_id: 'cat-kopi', base_price: 22000, qty: 2, note: 'tanpa gula', discount: 0, paid: 0 });
  });

  it('reads a selection back from a line for editing', () => {
    const line = makeLine(kopi, { suhu: ['hot'], extra: ['shot'] }, 1, '');
    expect(selectionFromLine(kopi, line)).toEqual({ suhu: ['hot'], extra: ['shot'] });
    expect(line.note).toBeNull();
  });
});

describe('mergeLine', () => {
  it('adds to an identical line instead of a new one', () => {
    const a = makeLine(kopi, { suhu: ['ice'], extra: [] }, 1, '');
    const b = makeLine(kopi, { suhu: ['ice'], extra: [] }, 2, '');
    const items = mergeLine(mergeLine([], a), b);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
  });

  it('keeps lines apart when options or notes differ', () => {
    const plain = makeLine(kopi, { suhu: ['ice'], extra: [] }, 1, '');
    const hot = makeLine(kopi, { suhu: ['hot'], extra: [] }, 1, '');
    const noted = makeLine(kopi, { suhu: ['ice'], extra: [] }, 1, 'less ice');
    expect(mergeLine(mergeLine(mergeLine([], plain), hot), noted)).toHaveLength(3);
  });
});

describe('setQty', () => {
  it('changes the quantity and drops the line at zero', () => {
    const line = makeLine(kopi, { suhu: ['ice'], extra: [] }, 2, '');
    expect(setQty([line], line.id, 3)[0].qty).toBe(3);
    expect(setQty([line], line.id, 0)).toEqual([]);
  });
});
