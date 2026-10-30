'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** "Semua transaksi" or one product, kept in `?product=` next to the period. */
export default function ProductSelect({ products, value }: { products: { key: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor="peak-product" className="block text-muted-foreground">Tampilkan</label>
      <select
        id="peak-product"
        value={value}
        onChange={e => {
          const q = new URLSearchParams(sp.toString());
          if (e.target.value) q.set('product', e.target.value);
          else q.delete('product');
          router.push(`${pathname}?${q}`);
        }}
        className="h-8 rounded-lg border bg-white px-2"
      >
        <option value="">Semua transaksi</option>
        {products.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
    </div>
  );
}
