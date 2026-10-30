'use client';

import { Minus, Plus } from 'lucide-react';
import OrderMetaForm, { type OrderMeta } from './OrderMetaForm';
import { formatRupiah } from '@/lib/money';
import { lineTotal } from '@/lib/pos/pricing';
import type { OrderDoc, OrderItemDoc, Totals, TaxRule } from '@/lib/pos/types';

export type Draft = OrderMeta & { base: OrderDoc | null; items: OrderItemDoc[] };

export const emptyDraft = (): Draft => ({ base: null, order_type: 'dine_in', customer_name: '', table_no: '', items: [] });

export default function BillPanel({
  draft,
  totals,
  tax,
  promoSlot,
  busy,
  error,
  onMeta,
  onQty,
  onEditLine,
  onSave,
  onPay,
  onClear,
  onVoid,
}: {
  draft: Draft;
  totals: Totals;
  tax: TaxRule;
  promoSlot?: React.ReactNode;
  busy: boolean;
  error: string;
  onMeta: (m: OrderMeta) => void;
  onQty: (lineId: string, qty: number) => void;
  onEditLine: (line: OrderItemDoc) => void;
  onSave: () => void;
  onPay?: () => void;
  onClear: () => void;
  onVoid: () => void;
}) {
  const empty = draft.items.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{draft.base ? `Bill #${String(draft.base.number).padStart(3, '0')}` : 'Bill baru'}</span>
          {(draft.base || !empty) && (
            <button type="button" onClick={onClear} className="text-gray-500 hover:text-gray-900">{draft.base ? 'Tutup' : 'Kosongkan'}</button>
          )}
        </div>
        <OrderMetaForm meta={draft} onChange={onMeta} />
      </div>

      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {empty && <li className="p-6 text-center text-sm text-gray-400">Belum ada item</li>}
        {draft.items.map(line => (
          <li key={line.id} className="flex items-start gap-2 p-3">
            <button type="button" onClick={() => onEditLine(line)} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium">{line.name}</span>
              {line.options.length > 0 && <span className="block text-xs text-gray-500">{line.options.map(o => o.name).join(', ')}</span>}
              {line.note && <span className="block text-xs italic text-gray-500">{line.note}</span>}
              <span className="block text-sm tabular-nums text-gray-700">{formatRupiah(lineTotal(line))}</span>
            </button>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Kurangi ${line.name}`} onClick={() => onQty(line.id, line.qty - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border"><Minus className="h-4 w-4" /></button>
              <span className="w-7 text-center tabular-nums">{line.qty}</span>
              <button type="button" aria-label={`Tambah ${line.name}`} onClick={() => onQty(line.id, line.qty + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border"><Plus className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t p-3 text-sm">
        {promoSlot}
        <Row label="Subtotal" value={formatRupiah(totals.subtotal)} />
        {totals.discount > 0 && <Row label="Diskon" value={`-${formatRupiah(totals.discount)}`} />}
        <Row label={`${tax.name} ${tax.rate_bp / 100}%${tax.inclusive ? ' (termasuk)' : ''}`} value={formatRupiah(totals.tax)} muted />
        <div data-testid="bill-total" className="flex justify-between pt-1 text-lg font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatRupiah(totals.total)}</span>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-red-800">{error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {draft.base ? (
            <button type="button" onClick={onVoid} disabled={busy} className="col-span-2 h-10 rounded-xl text-sm text-red-700 hover:bg-red-50">Batalkan bill</button>
          ) : null}
          <button type="button" onClick={onSave} disabled={empty || busy} className="h-14 rounded-xl border bg-white font-medium disabled:opacity-40">Simpan bill</button>
          <button type="button" onClick={onPay} disabled={empty || busy || !onPay} className="h-14 rounded-xl bg-brand-strong font-medium text-white disabled:opacity-40">Bayar</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-gray-500' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
