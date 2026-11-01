'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatRupiah } from '@/lib/money';
import type { publicOrder } from '@/lib/qr/public';

type Order = NonNullable<Awaited<ReturnType<typeof publicOrder>>>;
const POLL_MS = 10_000;

const STATUS = {
  waiting: { icon: Clock, title: 'Silakan bayar di kasir', text: 'Sebutkan nomor pesanan ini. Pesanan dibuat setelah dibayar.', tone: 'bg-amber-50 text-amber-900' },
  paid: { icon: CheckCircle2, title: 'Sudah dibayar', text: 'Pesananmu sedang disiapkan. Terima kasih!', tone: 'bg-green-50 text-green-900' },
  void: { icon: XCircle, title: 'Pesanan dibatalkan', text: '', tone: 'bg-gray-100 text-gray-700' },
} as const;

/** The table's bill as the customer sees it, refreshed until it's paid or cancelled. */
export default function QrStatus({ token, orderId, tableName, initial }: { token: string; orderId: string; tableName: string; initial: Order }) {
  const [order, setOrder] = useState(initial);

  useEffect(() => {
    if (order.status !== 'waiting') return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/t/${token}/orders/${orderId}`, { cache: 'no-store' }).catch(() => null);
      if (res?.ok) setOrder(await res.json());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [order.status, token, orderId]);

  const s = STATUS[order.status];
  return (
    <main className="mx-auto min-h-full w-full max-w-xl shrink-0 space-y-4 bg-gray-50 p-4">
      <div className="rounded-2xl bg-white p-6 text-center">
        <p className="text-sm text-gray-500">Meja {tableName}{order.customer_name ? ` · ${order.customer_name}` : ''}</p>
        <p className="font-heading text-5xl font-light tabular-nums" data-testid="order-number">#{order.number}</p>
      </div>
      <div role="status" className={`flex items-start gap-3 rounded-2xl p-4 ${s.tone}`} data-testid="order-status">
        <s.icon className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <p className="font-semibold">{s.title}</p>
          <p className="text-sm">{order.status === 'void' ? order.void_reason ?? 'Silakan pesan lagi atau tanya kasir.' : s.text}</p>
        </div>
      </div>
      {order.next && (
        <a href={`/t/${token}/o/${order.next.id}`} className="block rounded-2xl bg-amber-50 p-4 text-sm text-amber-900" data-testid="order-next">
          Meja ini masih punya pesanan <span className="font-semibold">#{order.next.number}</span> yang belum dibayar. <span className="font-semibold underline">Lihat</span>
        </a>
      )}
      <div className="rounded-2xl bg-white p-4">
        <ul className="divide-y">
          {order.items.map(i => (
            <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium">{i.qty}× {i.name}</span>
                {i.options.length > 0 && <span className="block text-xs text-gray-500">{i.options.join(', ')}</span>}
                {i.note && <span className="block text-xs italic text-gray-500">{i.note}</span>}
              </span>
              <span className="tabular-nums">{formatRupiah(i.total)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{formatRupiah(order.total)}</span></p>
      </div>
      <a href={`/t/${token}`} className="block h-12 rounded-2xl border bg-white text-center leading-[3rem] font-medium">
        {order.status === 'waiting' ? 'Tambah pesanan' : 'Pesan lagi'}
      </a>
    </main>
  );
}
