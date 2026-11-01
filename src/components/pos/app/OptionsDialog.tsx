'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { defaultSelection, makeLine, selectionError, selectionFromLine, type Selection } from '@/lib/pos/cart';
import { lineTotal } from '@/lib/pos/pricing';
import { formatRupiah } from '@/lib/money';
import type { MenuProduct, OrderItemDoc } from '@/lib/pos/types';

/** Variant/add-on picker. With `line` it edits an existing bill line. */
export default function OptionsDialog({
  product,
  line,
  onConfirm,
  onRemove,
  onClose,
  confirmLabel = 'Tambah ke bill',
  maxQty = 999,
  noteMax = 200,
}: {
  product: MenuProduct;
  line?: OrderItemDoc;
  onConfirm: (line: OrderItemDoc) => void;
  onRemove?: () => void;
  onClose: () => void;
  confirmLabel?: string;
  maxQty?: number;
  noteMax?: number;
}) {
  const [sel, setSel] = useState<Selection>(() => (line ? selectionFromLine(product, line) : defaultSelection(product)));
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [note, setNote] = useState(line?.note ?? '');

  const draft = makeLine(product, sel, qty, note);
  const error = selectionError(product, sel);
  const toggle = (groupId: string, optionId: string, variant: boolean) =>
    setSel(s => {
      const cur = s[groupId] ?? [];
      if (variant) return { ...s, [groupId]: [optionId] };
      return { ...s, [groupId]: cur.includes(optionId) ? cur.filter(x => x !== optionId) : [...cur, optionId] };
    });

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{product.name}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {product.groups.map(g => {
            const variant = g.kind === 'variant';
            return (
              <fieldset key={g.id}>
                <legend className="mb-2 text-sm font-medium">
                  {g.name} <span className="font-normal text-gray-500">{variant ? '· pilih satu' : `· maks ${g.max_select}`}{g.required ? '' : ' · opsional'}</span>
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {g.options.map(o => {
                    const on = (sel[g.id] ?? []).includes(o.id);
                    return (
                      <button key={o.id} type="button" role={variant ? 'radio' : 'checkbox'} aria-checked={on}
                        aria-label={o.price_delta ? `${o.name} +${formatRupiah(o.price_delta)}` : o.name}
                        onClick={() => toggle(g.id, o.id, variant)}
                        className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-brand-strong bg-brand-strong text-white' : 'bg-white hover:bg-gray-50'}`}>
                        <span className="block font-medium">{o.name}</span>
                        {o.price_delta > 0 && <span className={`block text-xs ${on ? 'text-gray-200' : 'text-gray-500'}`}>+{formatRupiah(o.price_delta)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Catatan</span>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={noteMax} placeholder="mis. less ice, tanpa sedotan"
              className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Jumlah</span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Kurangi jumlah" onClick={() => setQty(q => Math.max(1, q - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center text-lg tabular-nums" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Tambah jumlah" onClick={() => setQty(q => Math.min(maxQty, q + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
          {error && <p className="text-sm text-amber-700">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          {onRemove && <Button variant="destructive" className="h-11" onClick={onRemove}>Hapus item</Button>}
          <Button className="h-11 flex-1" disabled={!!error} onClick={() => onConfirm(line ? { ...draft, id: line.id } : draft)}>
            {line ? 'Simpan perubahan' : confirmLabel} · {formatRupiah(lineTotal(draft))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
