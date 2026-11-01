'use client';

import { Delete } from 'lucide-react';
import { formatRupiah } from '@/lib/money';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'];
const MAX = 100_000_000;

type Value = { value: number | null; onChange: (v: number | null) => void };

/** The amount typed so far. */
export function NumPadDisplay({ value, compact }: { value: number | null; compact?: boolean }) {
  return (
    <div data-testid="numpad-value" className={`rounded-xl border bg-white px-4 text-right font-light tabular-nums ${compact ? 'py-2 text-2xl' : 'py-3 text-3xl'}`}>
      {value === null ? <span className="text-gray-300">Rp 0</span> : formatRupiah(value)}
    </div>
  );
}

/** Suggested amounts (e.g. the next banknotes). */
export function NumPadQuick({ onChange, quick, quickLabel = formatRupiah, columns = 4 }: Pick<Value, 'onChange'> & { quick: number[]; quickLabel?: (v: number) => string; columns?: 2 | 4 }) {
  if (!quick.length) return null;
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
      {quick.map(q => (
        <button key={q} type="button" onClick={() => onChange(q)}
          className="h-11 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 active:bg-brand-soft">
          {quickLabel(q)}
        </button>
      ))}
    </div>
  );
}

/** Digits, 000 and delete. */
export function NumPadKeys({ value, onChange, compact }: Value & { compact?: boolean }) {
  const press = (key: string) => {
    if (key === 'del') {
      const s = String(value ?? '').slice(0, -1);
      onChange(s ? Number(s) : null);
      return;
    }
    const next = Number(`${value ?? ''}${key}`);
    if (next <= MAX) onChange(next);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map(k => (
        <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Hapus' : k}
          className={`flex items-center justify-center rounded-xl border bg-white text-xl font-light hover:bg-gray-50 active:bg-brand-soft ${compact ? 'h-12' : 'h-14'}`}>
          {k === 'del' ? <Delete className="h-5 w-5" /> : k}
        </button>
      ))}
    </div>
  );
}

/** Touch keypad for rupiah amounts, stacked. `null` means nothing entered yet. */
export default function NumPad({ value, onChange, quick = [], quickLabel }: Value & { quick?: number[]; quickLabel?: (v: number) => string }) {
  return (
    <div className="space-y-3">
      <NumPadDisplay value={value} />
      <NumPadQuick onChange={onChange} quick={quick} quickLabel={quickLabel} />
      <NumPadKeys value={value} onChange={onChange} />
    </div>
  );
}
