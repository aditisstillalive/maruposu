'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import NumPad from './NumPad';
import { addCashMove } from '@/lib/pos/client/actions';
import { formatRupiah } from '@/lib/money';
import type { CashMoveDoc } from '@/lib/pos/types';

const LABEL: Record<CashMoveDoc['kind'], string> = { paid_in: 'Kas masuk', paid_out: 'Kas keluar', refund_out: 'Refund tunai' };
const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** Cash added to or taken from the drawer outside of sales (galon, es batu, extra float). */
export default function CashMoveDialog({ moves, cashierId, onClose }: { moves: CashMoveDoc[]; cashierId: string; onClose: () => void }) {
  const [kind, setKind] = useState<'paid_in' | 'paid_out'>('paid_out');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await addCashMove(kind, amount ?? 0, note, cashierId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Kas masuk / keluar</DialogTitle></DialogHeader>
        <div role="radiogroup" className="grid grid-cols-2 overflow-hidden rounded-xl border">
          {(['paid_in', 'paid_out'] as const).map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`h-11 text-sm font-medium ${kind === k ? 'bg-brand-strong text-white' : 'bg-white'}`}>{LABEL[k]}</button>
          ))}
        </div>
        <NumPad value={amount} onChange={setAmount} />
        <input aria-label="Keterangan" value={note} onChange={e => setNote(e.target.value)} maxLength={200}
          placeholder={kind === 'paid_out' ? 'mis. beli galon, es batu, parkir' : 'mis. tambahan modal dari Bu Risya'}
          className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={save} disabled={!amount || !note.trim() || busy}
          className="h-12 rounded-xl bg-brand-strong font-medium text-white disabled:opacity-40">Simpan</button>
        {moves.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Shift ini</p>
            <ul className="divide-y rounded-xl border text-sm">
              {[...moves].reverse().map(m => (
                <li key={m.id} className="flex justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block">{m.note}</span>
                    <span className="block text-xs text-gray-500">{LABEL[m.kind]} · {timeWIB(m.created_at)}</span>
                  </span>
                  <span className="tabular-nums">{m.kind === 'paid_in' ? '+' : '-'}{formatRupiah(m.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
