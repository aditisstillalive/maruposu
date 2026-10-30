import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatRupiah } from '@/lib/money';
import PageHeader from '@/components/admin/PageHeader';
import IngredientManager from './ingredient-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventaris | Admin' };

export default async function InventoryPage() {
  const outlet = await getCurrentOutlet();
  const ingredients = await prisma.ingredient.findMany({ where: { outlet_id: outlet.id }, orderBy: [{ is_active: 'desc' }, { name: 'asc' }] });
  const value = ingredients.reduce((s, i) => s + Math.max(i.stock, 0) * i.avg_cost_milli, 0) / 1000;
  const link = 'rounded-lg border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50';
  return (
    <div className="p-4 md:p-8">
      <IngredientManager
        ingredients={ingredients.map(i => ({
          id: i.id, name: i.name, unit: i.unit as 'g' | 'ml' | 'pcs', purchase_unit: i.purchase_unit, purchase_size: i.purchase_size,
          stock: i.stock, avg_cost_milli: i.avg_cost_milli, min_stock: i.min_stock, is_active: i.is_active,
        }))}
      >
        <PageHeader title="Inventaris" description={`Bahan baku, stok, dan harga rata-rata. Nilai persediaan ${formatRupiah(Math.round(value))}.`}>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/inventory/purchases" className={link}>Stok Masuk</Link>
            <Link href="/admin/inventory/opname" className={link}>Stok Opname</Link>
            <Link href="/admin/inventory/waste" className={link}>Waste</Link>
          </div>
        </PageHeader>
      </IngredientManager>
    </div>
  );
}
