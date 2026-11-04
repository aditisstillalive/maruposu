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

  const total = (k: CashMoveDoc['kind']) => moves.filter(m => m.kind === k).reduce((n, m) => n + m.amount, 0);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Kas masuk / keluar</DialogTitle></DialogHeader>
        {/* Form left, this shift's entries right: the barista sees what's already recorded */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
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
              className="h-12 w-full rounded-xl bg-brand-strong font-medium text-white disabled:opacity-40">Simpan</button>
          </div>
          <section aria-label="Riwayat kas shift ini" className="flex min-h-0 flex-col">
            <p className="mb-2 text-sm font-medium">Riwayat kas shift ini</p>
            {moves.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">Belum ada kas masuk / keluar.</p>
            ) : (
              <>
                <ul className="divide-y overflow-y-auto rounded-xl border text-sm sm:max-h-[50vh]">
                  {[...moves].reverse().map(m => (
                    <li key={m.id} className="flex justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block">{m.note}</span>
                        <span className="block text-xs text-gray-500">{LABEL[m.kind]} · {timeWIB(m.created_at)}</span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${m.kind === 'paid_in' ? 'text-green-700' : 'text-red-700'}`}>{m.kind === 'paid_in' ? '+' : '-'}{formatRupiah(m.amount)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Total kas masuk</dt><dd className="tabular-nums text-green-700">+{formatRupiah(total('paid_in'))}</dd></div>
                  <div className="flex justify-between"><dt>Total kas keluar</dt><dd className="tabular-nums text-red-700">-{formatRupiah(total('paid_out'))}</dd></div>
                  {total('refund_out') > 0 && <div className="flex justify-between"><dt>Refund tunai</dt><dd className="tabular-nums text-red-700">-{formatRupiah(total('refund_out'))}</dd></div>}
                </dl>
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
