import { describe, expect, it } from 'vitest';
import { refundLineAmount, refundTax } from './refund';
import { tax10excl, tax10incl } from './fixtures.test-helpers';

describe('refundLineAmount', () => {
  it('partial refunds never drift from what was paid', () => {
    const l = { qty: 3, paid: 50000 };
    const first = refundLineAmount(l, 1, { qty: 0, amount: 0 });
    const second = refundLineAmount(l, 1, { qty: 1, amount: first });
    const last = refundLineAmount(l, 1, { qty: 2, amount: first + second });
    expect(first).toBe(16667);
    expect(first + second + last).toBe(50000);
  });

  it('refunding everything at once returns the full line', () => {
    expect(refundLineAmount({ qty: 2, paid: 50401 }, 2, { qty: 0, amount: 0 })).toBe(50401);
  });
});

describe('refundTax', () => {
  it('is the tax share of the refunded amount', () => {
    expect(refundTax(22000, tax10incl)).toBe(2000);
    expect(refundTax(22000, tax10excl)).toBe(2000);
  });
});
