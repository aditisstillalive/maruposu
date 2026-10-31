'use client';

import { formatRupiah } from '@/lib/money';
import { computeTotals } from '@/lib/pos/pricing';
import type { OrderDoc, TaxRule } from '@/lib/pos/types';
import { printTicket } from '@/components/pos/print/print';

const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default function OpenBillsList({ orders, tax, onOpen, onVoid }: { orders: OrderDoc[]; tax: TaxRule; onOpen: (o: OrderDoc) => void; onVoid: (o: OrderDoc) => void }) {
  if (!orders.length) return <p className="p-6 text-center text-sm text-gray-400">Tidak ada open bill</p>;
  return (
    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {orders.map(o => {
        const who = [o.customer_name, o.table_no ? `Meja ${o.table_no}` : null].filter(Boolean).join(' · ') || (o.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in');
        return (
          <li key={o.id} className="rounded-xl border bg-white">
            <button type="button" onClick={() => onOpen(o)} className="flex w-full items-start gap-3 p-3 text-left">
              <span className="text-2xl font-light tabular-nums">#{String(o.number).padStart(3, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{who}</span>
                <span className="block truncate text-xs text-gray-500">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
              </span>
              <span className="text-right text-sm">
                <span className="block tabular-nums">{formatRupiah(computeTotals(o.items, null, tax).total)}</span>
                <span className="block text-xs text-gray-500">{timeWIB(o.created_at)}</span>
              </span>
            </button>
            <div className="flex justify-between border-t px-3 py-1">
              <button type="button" onClick={() => void printTicket(o)} className="text-xs text-gray-600 hover:underline">Cetak tiket</button>
              <button type="button" onClick={() => onVoid(o)} className="text-xs text-red-700 hover:underline" aria-label={`Batalkan bill #${o.number}`}>Batalkan bill</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
