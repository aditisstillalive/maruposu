'use client';

import { Delete } from 'lucide-react';
import { formatRupiah } from '@/lib/money';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'];
const MAX = 100_000_000;

/** Touch keypad for rupiah amounts. `null` means nothing entered yet. */
export default function NumPad({
  value,
  onChange,
  quick = [],
  quickLabel = formatRupiah,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  quick?: number[];
  quickLabel?: (v: number) => string;
}) {
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
    <div className="space-y-3">
      <div data-testid="numpad-value" className="rounded-xl border bg-white px-4 py-3 text-right text-3xl font-light tabular-nums">
        {value === null ? <span className="text-gray-300">Rp 0</span> : formatRupiah(value)}
      </div>
      {quick.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {quick.map(q => (
            <button key={q} type="button" onClick={() => onChange(q)}
              className="h-11 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 active:bg-brand-soft">
              {quickLabel(q)}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map(k => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Hapus' : k}
            className="flex h-14 items-center justify-center rounded-xl border bg-white text-xl font-light hover:bg-gray-50 active:bg-brand-soft">
            {k === 'del' ? <Delete className="h-5 w-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
