'use client';

import { useState } from 'react';
import { formatRupiah } from '@/lib/money';
import type { MenuProduct } from '@/lib/pos/types';
import R2Photo from '@/components/R2Photo';

function Photo({ product }: { product: MenuProduct }) {
  const [failed, setFailed] = useState(false);
  if (product.photo_url && !failed) {
    // Tiles are ~230px wide on the tablet (3–4 columns)
    return <R2Photo src={product.photo_url} sizes="240px" onError={() => setFailed(true)} />;
  }
  const initials = product.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return <span className="text-2xl font-light text-gray-400">{initials}</span>;
}

export default function ProductGrid({ products, onPick }: { products: MenuProduct[]; onPick: (p: MenuProduct) => void }) {
  if (!products.length) return <p className="p-8 text-center text-sm text-gray-500">Belum ada produk di kategori ini.</p>;
  return (
    <div className="grid grid-cols-3 gap-3 p-3 xl:grid-cols-4">
      {products.map(p => (
        <button key={p.id} type="button" disabled={p.is_sold_out} onClick={() => onPick(p)}
          aria-label={`${p.name} ${formatRupiah(p.price)}${p.is_sold_out ? ' habis' : ''}`}
          className="relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-colors hover:border-gray-400 active:bg-brand-soft disabled:opacity-50">
          <span className="relative flex aspect-[4/3] min-h-28 items-center justify-center bg-gray-100"><Photo product={p} /></span>
          <span className="flex flex-1 flex-col gap-0.5 p-3">
            <span className="text-sm font-medium leading-tight">{p.name}</span>
            <span className="text-sm text-gray-500 tabular-nums">{formatRupiah(p.price)}</span>
          </span>
          {p.is_sold_out && <span className="absolute left-2 top-2 rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white">Habis</span>}
        </button>
      ))}
    </div>
  );
}
