'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import OptionsDialog from '@/components/pos/app/OptionsDialog';
import R2Photo from '@/components/R2Photo';
import { mergeLine, setQty } from '@/lib/pos/cart';
import { lineTotal } from '@/lib/pos/line';
import { computeTotals } from '@/lib/pos/pricing';
import { formatRupiah } from '@/lib/money';
import type { MenuProduct, OrderItemDoc, SnapshotCategory, TaxRule } from '@/lib/pos/types';

const lastOrderKey = (token: string) => `maraca-qr-order:${token}`;
const cartKey = (token: string) => `maraca-qr-cart:${token}`;

/** Menu, cart and checkout for a customer at a table (phone first). */
export default function QrMenu({ token, tableName, cafeName, open, tax, categories, products }: {
  token: string; tableName: string; cafeName: string; open: boolean; tax: TaxRule; categories: SnapshotCategory[]; products: MenuProduct[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<OrderItemDoc[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [lastOrder, setLastOrder] = useState<string | null>(null);
  const firstSave = useRef(true);

  useEffect(() => {
    try {
      setLastOrder(localStorage.getItem(lastOrderKey(token)));
      const saved = JSON.parse(sessionStorage.getItem(cartKey(token)) ?? '[]') as OrderItemDoc[];
      // Only lines whose product is still on the menu; prices are re-checked on submit anyway
      if (Array.isArray(saved)) setCart(saved.filter(l => products.some(p => p.id === l.product_id && !p.is_sold_out)));
    } catch {
      // private mode / bad data: start empty
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Phones drop background tabs: keep the cart for this table through a reload
  useEffect(() => {
    // The first run is the empty cart before the saved one is read back
    if (firstSave.current) { firstSave.current = false; return; }
    try {
      if (cart.length) sessionStorage.setItem(cartKey(token), JSON.stringify(cart));
      else sessionStorage.removeItem(cartKey(token));
    } catch {
      // fine without it
    }
  }, [cart, token]);

  // The page behind the cart sheet stays put
  useEffect(() => {
    if (!showCart) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showCart]);

  const byCategory = useMemo(() => categories.map(c => ({ ...c, products: products.filter(p => p.category_id === c.id) })).filter(c => c.products.length), [categories, products]);
  const totals = computeTotals(cart, null, tax);
  const count = cart.reduce((n, l) => n + l.qty, 0);

  const add = (p: MenuProduct) => {
    if (p.is_sold_out) return;
    setPicking(p);
  };

  const submit = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/t/${token}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim() || undefined,
          items: cart.map(l => ({ product_id: l.product_id, option_ids: l.options.map(o => o.option_id), qty: l.qty, note: l.note ?? undefined })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Pesanan gagal dikirim, coba lagi');
      try {
        localStorage.setItem(lastOrderKey(token), data.order_id);
        sessionStorage.removeItem(cartKey(token));
      } catch {
        // fine without it
      }
      router.push(`/t/${token}/o/${data.order_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pesanan gagal dikirim, coba lagi');
      setSending(false);
    }
  };

  return (
    <main className="mx-auto min-h-full w-full max-w-xl shrink-0 bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="min-w-0 truncate font-heading text-lg min-[360px]:text-xl">{cafeName}</h1>
          <span className="shrink-0 rounded-full bg-black px-3 py-1 text-sm font-medium text-white">Meja {tableName}</span>
        </div>
        {lastOrder && (
          <a href={`/t/${token}/o/${lastOrder}`} className="-my-2 inline-block py-3 text-sm text-gray-600 underline">Lihat pesanan saya</a>
        )}
        <nav aria-label="Kategori" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {byCategory.map(c => (
            <a key={c.id} href={`#cat-${c.id}`} className="flex h-11 shrink-0 items-center rounded-full border bg-white px-4 text-sm">{c.name}</a>
          ))}
        </nav>
      </header>

      {!open && (
        <p role="status" className="m-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Kasir belum buka. Menu bisa dilihat, pemesanan dibuka saat kasir buka.</p>
      )}

      {byCategory.map(c => (
        <section key={c.id} id={`cat-${c.id}`} aria-label={c.name} className="scroll-mt-32 px-4 pt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.name}</h2>
          <ul className="divide-y rounded-2xl border bg-white">
            {c.products.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} disabled={p.is_sold_out || !open} aria-label={`${p.name} ${formatRupiah(p.price)}${p.is_sold_out ? ' habis' : ''}`}
                  className="flex w-full scroll-mb-28 items-center gap-3 p-3 text-left disabled:opacity-50">
                  <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-lg text-gray-400">
                    {p.photo_url ? <R2Photo src={p.photo_url} sizes="64px" /> : p.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-sm text-gray-600">{formatRupiah(p.price)}</span>
                  </span>
                  {p.is_sold_out ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Habis</span>
                  ) : open ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white"><Plus className="h-4 w-4" /></span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {count > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl p-4">
          <button type="button" onClick={() => setShowCart(true)} className="flex h-14 w-full items-center justify-between rounded-2xl bg-black px-5 text-white shadow-lg">
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Lihat pesanan ({count})</span>
            <span className="font-semibold tabular-nums">{formatRupiah(totals.total)}</span>
          </button>
        </div>
      )}

      {showCart && (
        <div role="dialog" aria-modal="true" aria-label="Pesanan" className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40">
          <div className="mx-auto max-h-[90vh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-4 supports-[height:100dvh]:max-h-[90dvh]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pesanan · Meja {tableName}</h2>
              <button type="button" onClick={() => setShowCart(false)} aria-label="Tutup" className="-mr-2 flex h-11 w-11 items-center justify-center"><X className="h-5 w-5" /></button>
            </div>
            <ul className="divide-y">
              {cart.map(l => (
                <li key={l.id} className="flex items-start gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{l.name}</span>
                    {l.options.length > 0 && <span className="block text-xs text-gray-500">{l.options.map(o => o.name).join(', ')}</span>}
                    {l.note && <span className="block text-xs italic text-gray-500">{l.note}</span>}
                    <span className="block text-sm tabular-nums">{formatRupiah(lineTotal(l))}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button type="button" aria-label={`Kurangi ${l.name}`} onClick={() => setCart(c => setQty(c, l.id, l.qty - 1))} className="flex h-11 w-11 items-center justify-center rounded-full border"><Minus className="h-4 w-4" /></button>
                    <span className="w-6 text-center tabular-nums">{l.qty}</span>
                    <button type="button" aria-label={`Tambah ${l.name}`} onClick={() => setCart(c => setQty(c, l.id, Math.min(20, l.qty + 1)))} className="flex h-11 w-11 items-center justify-center rounded-full border"><Plus className="h-4 w-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
            {cart.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Pesanan kosong.</p>}
            <div className="mt-2 space-y-1 border-t pt-3 text-sm">
              {!tax.inclusive && <p className="flex justify-between text-gray-600"><span>{tax.name} {tax.rate_bp / 100}%</span><span className="tabular-nums">{formatRupiah(totals.tax)}</span></p>}
              <p className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatRupiah(totals.total)}</span></p>
              {tax.inclusive && <p className="text-xs text-gray-500">Sudah termasuk {tax.name} {tax.rate_bp / 100}%</p>}
            </div>
            <label className="mt-4 block space-y-1">
              <span className="text-sm font-medium">Nama (opsional)</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Supaya mudah dipanggil"
                className="h-12 w-full rounded-xl border px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            </label>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            <button type="button" onClick={submit} disabled={!cart.length || sending || !open}
              className="mt-4 h-14 w-full rounded-2xl bg-black text-lg font-medium text-white disabled:opacity-40">
              {sending ? 'Mengirim…' : `Kirim pesanan · ${formatRupiah(totals.total)}`}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">Pembayaran di kasir. Pesanan dibuat setelah dibayar.</p>
          </div>
        </div>
      )}

      {picking && (
        <OptionsDialog product={picking} confirmLabel="Tambah" maxQty={20} noteMax={120} onClose={() => setPicking(null)}
          onConfirm={line => { setCart(c => mergeLine(c, line).map(l => ({ ...l, qty: Math.min(20, l.qty) }))); setPicking(null); }} />
      )}
    </main>
  );
}
