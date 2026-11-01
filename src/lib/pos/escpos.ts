// Receipts for Bluetooth thermal printers (ESC/POS), sent straight from the
// tablet through RawBT (see client/printer.ts). Same content as the browser
// print components in src/components/pos/print, laid out as plain text columns.
import { formatRupiah } from '@/lib/money';
import { lineTotal, unitPrice } from './pricing';
import { DENOMINATIONS, varianceLabel } from './shift';
import type { ClosedShift } from './client/db';
import type { OrderDoc, ReceiptLogo, Snapshot, SnapshotEmployee } from './types';

export type PaperWidth = 58 | 80;
/** Characters per line in the printer's normal font. */
export const COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

type Align = 'left' | 'center' | 'right';
type Style = { bold?: boolean; big?: boolean; align?: Align; indent?: number };
export type Line = ({ text: string } & Style) | ({ row: [string, string] } & Style) | { rule: true } | { image: ReceiptLogo };
/** `image` lines come out as an empty text line carrying the raster. */
export type LaidOut = { text: string; bold: boolean; big: boolean; align: Align; image?: ReceiptLogo };

const METHOD: Record<string, string> = { cash: 'Tunai', edc: 'EDC', qris: 'QRIS' };
const dateTimeWIB = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** Printers only know their built-in code page: keep to plain ASCII. */
export function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[·–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Word-wraps to `width`, splitting words longer than a line. */
function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (let word of s.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line || !out.length) out.push(line);
  return out;
}

/** Lines as they come out of the printer: wrapped, rows padded to the full width. */
export function layout(lines: Line[], paper: PaperWidth): LaidOut[] {
  const width = COLUMNS[paper];
  const out: LaidOut[] = [];
  for (const l of lines) {
    if ('rule' in l) { out.push({ text: '-'.repeat(width), bold: false, big: false, align: 'left' }); continue; }
    if ('image' in l) { out.push({ text: '', bold: false, big: false, align: 'center', image: l.image }); continue; }
    const style = { bold: !!l.bold, big: !!l.big, align: l.align ?? 'left' };
    const cols = l.big ? Math.floor(width / 2) : width;
    const pad = ' '.repeat(l.indent ?? 0);
    if ('text' in l) {
      // Line breaks typed by the admin (header, footer, notes) stay line breaks
      for (const para of l.text.split(/\r?\n/)) {
        for (const t of wrap(ascii(para), cols - pad.length)) out.push({ ...style, text: t ? pad + t : '' });
      }
      continue;
    }
    const left = ascii(l.row[0]);
    const right = ascii(l.row[1]);
    const lefts = wrap(left, cols - pad.length).map(t => pad + t);
    const last = lefts.pop()!;
    for (const t of lefts) out.push({ ...style, text: t });
    if (last.length + 1 + right.length <= cols) out.push({ ...style, text: last + ' '.repeat(cols - last.length - right.length) + right });
    else out.push({ ...style, text: last }, { ...style, text: ' '.repeat(Math.max(0, cols - right.length)) + right });
  }
  return out;
}

const ESC = 0x1b;
/** Rows per GS v 0 command: small enough for cheap printers' buffers. */
const IMAGE_BAND = 64;

function rasterBytes(img: ReceiptLogo): number[] {
  const bits = Uint8Array.from(atob(img.bits), c => c.charCodeAt(0));
  const rowBytes = img.width / 8;
  const out: number[] = [];
  for (let y = 0; y < img.height; y += IMAGE_BAND) {
    const rows = Math.min(IMAGE_BAND, img.height - y);
    out.push(GS, 0x76, 0x30, 0, rowBytes & 0xff, rowBytes >> 8, rows & 0xff, rows >> 8);
    for (const b of bits.subarray(y * rowBytes, (y + rows) * rowBytes)) out.push(b);
  }
  return out;
}
const GS = 0x1d;
const ALIGN: Record<Align, number> = { left: 0, center: 1, right: 2 };

/** ESC/POS bytes: reset, the lines (sending only style changes), feed, cut. */
export function encode(lines: Line[], paper: PaperWidth): Uint8Array {
  const bytes: number[] = [ESC, 0x40];
  let state = { align: 'left' as Align, bold: false, big: false };
  for (const l of layout(lines, paper)) {
    if (l.align !== state.align) bytes.push(ESC, 0x61, ALIGN[l.align]);
    if (l.bold !== state.bold) bytes.push(ESC, 0x45, l.bold ? 1 : 0);
    if (l.big !== state.big) bytes.push(GS, 0x21, l.big ? 0x11 : 0);
    state = l;
    if (l.image) {
      bytes.push(...rasterBytes(l.image));
      continue;
    }
    for (const ch of l.text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  }
  bytes.push(ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x61, 0);
  bytes.push(ESC, 0x64, 4); // feed past the tear bar
  bytes.push(GS, 0x56, 0x42, 0); // partial cut (ignored by printers without a cutter)
  return Uint8Array.from(bytes);
}

/** Customer receipt; mirrors components/pos/print/Receipt.tsx. */
export function receiptLines(order: OrderDoc, setting: Snapshot['setting'], cashierName: string): Line[] {
  const tax = setting.tax;
  const where = [order.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in', order.table_no ? `Meja ${order.table_no}` : null, order.customer_name].filter(Boolean).join(' · ');
  const lines: Line[] = [];
  if (setting.receipt_logo) lines.push({ image: setting.receipt_logo });
  lines.push({ text: setting.cafe_name, align: 'center', bold: true });
  if (setting.address) lines.push({ text: setting.address, align: 'center' });
  if (setting.receipt_header) lines.push({ text: setting.receipt_header, align: 'center' });
  lines.push({ rule: true }, { text: dateTimeWIB(order.paid_at ?? order.created_at) }, { text: `No: ${order.code}` }, { text: `Kasir: ${cashierName}` }, { text: where }, { rule: true });
  for (const i of order.items) {
    lines.push({ text: i.name });
    if (i.options.length) lines.push({ text: i.options.map(o => o.name).join(', '), indent: 2 });
    if (i.note) lines.push({ text: `* ${i.note}`, indent: 2 });
    lines.push({ row: [`${i.qty} x ${formatRupiah(unitPrice(i))}`, formatRupiah(lineTotal(i))], indent: 2 });
  }
  lines.push({ rule: true }, { row: ['Subtotal', formatRupiah(order.subtotal)] });
  if (order.discount > 0) lines.push({ row: [order.promo_name ?? 'Diskon', `-${formatRupiah(order.discount)}`] });
  if (!tax.inclusive) lines.push({ row: [`${tax.name} ${tax.rate_bp / 100}%`, formatRupiah(order.tax)] });
  lines.push({ row: ['TOTAL', formatRupiah(order.total)], bold: true });
  if (tax.inclusive) lines.push({ row: [`${tax.name} ${tax.rate_bp / 100}% (termasuk)`, formatRupiah(order.tax)] });
  lines.push({ rule: true });
  if (order.payment_method) lines.push({ row: [METHOD[order.payment_method], formatRupiah(order.cash_received ?? order.total)] });
  if (order.change !== null) lines.push({ row: ['Kembali', formatRupiah(order.change)] });
  if (order.payment_ref) lines.push({ text: `Ref: ${order.payment_ref}` });
  if (order.refunds.length) {
    lines.push({ rule: true });
    for (const r of order.refunds) lines.push({ row: [`Refund (${r.method === 'cash' ? 'tunai' : 'non-tunai'})`, `-${formatRupiah(r.amount)}`] });
  }
  if (setting.receipt_footer) lines.push({ rule: true }, { text: setting.receipt_footer, align: 'center' });
  return lines;
}

/** Ticket for the bar; mirrors components/pos/print/BaristaTicket.tsx. */
export function ticketLines(order: OrderDoc): Line[] {
  const where = [order.order_type === 'takeaway' ? 'TAKEAWAY' : 'DINE-IN', order.table_no ? `Meja ${order.table_no}` : null].filter(Boolean).join(' · ');
  const lines: Line[] = [{ text: `#${String(order.number).padStart(3, '0')}`, align: 'center', bold: true, big: true }, { text: where, align: 'center', bold: true }];
  if (order.customer_name) lines.push({ text: order.customer_name, align: 'center', bold: true });
  lines.push({ text: dateTimeWIB(order.created_at), align: 'center' }, { rule: true });
  for (const i of order.items) {
    lines.push({ text: `${i.qty} x ${i.name}`, bold: true });
    if (i.options.length) lines.push({ text: i.options.map(o => o.name).join(', '), indent: 2 });
    if (i.note) lines.push({ text: `* ${i.note}`, indent: 2, bold: true });
  }
  return lines;
}

/** Closing report; mirrors components/pos/print/ShiftReport.tsx. */
export function shiftReportLines(closed: ClosedShift, setting: Snapshot['setting'], employees: SnapshotEmployee[]): Line[] {
  const name = (id: string) => employees.find(e => e.id === id)?.name ?? id;
  const s = closed.summary;
  const rp = formatRupiah;
  const lines: Line[] = [
    { text: setting.cafe_name, align: 'center', bold: true },
    { text: 'LAPORAN TUTUP KASIR', align: 'center', bold: true },
    { text: `Hari bisnis ${closed.shift.business_date}`, align: 'center' },
    { rule: true },
    { text: `Buka : ${dateTimeWIB(closed.shift.opened_at)}` }, { text: name(closed.shift.opened_by), indent: 8 },
    { text: `Tutup: ${dateTimeWIB(closed.closed_at)}` }, { text: name(closed.closed_by), indent: 8 },
    { rule: true },
    { text: `PENJUALAN (${s.transactions} transaksi)`, bold: true },
    { row: ['Tunai', rp(s.cash_sales)] }, { row: ['EDC', rp(s.edc_sales)] }, { row: ['QRIS', rp(s.qris_sales)] },
    { row: ['Total', rp(s.gross_sales)], bold: true },
  ];
  if (s.discounts > 0) lines.push({ row: ['Diskon promo', rp(s.discounts)] });
  lines.push({ row: [`${setting.tax.name} ${setting.tax.rate_bp / 100}%`, rp(s.tax)] }, { row: ['Bill dibatalkan', String(s.voids)] });
  if (s.refunds_cash > 0 || s.refunds_cashless > 0) lines.push({ row: ['Refund tunai', rp(s.refunds_cash)] }, { row: ['Refund non-tunai', rp(s.refunds_cashless)] });
  lines.push(
    { rule: true },
    { text: 'KAS LACI', bold: true },
    { row: ['Modal awal', rp(s.opening_float)] },
    { row: ['+ Penjualan tunai', rp(s.cash_sales)] },
    { row: ['+ Kas masuk', rp(s.paid_in)] },
    { row: ['- Kas keluar', rp(s.paid_out)] },
    { row: ['- Refund tunai', rp(s.refunds_cash)] },
    { row: ['Saldo seharusnya', rp(closed.expected)], bold: true },
    { rule: true },
    { text: 'UANG DIHITUNG', bold: true },
  );
  for (const d of DENOMINATIONS) {
    const n = closed.denominations.notes[String(d)];
    if (n) lines.push({ row: [`${d.toLocaleString('id-ID')} x ${n}`, rp(d * n)] });
  }
  if (closed.denominations.coins > 0) lines.push({ row: ['Koin', rp(closed.denominations.coins)] });
  lines.push({ row: ['Total dihitung', rp(closed.counted)], bold: true }, { rule: true }, { row: ['Selisih', varianceLabel(closed.variance)], bold: true });
  if (closed.note) lines.push({ text: `Catatan: ${closed.note}` });
  return lines;
}
