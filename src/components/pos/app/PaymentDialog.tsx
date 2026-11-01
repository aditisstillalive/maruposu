'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NumPadDisplay, NumPadKeys, NumPadQuick } from './NumPad';
import { formatRupiah } from '@/lib/money';
import { cashSuggestions } from '@/lib/pos/cash';
import { computeTotals, validatePayment } from '@/lib/pos/pricing';
import { payOrder } from '@/lib/pos/client/actions';
import type { OrderDoc, OrderItemDoc, PaymentMethod, PromoRule, TaxRule } from '@/lib/pos/types';

const METHODS: [PaymentMethod, string][] = [['cash', 'Tunai'], ['edc', 'EDC'], ['qris', 'QRIS']];

/**
 * Takes payment for the bill: saves it first (so pay-first bills exist too),
 * then records the payment. Ends on a "Lunas" screen with the change.
 */
export default function PaymentDialog({
  items,
  promo,
  tax,
  cashierId,
  save,
  onPaid,
  onClose,
  paidActions,
}: {
  items: OrderItemDoc[];
  promo: PromoRule | null;
  tax: TaxRule;
  cashierId: string;
  save: () => Promise<OrderDoc>;
  onPaid: (order: OrderDoc) => void;
  onClose: () => void;
  paidActions?: (order: OrderDoc) => React.ReactNode;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cash, setCash] = useState<number | null>(null);
  const [ref, setRef] = useState('');
  const [paid, setPaid] = useState<OrderDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const totals = computeTotals(items, promo, tax);
  const invalid = validatePayment(method, totals.total, cash);
  const change = method === 'cash' && cash !== null ? cash - totals.total : null;

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const order = await save();
      const done = await payOrder(order.id, {
        method, cash_received: method === 'cash' ? cash : null, payment_ref: ref.trim() || null, employee_id: cashierId, promo,
      });
      setPaid(done);
      onPaid(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pembayaran gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className={`max-h-[95vh] overflow-y-auto ${paid ? 'sm:max-w-lg' : 'sm:max-w-3xl'}`}>
        {paid ? (
          <div className="space-y-5 py-2 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12" />
            <DialogTitle className="text-2xl font-light">Lunas</DialogTitle>
            <p className="text-sm text-gray-500">Bill #{String(paid.number).padStart(3, '0')} · {formatRupiah(paid.total)} · {METHODS.find(m => m[0] === paid.payment_method)?.[1]}</p>
            {paid.change !== null && (
              <div>
                <p className="text-sm text-gray-500">Kembalian</p>
                <p data-testid="change" className="text-4xl font-light tabular-nums">{formatRupiah(paid.change)}</p>
              </div>
            )}
            <div className="grid gap-2">
              {paidActions?.(paid)}
              <button type="button" onClick={onClose} className="h-14 rounded-xl bg-brand-strong text-lg font-medium text-white">Order baru</button>
            </div>
          </div>
        ) : (
          <>
            {/* Title and method on one row; cash in two columns: fits a tablet in landscape without scrolling */}
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <DialogHeader><DialogTitle>Bayar {formatRupiah(totals.total)}</DialogTitle></DialogHeader>
              <div role="tablist" className="grid w-full grid-cols-3 overflow-hidden rounded-xl border sm:w-72">
                {METHODS.map(([m, label]) => (
                  <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m)}
                    className={`h-10 text-sm font-medium ${method === m ? 'bg-brand-strong text-white' : 'bg-white'}`}>{label}</button>
                ))}
              </div>
            </div>
            {method === 'cash' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <button type="button" onClick={() => setCash(totals.total)} className="h-11 w-full rounded-lg border bg-white text-sm font-medium hover:bg-gray-50">
                    Uang pas · {formatRupiah(totals.total)}
                  </button>
                  <NumPadDisplay value={cash} compact />
                  <NumPadQuick onChange={setCash} quick={cashSuggestions(totals.total)} columns={2} />
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-sm text-gray-500">Kembalian</span>
                    <span data-testid="change" className={`text-2xl tabular-nums ${change !== null && change < 0 ? 'text-red-700' : ''}`}>
                      {change === null ? '-' : formatRupiah(change)}
                    </span>
                  </div>
                </div>
                <NumPadKeys value={cash} onChange={setCash} compact />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Pastikan pembayaran {method === 'edc' ? 'di mesin EDC' : 'QRIS'} sudah berhasil sebelum menekan Bayar.</p>
                <input aria-label="No. referensi" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} placeholder="No. referensi (opsional)"
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
              </div>
            )}
            {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            <button type="button" onClick={pay} disabled={!!invalid || busy}
              className="h-12 rounded-xl bg-brand-strong text-lg font-medium text-white disabled:opacity-40">
              Bayar {formatRupiah(totals.total)}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
