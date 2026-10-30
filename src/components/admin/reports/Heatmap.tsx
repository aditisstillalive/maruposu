'use client';

import { useState } from 'react';
import { formatRupiah } from '@/lib/money';
import { DAY_NAMES } from '@/lib/reports/peak';

type Cell = { transactions: number; revenue: number };

// Sequential blue ramp (dataviz reference steps 100–650); white text from step 400 up
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#104281'];
const EMPTY = '#f3f3f1';
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Day × hour grid; darker = more. Counts are printed in the cells, details on hover/focus. */
export default function Heatmap({ grid, hours, unit }: { grid: Cell[][]; hours: number[]; unit: string }) {
  const max = Math.max(0, ...grid.flatMap(r => hours.map(h => r[h].transactions)));
  const step = (n: number) => (n === 0 || max === 0 ? -1 : Math.min(RAMP.length - 1, Math.ceil((n / max) * RAMP.length) - 1));
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const hc = hover && grid[hover.d][hover.h];

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="border-separate text-xs" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {hours.map(h => <th key={h} scope="col" className="w-9 pb-1 text-center font-normal tabular-nums text-gray-500">{String(h).padStart(2, '0')}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={d}>
                <th scope="row" className="pr-2 text-left font-normal text-gray-600">{DAY_NAMES[d]}</th>
                {hours.map(h => {
                  const c = row[h];
                  const s = step(c.transactions);
                  const label = `${DAY_NAMES[d]} ${hh(h)}–${hh((h + 1) % 24)}: ${c.transactions} ${unit}`;
                  return (
                    <td
                      key={h}
                      data-testid={`cell-${d}-${h}`}
                      tabIndex={c.transactions ? 0 : -1}
                      aria-label={label}
                      onPointerEnter={() => setHover({ d, h })}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover({ d, h })}
                      onBlur={() => setHover(null)}
                      className={`h-8 w-9 rounded text-center font-medium tabular-nums outline-none ${hover?.d === d && hover.h === h ? 'ring-2 ring-black/60' : ''}`}
                      style={{ background: s < 0 ? EMPTY : RAMP[s], color: s >= 3 ? '#ffffff' : '#171717' }}
                    >
                      {c.transactions || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hover && hc && (
        <div role="tooltip" className="pointer-events-none absolute right-0 top-0 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
          <p className="text-gray-500">{DAY_NAMES[hover.d]} {hh(hover.h)}–{hh((hover.h + 1) % 24)}</p>
          <p><span className="font-semibold tabular-nums">{hc.transactions}</span> <span className="text-gray-500">{unit}</span></p>
          <p><span className="font-semibold tabular-nums">{formatRupiah(hc.revenue)}</span> <span className="text-gray-500">penjualan</span></p>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500" aria-hidden>
        <span>Sepi</span>
        {RAMP.map(c => <span key={c} className="h-3 w-6 rounded-sm" style={{ background: c }} />)}
        <span>Ramai{max > 0 && ` (${max} ${unit})`}</span>
      </div>
    </div>
  );
}
