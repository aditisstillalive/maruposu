import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatRupiah } from '@/lib/money';
import PageHeader from '@/components/admin/PageHeader';
import PurchaseForm from './purchase-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stok Masuk | Admin' };

const timeWIB = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function PurchasesPage() {
  const outlet = await getCurrentOutlet();
  const [ingredients, purchases] = await Promise.all([
    prisma.ingredient.findMany({ where: { outlet_id: outlet.id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, purchase_unit: true, purchase_size: true } }),
    prisma.purchase.findMany({ where: { outlet_id: outlet.id }, orderBy: { created_at: 'desc' }, take: 50, include: { items: true } }),
  ]);
  const name = (id: string) => ingredients.find(i => i.id === id)?.name ?? '?';
  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">← Inventaris</Link>
      <PageHeader title="Stok Masuk" description="Catat pembelian/penerimaan bahan. Stok bertambah dan harga rata-rata diperbarui." />
      <PurchaseForm ingredients={ingredients} />
      <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">Riwayat</h2>
      {purchases.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada stok masuk.</p> : (
        <ul className="divide-y rounded-xl border bg-white text-sm">
          {purchases.map(p => (
            <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5">
              <span>
                <span className="block font-medium">{timeWIB(p.created_at)}{p.supplier ? ` · ${p.supplier}` : ''}</span>
                <span className="block text-xs text-muted-foreground">{p.items.map(i => `${name(i.ingredient_id)} ${i.qty.toLocaleString('id-ID')}`).join(', ')}{p.note ? ` · ${p.note}` : ''} · {p.created_by}</span>
              </span>
              <span className="tabular-nums">{formatRupiah(p.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
