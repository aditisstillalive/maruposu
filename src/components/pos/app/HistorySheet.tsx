'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/money';
import type { OrderDoc } from '@/lib/pos/types';

const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

function status(o: OrderDoc): { label: string; cls: string } {
  if (o.status === 'void') return { label: 'Batal', cls: 'bg-gray-100 text-gray-600' };
  if (o.status === 'open') return { label: 'Open', cls: 'bg-amber-50 text-amber-800' };
  if (o.status === 'refunded') return { label: 'Refund', cls: 'bg-red-50 text-red-700' };
  if (o.refunds.length) return { label: 'Refund sebagian', cls: 'bg-red-50 text-red-700' };
  return { label: 'Lunas', cls: 'bg-green-50 text-green-700' };
}

export const orderLabel = (o: OrderDoc) => o.customer_name || `#${String(o.number).padStart(3, '0')}`;

/** This shift's bills, newest first, with reprint and refund. */
export default function HistorySheet({ orders, onReprint, onRefund, onClose }: {
  orders: OrderDoc[];
  onReprint: (o: OrderDoc) => void;
  onRefund: (o: OrderDoc) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Riwayat shift ini</DialogTitle></DialogHeader>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Belum ada transaksi.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {[...orders].reverse().map(o => {
              const s = status(o);
              const label = orderLabel(o);
              const refunded = o.refunds.reduce((sum, r) => sum + r.amount, 0);
              return (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-14 text-lg font-light tabular-nums">#{String(o.number).padStart(3, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{o.customer_name ?? (o.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in')}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {timeWIB(o.paid_at ?? o.created_at)} · {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                      {o.void_reason ? ` · ${o.void_reason}` : ''}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                  <span className="w-24 text-right text-sm tabular-nums">
                    {o.status === 'open' || o.status === 'void' ? '-' : formatRupiah(o.total)}
                    {refunded > 0 && <span className="block text-xs text-red-700">-{formatRupiah(refunded)}</span>}
                  </span>
                  <span className="flex gap-1">
                    {(o.status === 'paid' || o.status === 'refunded') && (
                      <button type="button" aria-label={`Cetak ulang struk ${label}`} onClick={() => onReprint(o)} className="h-9 rounded-lg border px-2 text-xs">Cetak</button>
                    )}
                    {o.status === 'paid' && (
                      <button type="button" aria-label={`Refund ${label}`} onClick={() => onRefund(o)} className="h-9 rounded-lg border px-2 text-xs text-red-700">Refund</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
