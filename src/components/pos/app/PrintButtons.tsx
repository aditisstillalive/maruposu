'use client';

import { Printer } from 'lucide-react';
import { printReceipt, printTicket } from '@/components/pos/print/print';
import type { OrderDoc, Snapshot } from '@/lib/pos/types';

export { cashierName, printReceipt } from '@/components/pos/print/print';

export default function PrintButtons({ order, snapshot }: { order: OrderDoc; snapshot: Snapshot }) {
  const cls = 'flex h-12 items-center justify-center gap-2 rounded-xl border bg-white font-medium hover:bg-gray-50';
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={cls} onClick={() => void printReceipt(order, snapshot)}><Printer className="h-4 w-4" /> Cetak struk</button>
      <button type="button" className={cls} onClick={() => void printTicket(order)}><Printer className="h-4 w-4" /> Cetak tiket barista</button>
    </div>
  );
}
