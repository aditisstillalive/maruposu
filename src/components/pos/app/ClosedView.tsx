'use client';

import { CheckCircle2, Printer } from 'lucide-react';
import { printShiftReport } from '@/components/pos/print/print';
import { markCloseSeen } from '@/lib/pos/client/actions';
import { formatRupiah } from '@/lib/money';
import { varianceLabel } from '@/lib/pos/shift';
import type { ClosedShift } from '@/lib/pos/client/db';
import type { Snapshot } from '@/lib/pos/types';

export default function ClosedView({ closed, snapshot }: { closed: ClosedShift; snapshot: Snapshot }) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-10 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12" />
      <h1 className="font-heading text-2xl font-light tracking-tight">Kasir ditutup</h1>
      <dl className="grid grid-cols-2 gap-y-1 rounded-xl border bg-white p-4 text-left text-sm">
        <dt className="text-gray-500">Transaksi</dt><dd className="text-right tabular-nums">{closed.summary.transactions}</dd>
        <dt className="text-gray-500">Penjualan</dt><dd className="text-right tabular-nums">{formatRupiah(closed.summary.gross_sales)}</dd>
        <dt className="text-gray-500">Uang dihitung</dt><dd className="text-right tabular-nums">{formatRupiah(closed.counted)}</dd>
        <dt className="text-gray-500">Selisih</dt><dd className="text-right">{varianceLabel(closed.variance)}</dd>
      </dl>
      <button type="button" onClick={() => void printShiftReport(closed, snapshot)}
        className="flex h-12 items-center justify-center gap-2 rounded-xl border bg-white font-medium"><Printer className="h-4 w-4" /> Cetak laporan</button>
      <button type="button" onClick={() => void markCloseSeen()} className="h-14 rounded-xl bg-brand-strong text-lg font-medium text-white">Buka shift baru</button>
    </section>
  );
}
