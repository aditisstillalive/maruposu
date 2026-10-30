'use client';

import { useMemo, useState } from 'react';
import BillPanel, { emptyDraft, type Draft } from './BillPanel';
import CategoryRail from './CategoryRail';
import OpenBillsList from './OpenBillsList';
import OptionsDialog from './OptionsDialog';
import ProductGrid from './ProductGrid';
import VoidDialog from './VoidDialog';
import { makeLine, mergeLine, setQty } from '@/lib/pos/cart';
import { computeTotals } from '@/lib/pos/pricing';
import { newOrder, saveOrder, voidOrder } from '@/lib/pos/client/actions';
import type { MenuProduct, OrderDoc, OrderItemDoc, PromoRule, Snapshot, SnapshotEmployee } from '@/lib/pos/types';

export type PayRequest = { draft: Draft; save: () => Promise<OrderDoc>; promo: PromoRule | null; reset: () => void };

/**
 * The selling screen: categories | products | bill. The bill being built is
 * local React state until "Simpan bill" or "Bayar" writes it to the tablet DB.
 */
export default function OrderScreen({
  snapshot,
  cashier,
  orders,
  promo = null,
  promoSlot,
  onPay,
}: {
  snapshot: Snapshot;
  cashier: SnapshotEmployee;
  orders: OrderDoc[];
  promo?: PromoRule | null;
  promoSlot?: (draft: Draft) => React.ReactNode;
  onPay?: (req: PayRequest) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState<'bill' | 'open'>('bill');
  const [category, setCategory] = useState<string | null>(snapshot.categories[0]?.id ?? null);
  const [editing, setEditing] = useState<{ product: MenuProduct; line?: OrderItemDoc } | null>(null);
  const [voiding, setVoiding] = useState<OrderDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openBills = orders.filter(o => o.status === 'open');
  const products = useMemo(() => snapshot.products.filter(p => p.category_id === category), [snapshot.products, category]);
  const totals = computeTotals(draft.items, promo, snapshot.setting.tax);
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
      setDraft(emptyDraft());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const open = (o: OrderDoc) => {
    setDraft({ base: o, order_type: o.order_type, customer_name: o.customer_name ?? '', table_no: o.table_no ?? '', items: o.items });
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
            promoSlot={promoSlot?.(draft)}
            busy={busy}
            error={error}
            onMeta={m => setDraft(d => ({ ...d, ...m }))}
            onQty={(id, qty) => setDraft(d => ({ ...d, items: setQty(d.items, id, qty) }))}
            onEditLine={editLine}
            onSave={save}
            onPay={onPay && (() => onPay({ draft, save: persist, promo, reset: () => setDraft(emptyDraft()) }))}
            onClear={() => setDraft(emptyDraft())}
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
      {voiding && (
        <VoidDialog
          code={`#${String(voiding.number).padStart(3, '0')}`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidOrder(voiding.id, reason, cashier.id);
            if (draft.base?.id === voiding.id) setDraft(emptyDraft());
            setVoiding(null);
          }}
        />
      )}
    </div>
  );
}
