'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import type { OrderDoc } from '@/lib/pos/types';

const STORE = 'maraca-qr-alerted';
const read = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

/** Two short tones; WebAudio needs no sound file. */
function chime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.25);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // no sound available: the banner still shows
  }
}

type Alert = { orderId: string; text: string };

/** Sound and a banner when a customer orders (or adds to an order) from a table's QR. */
export default function QrAlerts({ orders, onOpen }: { orders: OrderDoc[]; onOpen: (o: OrderDoc) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alerted = useRef<Set<string> | null>(null);

  useEffect(() => {
    alerted.current ??= read();
    const seen = alerted.current;
    const fresh: Alert[] = [];
    for (const o of orders) {
      if (o.status !== 'open') continue;
      const added = o.items.filter(i => i.origin === 'qr' && !seen.has(i.id));
      if (!added.length) continue;
      added.forEach(i => seen.add(i.id));
      const count = added.reduce((n, i) => n + i.qty, 0);
      const isNew = o.items.every(i => added.includes(i));
      fresh.push({ orderId: o.id, text: `${isNew ? 'Pesanan baru' : 'Tambahan pesanan'} · Meja ${o.table_no ?? '?'} · ${count} item` });
    }
    if (!fresh.length) return;
    try {
      localStorage.setItem(STORE, JSON.stringify([...seen].slice(-500)));
    } catch {
      // per-tablet convenience only
    }
    chime();
    setAlerts(a => [...a.filter(x => !fresh.some(f => f.orderId === x.orderId)), ...fresh]);
  }, [orders]);

  if (!alerts.length) return null;
  return (
    <div className="fixed left-1/2 top-16 z-[60] w-full max-w-md -translate-x-1/2 space-y-2 px-4">
      {alerts.map(a => (
        <div key={a.orderId} role="alert" className="flex items-center gap-3 rounded-xl bg-black px-4 py-3 text-white shadow-lg">
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-sm font-medium">{a.text}</span>
          <button type="button" className="rounded-lg bg-white px-3 py-1 text-sm font-medium text-black"
            onClick={() => { const o = orders.find(x => x.id === a.orderId); if (o) onOpen(o); setAlerts(x => x.filter(y => y.orderId !== a.orderId)); }}>
            Lihat
          </button>
          <button type="button" aria-label="Tutup" onClick={() => setAlerts(x => x.filter(y => y.orderId !== a.orderId))}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
