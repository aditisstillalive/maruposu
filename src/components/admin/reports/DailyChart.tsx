'use client';

import { useEffect, useRef, useState } from 'react';
import { formatRupiah } from '@/lib/money';

export type DailyPoint = { date: string; transactions: number; net_revenue: number; gross_profit: number };

const SERIES = [
  { key: 'net_revenue', name: 'Pendapatan bersih', color: 'var(--chart-sales)' },
  { key: 'gross_profit', name: 'Laba kotor', color: 'var(--chart-profit)' },
] as const;

const H = 240;
const PAD = { top: 12, right: 96, bottom: 28, left: 56 };

/** 1250000 → "1,3 jt"; axis ticks only, values elsewhere are exact rupiah. */
function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `${n}`;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) out.push(v);
  return out;
}

const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Net revenue and gross profit per business day: two lines on one rupiah axis. */
export default function DailyChart({ data }: { data: DailyPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = data.flatMap(d => [d.net_revenue, d.gross_profit]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i * plotW) / (data.length - 1));
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const every = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 64)));
  const last = data.length - 1;

  // End labels only when the two line ends are far enough apart to stay attached
  const ends = SERIES.map(s => y(data[last][s.key]));
  const labelEnds = Math.abs(ends[0] - ends[1]) >= 16;

  function pick(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left - PAD.left;
    const i = data.length === 1 ? 0 : Math.round((px / plotW) * (data.length - 1));
    setHover(Math.min(last, Math.max(0, i)));
  }

  const h = hover === null ? null : data[hover];
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-gray-600" aria-hidden>
        {SERIES.map(s => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div ref={wrap} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Pendapatan bersih dan laba kotor per hari, ${dayLabel(data[0].date)}–${dayLabel(data[last].date)}`}
          tabIndex={0}
          className="block touch-none outline-none focus-visible:ring-2 focus-visible:ring-black/20 rounded"
          onPointerMove={e => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(last)}
          onBlur={() => setHover(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') setHover(i => Math.max(0, (i ?? last) - 1));
            if (e.key === 'ArrowRight') setHover(i => Math.min(last, (i ?? 0) + 1));
          }}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d4d4d4' : '#ededed'} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[11px] tabular-nums">{compact(t)}</text>
            </g>
          ))}
          {data.map((d, i) => i === last || (i % every === 0 && last - i >= every / 2) ? (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[11px]">{dayLabel(d.date)}</text>
          ) : null)}
          {h && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + plotH} stroke="#a3a3a3" strokeWidth={1} />}
          {SERIES.map(s => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')}
            />
          ))}
          {SERIES.map(s => (
            <circle key={s.key} cx={x(hover ?? last)} cy={y(data[hover ?? last][s.key])} r={4} fill={s.color} stroke="white" strokeWidth={2} />
          ))}
          {labelEnds && hover === null && SERIES.map((s, k) => (
            <text key={s.key} x={x(last) + 8} y={ends[k]} dy="0.32em" className="fill-gray-700 text-[11px] font-medium tabular-nums">{compact(data[last][s.key])}</text>
          ))}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-xs shadow-sm"
            style={x(hover!) > width / 2 ? { right: width - x(hover!) + 12 } : { left: x(hover!) + 12 }}
          >
            <p className="mb-1 text-gray-500">{dayLabel(h.date)} · {h.transactions} transaksi</p>
            {SERIES.map(s => (
              <p key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span className="font-semibold tabular-nums">{formatRupiah(h[s.key])}</span>
                <span className="text-gray-500">{s.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Lihat tabel</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 font-normal">Tanggal</th>
              <th className="py-1 text-right font-normal">Transaksi</th>
              <th className="py-1 text-right font-normal">Pendapatan bersih</th>
              <th className="py-1 text-right font-normal">Laba kotor</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.date} className="border-b last:border-0">
                <td className="py-1 tabular-nums">{d.date}</td>
                <td className="py-1 text-right tabular-nums">{d.transactions}</td>
                <td className="py-1 text-right tabular-nums">{formatRupiah(d.net_revenue)}</td>
                <td className="py-1 text-right tabular-nums">{formatRupiah(d.gross_profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
