const NOTES = [10_000, 20_000, 50_000, 100_000];

/** Likely amounts handed over for `total`: next multiple of each note, above the total. */
export function cashSuggestions(total: number): number[] {
  const amounts = NOTES.map(n => (Math.floor(total / n) + 1) * n);
  return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
}
