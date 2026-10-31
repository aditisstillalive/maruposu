'use client';

import { useState } from 'react';
import NumPad from './NumPad';
import { openShift } from '@/lib/pos/client/actions';

const QUICK = [100_000, 200_000, 300_000, 500_000];

export default function OpenShiftView({ cashierId }: { cashierId: string }) {
  const [float, setFloat] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (float === null) return;
    setBusy(true);
    setError('');
    try {
      await openShift(float, cashierId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuka kasir');
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
      <h1 className="font-heading text-2xl font-light tracking-tight">Buka kasir</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">Hitung uang modal/kembalian yang dimasukkan ke laci sebelum mulai berjualan.</p>
      <NumPad value={float} onChange={setFloat} quick={QUICK} />
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" onClick={open} disabled={float === null || busy}
        className="mt-4 h-14 rounded-xl bg-brand-strong text-lg font-medium text-white disabled:opacity-40">
        Buka Kasir
      </button>
    </section>
  );
}
