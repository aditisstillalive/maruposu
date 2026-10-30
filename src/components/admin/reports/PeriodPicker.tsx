import Link from 'next/link';
import { Check } from 'lucide-react';
import { PRESETS, PRESET_LABEL, type Preset } from '@/lib/reports/period';
import type { Period } from '@/lib/reports/types';

/** Presets as links, then a custom business-day range; every value lives in the URL. */
export default function PeriodPicker({ basePath, preset, period, extra = {} }: { basePath: string; preset: Preset | null; period: Period; extra?: Record<string, string> }) {
  const href = (q: Record<string, string>) => `${basePath}?${new URLSearchParams({ ...extra, ...q })}`;
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm print:hidden">
      <nav aria-label="Periode" className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <Link
            key={p}
            href={href({ preset: p })}
            aria-current={preset === p ? 'page' : undefined}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 ${preset === p ? 'border-black bg-white font-semibold' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            {preset === p && <Check className="h-4 w-4" strokeWidth={3} />}
            {PRESET_LABEL[p]}
          </Link>
        ))}
      </nav>
      <form key={`${period.from}_${period.to}`} action={basePath} className="flex flex-wrap items-end gap-2 border-l pl-2">
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="space-y-1"><span className="block text-muted-foreground">Dari</span><input type="date" name="from" defaultValue={period.from} className="h-8 rounded-lg border bg-white px-2" /></label>
        <label className="space-y-1"><span className="block text-muted-foreground">Sampai</span><input type="date" name="to" defaultValue={period.to} className="h-8 rounded-lg border bg-white px-2" /></label>
        <button className={`h-8 rounded-lg border px-3 ${preset ? 'bg-white' : 'border-black bg-white font-semibold'}`}>Tampilkan</button>
      </form>
    </div>
  );
}
