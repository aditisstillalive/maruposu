'use client';

import { useMemo, useState } from 'react';
import BillPanel, { emptyDraft, type Draft } from './BillPanel';
import CategoryRail from './CategoryRail';
import OpenBillsList from './OpenBillsList';
import OptionsDialog from './OptionsDialog';
import PaymentDialog from './PaymentDialog';
import PromoDialog, { promoNames } from './PromoDialog';
import ProductGrid from './ProductGrid';
import VoidDialog from './VoidDialog';
import { makeLine, mergeLine, setQty } from '@/lib/pos/cart';
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
  const [editing, setEditing] = useState<{ product: MenuProduct; line?: OrderItemDoc } | null>(null);
  const [voiding, setVoiding] = useState<OrderDoc | null>(null);
  const [chosenPromo, setChosenPromo] = useState<PromoRule | null>(null);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openBills = orders.filter(o => o.status === 'open');
  const products = useMemo(() => snapshot.products.filter(p => p.category_id === category), [snapshot.products, category]);
  // A chosen promo drops off when the bill no longer qualifies (items removed, hour passed)
  const promoCheck = chosenPromo ? promoAvailability(chosenPromo, draft.items, new Date()) : null;
  const promo = promoCheck?.ok ? chosenPromo : null;
  const totals = computeTotals(draft.items, promo, snapshot.setting.tax);
  const names = useMemo(() => promoNames(snapshot.categories, snapshot.products), [snapshot.categories, snapshot.products]);
  const reset = () => {
    setDraft(emptyDraft());
    setChosenPromo(null);
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
    setTab('bill');
    setError('');
  };

  return (
    <div className="flex min-h-0 flex-1">
      <CategoryRail categories={snapshot.categories} active={category} onPick={setCategory} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <ProductGrid products={products} onPick={pick} />
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
              chosenPromo ? (
                <div className="mb-1 flex items-center justify-between rounded-lg bg-brand-soft px-2 py-1.5">
                  <span>
                    <span className="block font-medium">{chosenPromo.name}</span>
                    {promoCheck && !promoCheck.ok && <span className="block text-xs text-amber-700">Tidak dipakai: {promoCheck.reason}</span>}
                  </span>
                  <button type="button" onClick={() => setChosenPromo(null)} className="text-xs text-gray-600 hover:text-black">Lepas</button>
                </div>
              ) : (
                <button type="button" disabled={!draft.items.length} onClick={() => setPicking(true)}
                  className="mb-1 h-9 w-full rounded-lg border border-dashed text-sm text-gray-600 disabled:opacity-40">Tambah promo</button>
              )
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
      {paying && (
        <PaymentDialog
          items={draft.items}
          promo={promo}
          tax={snapshot.setting.tax}
          cashierId={cashier.id}
          save={persist}
          onPaid={() => reset()}
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
