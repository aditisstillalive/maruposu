import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { change } from '@/lib/reports/aggregate';
import { formatRupiah } from '@/lib/money';

export type KpiFormat = 'rupiah' | 'number';
const fmt = (n: number, f: KpiFormat) => (f === 'rupiah' ? formatRupiah(n) : n.toLocaleString('id-ID'));

/** One headline number with its change against the previous period of the same length. */
export default function KpiTile({ label, value, previous, format, note }: { label: string; value: number; previous: number; format: KpiFormat; note?: string }) {
  const c = change(value, previous);
  const up = c !== null && c > 0;
  const down = c !== null && c < 0;
  return (
    <div role="group" aria-label={label} className="rounded-xl border bg-white p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{fmt(value, format)}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <p className="mt-2 flex items-center gap-1 text-xs">
        {up && <ArrowUpRight className="h-3.5 w-3.5 text-green-700" aria-hidden />}
        {down && <ArrowDownRight className="h-3.5 w-3.5 text-red-700" aria-hidden />}
        <span className={`font-medium tabular-nums ${up ? 'text-green-700' : down ? 'text-red-700' : 'text-gray-500'}`}>
          {c === null ? '—' : `${c > 0 ? '+' : ''}${(c * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}
        </span>
        <span className="text-muted-foreground">vs periode sebelumnya ({fmt(previous, format)})</span>
      </p>
    </div>
  );
}
