import type { CartLine } from './types';

export function unitPrice(line: Pick<CartLine, 'base_price' | 'options'>): number {
  return line.base_price + line.options.reduce((s, o) => s + o.price_delta, 0);
}

export function lineTotal(line: Pick<CartLine, 'base_price' | 'options' | 'qty'>): number {
  return unitPrice(line) * line.qty;
}
