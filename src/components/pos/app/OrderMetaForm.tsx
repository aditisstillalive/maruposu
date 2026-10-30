'use client';

import type { OrderType } from '@/lib/pos/types';

export type OrderMeta = { order_type: OrderType; customer_name: string; table_no: string };

export default function OrderMetaForm({ meta, onChange }: { meta: OrderMeta; onChange: (m: OrderMeta) => void }) {
  const input = 'h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border" role="radiogroup" aria-label="Jenis pesanan">
        {([['dine_in', 'Dine-in'], ['takeaway', 'Takeaway']] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={meta.order_type === v} onClick={() => onChange({ ...meta, order_type: v })}
            className={`h-10 text-sm font-medium ${meta.order_type === v ? 'bg-brand-strong text-white' : 'bg-white text-gray-700'}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <input aria-label="Nama customer" placeholder="Nama customer" value={meta.customer_name} maxLength={60}
          onChange={e => onChange({ ...meta, customer_name: e.target.value })} className={input} />
        <input aria-label="Meja" placeholder="Meja" value={meta.table_no} maxLength={20} disabled={meta.order_type === 'takeaway'}
          onChange={e => onChange({ ...meta, table_no: e.target.value })} className={`${input} disabled:opacity-40`} />
      </div>
    </div>
  );
}
