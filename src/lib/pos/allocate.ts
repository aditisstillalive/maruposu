/**
 * Splits `amount` across keys in proportion to `weights` (largest remainder),
 * so the parts are whole rupiah and always add up to exactly `amount`.
 */
export function allocate(amount: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights);
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
  const out: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]));
  if (amount === 0 || totalWeight <= 0) return out;

  const shares = keys.map(k => {
    const exact = (amount * weights[k]) / totalWeight;
    return { k, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = amount - shares.reduce((s, x) => s + x.floor, 0);
  for (const x of shares) out[x.k] = x.floor;
  // Stable: ties go to the earlier key
  for (const x of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    out[x.k] += 1;
    left -= 1;
  }
  return out;
}
