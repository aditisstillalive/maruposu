'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/money';
import { promoAvailability } from '@/lib/pos/promo';
import { describePromo } from '@/lib/pos/promo-text';
import type { CartLine, PromoRule, SnapshotCategory } from '@/lib/pos/types';

export default function PromoDialog({
  promos,
  lines,
  names,
  onPick,
  onClose,
}: {
  promos: PromoRule[];
  lines: CartLine[];
  names: Record<string, string>;
  onPick: (p: PromoRule) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const now = new Date();
  const listed = promos.filter(p => !p.code);

  const useCode = () => {
    const p = promos.find(x => x.code && x.code === code.trim().toUpperCase());
    if (!p) return setError('Kode tidak ditemukan atau tidak berlaku');
    const a = promoAvailability(p, lines, now);
    if (!a.ok) return setError(a.reason);
    onPick(p);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Promo</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input aria-label="Kode kupon" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }} placeholder="Kode kupon"
              className="h-11 flex-1 rounded-xl border px-3 font-mono uppercase tracking-wide outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            <Button className="h-11" disabled={!code.trim()} onClick={useCode}>Pakai kode</Button>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
        {listed.length > 0 && (
          <ul className="space-y-2">
            {listed.map(p => {
              const a = promoAvailability(p, lines, now);
              return (
                <li key={p.id}>
                  <button type="button" disabled={!a.ok} onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:border-gray-400 disabled:opacity-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-gray-500">{describePromo(p, names)}</span>
                    </span>
                    <span className="text-sm tabular-nums">{a.ok ? `-${formatRupiah(a.discount)}` : <span className="text-xs text-gray-500">{a.reason}</span>}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** id → display name for promo summaries. */
export function promoNames(categories: SnapshotCategory[], products: { id: string; name: string }[]): Record<string, string> {
  return Object.fromEntries([...categories, ...products].map(x => [x.id, x.name]));
}
