'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/money';
import type { OrderDoc, PaymentMethod } from '@/lib/pos/types';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Tunai', edc: 'EDC', qris: 'QRIS' };
const FILTERS: [PaymentMethod | 'all', string][] = [['all', 'Semua'], ['cash', 'Tunai'], ['edc', 'EDC'], ['qris', 'QRIS']];

const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

function status(o: OrderDoc): { label: string; cls: string } {
  if (o.status === 'void') return { label: 'Batal', cls: 'bg-gray-100 text-gray-600' };
  if (o.status === 'open') return { label: 'Open', cls: 'bg-amber-50 text-amber-800' };
  if (o.status === 'refunded') return { label: 'Refund', cls: 'bg-red-50 text-red-700' };
  if (o.refunds.length) return { label: 'Refund sebagian', cls: 'bg-red-50 text-red-700' };
  return { label: 'Lunas', cls: 'bg-green-50 text-green-700' };
}

export const orderLabel = (o: OrderDoc) => o.customer_name || `#${String(o.number).padStart(3, '0')}`;

/** This shift's bills, newest first, with receipt and barista-ticket reprints and refund. */
export default function HistorySheet({ orders, onReprint, onTicket, onRefund, onClose }: {
  orders: OrderDoc[];
  onReprint: (o: OrderDoc) => void;
  /** e.g. the ticket was never printed, or the paper ran out */
  onTicket: (o: OrderDoc) => void;
  onRefund: (o: OrderDoc) => void;
  onClose: () => void;
}) {
  // By payment method, to match QRIS/EDC against the machine when closing
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const shown = method === 'all' ? orders : orders.filter(o => o.payment_method === method);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Riwayat shift ini</DialogTitle></DialogHeader>
        {orders.length > 0 && (
          <div role="radiogroup" aria-label="Metode bayar" className="flex gap-2">
            {FILTERS.map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                className={`h-9 rounded-full border px-4 text-sm ${method === m ? 'border-brand-strong bg-brand-strong text-white' : 'bg-white'}`}>{label}</button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">{orders.length ? `Tidak ada transaksi ${PAYMENT_LABEL[method as PaymentMethod]}.` : 'Belum ada transaksi.'}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {[...shown].reverse().map(o => {
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
                  {o.payment_method && (
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-gray-700" title={o.payment_ref ?? undefined}>{PAYMENT_LABEL[o.payment_method]}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                  <span className="w-24 text-right text-sm tabular-nums">
                    {o.status === 'open' || o.status === 'void' ? '-' : formatRupiah(o.total)}
                    {refunded > 0 && <span className="block text-xs text-red-700">-{formatRupiah(refunded)}</span>}
                  </span>
                  <span className="flex gap-1">
                    {o.status !== 'void' && (
                      <button type="button" aria-label={`Cetak tiket barista ${label}`} onClick={() => onTicket(o)} className="h-9 rounded-lg border px-2 text-xs">Tiket</button>
                    )}
                    {(o.status === 'paid' || o.status === 'refunded') && (
                      <button type="button" aria-label={`Cetak ulang struk ${label}`} onClick={() => onReprint(o)} className="h-9 rounded-lg border px-2 text-xs">Struk</button>
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
