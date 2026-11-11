'use client';

import { useMemo, useState } from 'react';
import BillPanel, { emptyDraft, type Draft } from './BillPanel';
import CategoryRail from './CategoryRail';
import OpenBillsList from './OpenBillsList';
import QrAlerts from './QrAlerts';
import { printTicket } from '@/components/pos/print/print';
import OptionsDialog from './OptionsDialog';
import PaymentDialog from './PaymentDialog';
import PromoDialog, { promoNames } from './PromoDialog';
import VoucherDialog from './VoucherDialog';
import { tillVoucher } from '@/lib/vouchers/till';
import ProductGrid from './ProductGrid';
import VoidDialog from './VoidDialog';
import { Search, X } from 'lucide-react';
import { makeLine, mergeLine, setQty } from '@/lib/pos/cart';
import { searchProducts } from '@/lib/pos/search';
import { salesSoFar } from '@/lib/pos/shift';
import { formatRupiah } from '@/lib/money';
import { computeTotals } from '@/lib/pos/pricing';
import { promoAvailability } from '@/lib/pos/promo';
import { newOrder, saveOrder, voidOrder } from '@/lib/pos/client/actions';
import type { MenuProduct, OrderDoc, OrderItemDoc, PromoRule, Snapshot, SnapshotEmployee } from '@/lib/pos/types';

/**
 * The selling screen: categories | products | bill. The bill being built is
 * local React state until "Simpan bill" or "Bayar" writes it to the tablet DB.
 */
export default function OrderScreen({
  snapshot,
  cashier,
  orders,
  paidActions,
}: {
  snapshot: Snapshot;
  cashier: SnapshotEmployee;
  orders: OrderDoc[];
  paidActions?: (order: OrderDoc) => React.ReactNode;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState<'bill' | 'open'>('bill');
  const [category, setCategory] = useState<string | null>(snapshot.categories[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ product: MenuProduct; line?: OrderItemDoc } | null>(null);
  const [voiding, setVoiding] = useState<OrderDoc | null>(null);
  const [chosenPromo, setChosenPromo] = useState<PromoRule | null>(null);
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [typingVoucher, setTypingVoucher] = useState(false);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openBills = orders.filter(o => o.status === 'open');
  const sales = salesSoFar(orders);
  const searching = query.trim() !== '';
  const products = useMemo(
    () => (searching ? searchProducts(snapshot.products, query) : snapshot.products.filter(p => p.category_id === category)),
    [snapshot.products, category, query, searching]
  );
  // A chosen promo drops off when the bill no longer qualifies (items removed, hour passed)
  const promoCheck = chosenPromo ? promoAvailability(chosenPromo, draft.items, new Date()) : null;
  const promo = promoCheck?.ok ? chosenPromo : null;
  // The voucher comes off after the promo, so it's checked against what the promo left
  const beforeVoucher = computeTotals(draft.items, promo, snapshot.setting.tax);
  const afterPromo = beforeVoucher.subtotal - beforeVoucher.discount;
  const voucherCheck = voucherCode ? tillVoucher(snapshot.vouchers, voucherCode, afterPromo, new Date()) : null;
  const voucher = voucherCheck?.check.ok ? { code: voucherCheck.code!, rule: voucherCheck.rule! } : null;
  const totals = voucher ? computeTotals(draft.items, promo, snapshot.setting.tax, voucher.rule) : beforeVoucher;
  const names = useMemo(() => promoNames(snapshot.categories, snapshot.products), [snapshot.categories, snapshot.products]);
  const reset = () => {
    setDraft(emptyDraft());
    setChosenPromo(null);
    setVoucherCode(null);
  };
  const productById = (id: string) => snapshot.products.find(p => p.id === id);

  const pick = (product: MenuProduct) => {
    setError('');
    if (product.groups.length) setEditing({ product });
    else setDraft(d => ({ ...d, items: mergeLine(d.items, makeLine(product, {}, 1, '')) }));
  };

  const editLine = (line: OrderItemDoc) => {
    const product = productById(line.product_id);
    if (product) setEditing({ product, line });
  };

  const confirmLine = (line: OrderItemDoc) => {
    setDraft(d => ({
      ...d,
      items: editing?.line ? d.items.map(i => (i.id === line.id ? line : i)) : mergeLine(d.items, line),
    }));
    setEditing(null);
  };

  /** Writes the draft to the tablet DB (creating the bill on first save). */
  const persist = async (): Promise<OrderDoc> => {
    const meta = {
      order_type: draft.order_type,
      customer_name: draft.customer_name.trim() || null,
      table_no: draft.order_type === 'dine_in' ? draft.table_no.trim() || null : null,
    };
    const base = draft.base ?? (await newOrder({ ...meta, created_by: cashier.id }));
    return saveOrder({ ...base, ...meta, items: draft.items });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await persist();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const open = (o: OrderDoc) => {
    setDraft({ base: o, order_type: o.order_type, customer_name: o.customer_name ?? '', table_no: o.table_no ?? '', items: o.items });
    setChosenPromo(null);
    setVoucherCode(null);
    setTab('bill');
    setError('');
  };

  return (
    <div className="flex min-h-0 flex-1">
      <QrAlerts orders={orders} onOpen={open} />
      <CategoryRail categories={snapshot.categories} active={searching ? null : category} onPick={id => { setCategory(id); setQuery(''); }} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex gap-2 bg-gray-50 px-3 pt-3">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3 focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Escape' && setQuery('')}
              onFocus={e => e.target.select()} placeholder="Cari menu…" aria-label="Cari menu" enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden" />
            {searching && (
              <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')} className="-mr-2 flex h-11 w-11 items-center justify-center text-gray-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          {/* This shift's net sales (all methods, less refunds); the closing screen replaces this one, so the count stays blind */}
          <span data-testid="sales-today" title={`${sales.bills} bill`} className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-green-50 px-3 text-sm text-green-900">
            Hari ini <span className="font-semibold tabular-nums">{formatRupiah(sales.total)}</span>
          </span>
        </div>
        {searching && !products.length ? (
          <p className="p-8 text-center text-sm text-gray-500">Tidak ada menu &ldquo;{query.trim()}&rdquo;</p>
        ) : (
          <ProductGrid products={products} onPick={pick} />
        )}
      </div>
      <aside data-testid="bill-panel" className="flex w-[380px] shrink-0 flex-col border-l bg-white">
        <div role="tablist" className="grid grid-cols-2 border-b text-sm font-medium">
          <button type="button" role="tab" aria-selected={tab === 'bill'} onClick={() => setTab('bill')}
            className={`h-11 ${tab === 'bill' ? 'border-b-2 border-black' : 'text-gray-500'}`}>Bill</button>
          <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}
            className={`h-11 ${tab === 'open' ? 'border-b-2 border-black' : 'text-gray-500'}`}>Open bill ({openBills.length})</button>
        </div>
        {tab === 'bill' ? (
          <BillPanel
            draft={draft}
            totals={totals}
            tax={snapshot.setting.tax}
            promoSlot={
              <>
                {chosenPromo && (
                  <div className="mb-1 flex items-center justify-between rounded-lg bg-brand-soft px-2 py-1.5">
                    <span>
                      <span className="block font-medium">{chosenPromo.name}</span>
                      {promoCheck && !promoCheck.ok && <span className="block text-xs text-amber-700">Tidak dipakai: {promoCheck.reason}</span>}
                    </span>
                    <button type="button" onClick={() => setChosenPromo(null)} className="text-xs text-gray-600 hover:text-black">Lepas</button>
                  </div>
                )}
                {voucherCode && (
                  <div data-testid="voucher-chip" className="mb-1 flex items-center justify-between rounded-lg bg-brand-soft px-2 py-1.5">
                    <span>
                      <span className="block font-mono font-medium">Voucher {voucherCode}</span>
                      {voucherCheck && !voucherCheck.check.ok && <span className="block text-xs text-amber-700">Tidak dipakai: {voucherCheck.check.reason}</span>}
                    </span>
                    <button type="button" onClick={() => setVoucherCode(null)} className="text-xs text-gray-600 hover:text-black">Lepas</button>
                  </div>
                )}
                {(!chosenPromo || !voucherCode) && (
                  <div className="mb-1 flex gap-2">
                    {!chosenPromo && (
                      <button type="button" disabled={!draft.items.length} onClick={() => setPicking(true)}
                        className="h-9 flex-1 rounded-lg border border-dashed text-sm text-gray-600 disabled:opacity-40">Tambah promo</button>
                    )}
                    {!voucherCode && (
                      <button type="button" disabled={!draft.items.length} onClick={() => setTypingVoucher(true)}
                        className="h-9 flex-1 rounded-lg border border-dashed text-sm text-gray-600 disabled:opacity-40">Voucher</button>
                    )}
                  </div>
                )}
              </>
            }
            busy={busy}
            error={error}
            onMeta={m => setDraft(d => ({ ...d, ...m }))}
            onQty={(id, qty) => setDraft(d => ({ ...d, items: setQty(d.items, id, qty) }))}
            onEditLine={editLine}
            onSave={save}
            onPay={() => { setError(''); setPaying(true); }}
            onClear={reset}
            onVoid={() => draft.base && setVoiding(draft.base)}
          />
        ) : (
          <OpenBillsList orders={openBills} tax={snapshot.setting.tax} onOpen={open} onVoid={setVoiding} />
        )}
      </aside>

      {editing && (
        <OptionsDialog
          product={editing.product}
          line={editing.line}
          onConfirm={confirmLine}
          onRemove={editing.line ? () => { setDraft(d => ({ ...d, items: d.items.filter(i => i.id !== editing.line!.id) })); setEditing(null); } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {picking && (
        <PromoDialog
          promos={snapshot.promos}
          lines={draft.items}
          names={names}
          onPick={p => { setChosenPromo(p); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
      {typingVoucher && (
        <VoucherDialog
          vouchers={snapshot.vouchers}
          subtotal={afterPromo}
          onPick={code => { setVoucherCode(code); setTypingVoucher(false); }}
          onClose={() => setTypingVoucher(false)}
        />
      )}
      {paying && (
        <PaymentDialog
          items={draft.items}
          promo={promo}
          voucher={voucher}
          tax={snapshot.setting.tax}
          cashierId={cashier.id}
          save={persist}
          onPaid={order => {
            // A table's QR order goes to the bar as soon as it's paid
            if (order.source === 'qr') void printTicket(order);
            reset();
          }}
          onClose={() => setPaying(false)}
          paidActions={paidActions}
        />
      )}
      {voiding && (
        <VoidDialog
          code={`#${String(voiding.number).padStart(3, '0')}`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidOrder(voiding.id, reason, cashier.id);
            if (draft.base?.id === voiding.id) reset();
            setVoiding(null);
          }}
        />
      )}
    </div>
  );
}
