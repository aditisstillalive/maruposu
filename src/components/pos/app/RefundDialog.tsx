'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { refundOrder } from '@/lib/pos/client/actions';
import { refundLineAmount } from '@/lib/pos/refund';
import { formatRupiah } from '@/lib/money';
import type { OrderDoc } from '@/lib/pos/types';

/** Per-item refund of a paid bill; cash comes out of the drawer, cashless doesn't. */
export default function RefundDialog({ order, cashierId, onClose }: { order: OrderDoc; cashierId: string; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<'cash' | 'cashless'>('cash');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const left = (id: string) => {
    const i = order.items.find(x => x.id === id)!;
    return i.qty - i.refunded_qty;
  };
  const bump = (id: string, d: number) => setQty(q => ({ ...q, [id]: Math.min(left(id), Math.max(0, (q[id] ?? 0) + d)) }));
  const total = order.items.reduce(
    (s, i) => s + (qty[i.id] ? refundLineAmount(i, qty[i.id], { qty: i.refunded_qty, amount: i.refunded_amount }) : 0),
    0
  );

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await refundOrder(order.id, Object.entries(qty).map(([order_item_id, q]) => ({ order_item_id, qty: q })), method, reason, cashierId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund gagal');
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Refund bill #{String(order.number).padStart(3, '0')}</DialogTitle></DialogHeader>
        <ul className="divide-y rounded-xl border">
          {order.items.map(i => {
            const rest = i.qty - i.refunded_qty;
            return (
              <li key={i.id} className={`flex items-center gap-2 px-3 py-2 ${rest === 0 ? 'opacity-40' : ''}`}>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{i.name}</span>
                  <span className="block text-xs text-gray-500">
                    {[i.options.map(o => o.name).join(', '), rest < i.qty ? `sisa ${rest} dari ${i.qty}` : `${i.qty}×`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" aria-label={`Kurangi refund ${i.name}`} disabled={!qty[i.id]} onClick={() => bump(i.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center tabular-nums">{qty[i.id] ?? 0}</span>
                <button type="button" aria-label={`Tambah refund ${i.name}`} disabled={(qty[i.id] ?? 0) >= rest} onClick={() => bump(i.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-30"><Plus className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setQty(Object.fromEntries(order.items.map(i => [i.id, i.qty - i.refunded_qty])))} className="text-left text-sm underline-offset-4 hover:underline">Refund semua</button>
        <div role="radiogroup" className="grid grid-cols-2 overflow-hidden rounded-xl border">
          {([['cash', 'Tunai dari laci'], ['cashless', 'Non-tunai']] as const).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
              className={`h-11 text-sm font-medium ${method === m ? 'bg-brand-strong text-white' : 'bg-white'}`}>{label}</button>
          ))}
        </div>
        {method === 'cashless' && <p className="text-xs text-gray-500">Proses pengembaliannya di mesin EDC / aplikasi QRIS. Laci kas tidak berubah.</p>}
        <input aria-label="Alasan" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Alasan refund (wajib)"
          className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-500">Total refund</span>
          <span data-testid="refund-total" className="text-2xl tabular-nums">{formatRupiah(total)}</span>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={submit} disabled={total <= 0 || !reason.trim() || busy}
          className="h-12 rounded-xl bg-red-700 font-medium text-white disabled:opacity-40">Refund {formatRupiah(total)}</button>
      </DialogContent>
    </Dialog>
  );
}
