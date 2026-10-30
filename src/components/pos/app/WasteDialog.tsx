'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { recordWaste } from '@/lib/pos/client/actions';
import { defaultSelection } from '@/lib/pos/cart';
import { WASTE_LABEL } from '@/lib/pos/waste-labels';
import type { Snapshot } from '@/lib/pos/types';

type Reason = 'rusak' | 'kadaluarsa' | 'salah_buat' | 'tumpah' | 'lainnya';

/** Waste at the bar: a product (its recipe is deducted) or an ingredient. */
export default function WasteDialog({ snapshot, cashierId, onClose }: { snapshot: Snapshot; cashierId: string; onClose: () => void }) {
  const [kind, setKind] = useState<'product' | 'ingredient'>('product');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState<number | null>(1);
  const [reason, setReason] = useState<Reason>('tumpah');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = kind === 'product' ? 'porsi' : snapshot.ingredients.find(i => i.id === target)?.unit ?? '';
  const field = 'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const product = snapshot.products.find(p => p.id === target);
      const line = kind === 'product'
        ? { product_id: target, option_ids: product ? Object.values(defaultSelection(product)).flat() : [], qty: qty ?? 0 }
        : { ingredient_id: target, qty: qty ?? 0 };
      await recordWaste([line], reason, note, cashierId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat');
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Catat waste</DialogTitle></DialogHeader>
        <div role="radiogroup" className="grid grid-cols-2 overflow-hidden rounded-xl border">
          {([['product', 'Produk'], ['ingredient', 'Bahan']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setTarget(''); setQty(k === 'product' ? 1 : null); }}
              className={`h-11 text-sm font-medium ${kind === k ? 'bg-brand-strong text-white' : 'bg-white'}`}>{label}</button>
          ))}
        </div>
        <select aria-label={kind === 'product' ? 'Produk' : 'Bahan'} value={target} onChange={e => setTarget(e.target.value)} className={field}>
          <option value="">Pilih {kind === 'product' ? 'produk' : 'bahan'}</option>
          {(kind === 'product' ? snapshot.products : snapshot.ingredients).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input aria-label="Jumlah" type="number" inputMode="numeric" min={1} value={qty ?? ''} onChange={e => setQty(Number.isNaN(e.target.valueAsNumber) ? null : Math.round(e.target.valueAsNumber))} className={`${field} w-32`} />
          <span className="text-sm text-gray-500">{unit}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(WASTE_LABEL) as Reason[]).map(r => (
            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}
              className={`h-10 rounded-lg border text-sm ${reason === r ? 'border-brand-strong bg-brand-strong text-white' : 'bg-white'}`}>{WASTE_LABEL[r]}</button>
          ))}
        </div>
        <input aria-label="Catatan" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={field} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={save} disabled={busy || !target || !qty}
          className="h-12 rounded-xl bg-brand-strong font-medium text-white disabled:opacity-40">Simpan</button>
      </DialogContent>
    </Dialog>
  );
}
