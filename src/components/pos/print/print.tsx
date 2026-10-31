'use client';

import type { ReactNode } from 'react';
import Receipt from './Receipt';
import BaristaTicket from './BaristaTicket';
import ShiftReport from './ShiftReport';
import { printNode } from './printNode';
import { encode, receiptLines, shiftReportLines, ticketLines, type Line } from '@/lib/pos/escpos';
import { getPrinterSettings, printAndroid, rawbtUrl } from '@/lib/pos/client/printer';
import type { ClosedShift } from '@/lib/pos/client/db';
import type { OrderDoc, Snapshot } from '@/lib/pos/types';

export function cashierName(snapshot: Snapshot, order: OrderDoc): string {
  const id = order.paid_by ?? order.created_by;
  return snapshot.employees.find(e => e.id === id)?.name ?? '-';
}

/** Shown by PrintNotice in the till. */
export const PRINT_ERROR_EVENT = 'maraca-print-error';
const fail = (message: string): void => {
  window.dispatchEvent(new CustomEvent(PRINT_ERROR_EVENT, { detail: message }));
};

/**
 * Per tablet setting: straight to the paired Bluetooth printer (Maraca POS app),
 * through RawBT, or the browser's print dialog.
 */
async function print(lines: () => Line[], node: () => ReactNode): Promise<void> {
  const settings = await getPrinterSettings();
  if (settings.mode === 'android') {
    if (!settings.device) return fail('Pilih printer dulu: ikon printer di bar atas.');
    try {
      await printAndroid(settings.device.address, encode(lines(), settings.paper));
    } catch (e) {
      fail(`${settings.device.name}: ${e instanceof Error ? e.message : 'gagal mencetak'}. Pastikan printer menyala dan dekat tablet.`);
    }
  } else if (settings.mode === 'rawbt') window.location.href = rawbtUrl(encode(lines(), settings.paper));
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
