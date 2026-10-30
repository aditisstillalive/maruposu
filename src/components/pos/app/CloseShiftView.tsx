'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import DenominationInput from './DenominationInput';
import { closeShift, lockCount } from '@/lib/pos/client/actions';
import { emptyDenominations, varianceLabel, type Denominations } from '@/lib/pos/shift';
import { formatRupiah } from '@/lib/money';
import type { CountLock } from '@/lib/pos/client/db';
import type { OrderDoc } from '@/lib/pos/types';

/**
 * Blind count → lock → variance (+ note) → close. The expected cash is never
 * shown here; once the count is locked the cashier only sees the difference.
 */
export default function CloseShiftView({ openBills, lock, cashierId, onBack }: { openBills: OrderDoc[]; lock: CountLock | null; cashierId: string; onBack: () => void }) {
  const [counts, setCounts] = useState<Denominations>(emptyDenominations);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  };

  if (!lock && openBills.length) {
    return (
      <section className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <h1 className="text-2xl font-light tracking-tight">Tutup kasir</h1>
        <p className="mt-2 text-sm text-amber-800">Selesaikan atau batalkan open bill dulu.</p>
        <ul className="mt-4 divide-y rounded-xl border bg-white">
          {openBills.map(o => (
            <li key={o.id} className="flex justify-between px-3 py-2 text-sm">
              <span>#{String(o.number).padStart(3, '0')} {o.customer_name ?? ''}</span>
              <span className="text-gray-500">{o.items.reduce((s, i) => s + i.qty, 0)} item</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onBack} className="mt-4 h-12 w-full rounded-xl border bg-white font-medium">Kembali</button>
      </section>
    );
  }

  if (!lock) {
    return (
      <section className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight">Hitung uang di laci</h1>
            <p className="text-sm text-gray-500">Hitung semua uang fisik, lalu isi jumlah lembar per pecahan.</p>
          </div>
          <button type="button" onClick={onBack} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">Kembali</button>
        </div>
        <DenominationInput value={counts} onChange={setCounts} />
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <button type="button" onClick={() => setConfirming(true)} disabled={busy}
          className="mt-4 h-14 w-full rounded-xl bg-brand-strong text-lg font-medium text-white disabled:opacity-40">Selesai hitung</button>
        {confirming && (
          <Dialog open onOpenChange={o => !o && setConfirming(false)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>Kunci hitungan?</DialogTitle></DialogHeader>
              <p className="text-sm text-gray-600">Hitungan tidak bisa diubah lagi setelah dikunci.</p>
              <DialogFooter>
                <Button variant="outline" className="h-11" onClick={() => setConfirming(false)}>Periksa lagi</Button>
                <Button className="h-11" disabled={busy} onClick={() => run(async () => { await lockCount(counts, cashierId); setConfirming(false); })}>Ya, kunci hitungan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </section>
    );
  }

  const needsNote = lock.variance !== 0;
  return (
    <section className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <h1 className="text-2xl font-light tracking-tight">Tutup kasir</h1>
      <p className="mt-1 text-sm text-gray-500">Uang dihitung: <span className="tabular-nums">{formatRupiah(lock.counted)}</span> (terkunci)</p>
      <div className={`mt-6 rounded-2xl border p-6 text-center ${needsNote ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
        <p className="text-sm text-gray-500">Selisih</p>
        <p data-testid="variance" className="text-4xl font-light">{varianceLabel(lock.variance)}</p>
      </div>
      <label className="mt-4 block space-y-1">
        <span className="text-sm font-medium">Catatan{needsNote ? ' (wajib karena ada selisih)' : ' (opsional)'}</span>
        <textarea aria-label="Catatan" value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3}
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
      </label>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <button type="button" disabled={busy || (needsNote && !note.trim())} onClick={() => run(() => closeShift(note, cashierId))}
        className="mt-4 h-14 w-full rounded-xl bg-brand-strong text-lg font-medium text-white disabled:opacity-40">Tutup Kasir</button>
    </section>
  );
}
