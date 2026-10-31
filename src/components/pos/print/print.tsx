'use client';

import type { ReactNode } from 'react';
import Receipt from './Receipt';
import BaristaTicket from './BaristaTicket';
import ShiftReport from './ShiftReport';
import { printNode } from './printNode';
import { encode, receiptLines, shiftReportLines, ticketLines, type Line } from '@/lib/pos/escpos';
import { getPrinterSettings, rawbtUrl } from '@/lib/pos/client/printer';
import type { ClosedShift } from '@/lib/pos/client/db';
import type { OrderDoc, Snapshot } from '@/lib/pos/types';

export function cashierName(snapshot: Snapshot, order: OrderDoc): string {
  const id = order.paid_by ?? order.created_by;
  return snapshot.employees.find(e => e.id === id)?.name ?? '-';
}

/** Straight to the Bluetooth printer through RawBT, or the browser's print dialog (per tablet setting). */
async function print(lines: () => Line[], node: () => ReactNode): Promise<void> {
  const settings = await getPrinterSettings();
  if (settings.mode === 'rawbt') window.location.href = rawbtUrl(encode(lines(), settings.paper));
  else printNode(node());
}

export const printReceipt = (order: OrderDoc, snapshot: Snapshot) =>
  print(
    () => receiptLines(order, snapshot.setting, cashierName(snapshot, order)),
    () => <Receipt order={order} setting={snapshot.setting} cashierName={cashierName(snapshot, order)} />
  );

export const printTicket = (order: OrderDoc) => print(() => ticketLines(order), () => <BaristaTicket order={order} />);

export const printShiftReport = (closed: ClosedShift, snapshot: Snapshot) =>
  print(
    () => shiftReportLines(closed, snapshot.setting, snapshot.employees),
    () => <ShiftReport closed={closed} setting={snapshot.setting} employees={snapshot.employees} />
  );

/** A short page to check the printer, paper width and alignment. */
export const printTest = (cafeName: string) =>
  print(
    () => [
      { text: cafeName, align: 'center', bold: true },
      { text: 'Tes printer', align: 'center' },
      { rule: true },
      { row: ['Kiri', 'Kanan'] },
      { row: ['Total', 'Rp 123.456'], bold: true },
      { rule: true },
      { text: 'Kalau garis di atas pas selebar kertas, lebar kertasnya sudah benar.', align: 'center' },
    ],
    () => <div className="receipt"><div className="text-center font-bold">{cafeName}</div><div className="text-center">Tes printer</div></div>
  );
