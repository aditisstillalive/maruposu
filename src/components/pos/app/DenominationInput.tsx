'use client';

import { Minus, Plus } from 'lucide-react';
import { formatRupiah } from '@/lib/money';
import { countedTotal, DENOMINATIONS, type Denominations } from '@/lib/pos/shift';

/** Count of banknotes by value plus a coin total. */
export default function DenominationInput({ value, onChange }: { value: Denominations; onChange: (d: Denominations) => void }) {
  const setNote = (d: number, n: number) => onChange({ ...value, notes: { ...value.notes, [String(d)]: Math.max(0, Math.min(100_000, Math.floor(n) || 0)) } });
  const field = 'h-11 w-20 rounded-lg border bg-white text-center text-lg tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-xl border bg-white">
        {DENOMINATIONS.map(d => {
          const n = value.notes[String(d)] ?? 0;
          const label = formatRupiah(d);
          return (
            <li key={d} className="flex items-center gap-3 px-3 py-2">
              <span className="w-28 font-medium tabular-nums">{label}</span>
              <button type="button" aria-label={`Kurangi ${label}`} onClick={() => setNote(d, n - 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border"><Minus className="h-4 w-4" /></button>
              <input aria-label={`Jumlah lembar ${label}`} type="number" inputMode="numeric" min={0} value={n || ''} placeholder="0"
                onChange={e => setNote(d, e.target.valueAsNumber)} className={field} />
              <button type="button" aria-label={`Tambah ${label}`} onClick={() => setNote(d, n + 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border"><Plus className="h-4 w-4" /></button>
              <span className="ml-auto text-sm text-gray-500 tabular-nums">{n ? formatRupiah(d * n) : ''}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-3 px-3 py-2">
          <span className="w-28 font-medium">Koin</span>
          <input aria-label="Koin (total Rp)" type="number" inputMode="numeric" min={0} step={100} value={value.coins || ''} placeholder="Total Rp"
            onChange={e => onChange({ ...value, coins: Math.max(0, Math.floor(e.target.valueAsNumber) || 0) })} className={`${field} w-40`} />
        </li>
      </ul>
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm text-gray-500">Total uang di laci</span>
        <span data-testid="counted-total" className="text-3xl font-light tabular-nums">{formatRupiah(countedTotal(value))}</span>
      </div>
    </div>
  );
}
