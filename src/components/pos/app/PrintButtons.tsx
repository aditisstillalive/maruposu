'use client';

import { Printer } from 'lucide-react';
import Receipt from '@/components/pos/print/Receipt';
import BaristaTicket from '@/components/pos/print/BaristaTicket';
import { printNode } from '@/components/pos/print/printNode';
import type { OrderDoc, Snapshot } from '@/lib/pos/types';

export function cashierName(snapshot: Snapshot, order: OrderDoc): string {
  const id = order.paid_by ?? order.created_by;
  return snapshot.employees.find(e => e.id === id)?.name ?? '-';
}

export function printReceipt(order: OrderDoc, snapshot: Snapshot) {
  printNode(<Receipt order={order} setting={snapshot.setting} cashierName={cashierName(snapshot, order)} />);
}

export default function PrintButtons({ order, snapshot }: { order: OrderDoc; snapshot: Snapshot }) {
  const cls = 'flex h-12 items-center justify-center gap-2 rounded-xl border bg-white font-medium hover:bg-gray-50';
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={cls} onClick={() => printReceipt(order, snapshot)}><Printer className="h-4 w-4" /> Cetak struk</button>
      <button type="button" className={cls} onClick={() => printNode(<BaristaTicket order={order} />)}><Printer className="h-4 w-4" /> Cetak tiket barista</button>
    </div>
  );
}
