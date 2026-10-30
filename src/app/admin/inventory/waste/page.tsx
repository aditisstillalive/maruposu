import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatRupiah } from '@/lib/money';
import { WASTE_LABEL } from '@/lib/pos/waste-labels';
import PageHeader from '@/components/admin/PageHeader';
import WasteForm from './waste-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Waste | Admin' };

const timeWIB = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function WastePage() {
  const outlet = await getCurrentOutlet();
  const [ingredients, products, wastes, employees] = await Promise.all([
    prisma.ingredient.findMany({ where: { outlet_id: outlet.id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true } }),
    prisma.product.findMany({ where: { category: { outlet_id: outlet.id }, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.waste.findMany({ where: { outlet_id: outlet.id }, orderBy: { created_at: 'desc' }, take: 50, include: { lines: true } }),
    prisma.employee.findMany({ where: { outlet_id: outlet.id }, select: { id: true, name: true } }),
  ]);
  const who = (actor: string) => (actor.startsWith('employee:') ? employees.find(e => `employee:${e.id}` === actor)?.name ?? actor : actor);
  const unit = (l: { ingredient_id: string | null }) => (l.ingredient_id ? ingredients.find(i => i.id === l.ingredient_id)?.unit ?? '' : 'porsi');
  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">← Inventaris</Link>
      <PageHeader title="Waste" description="Bahan atau produk yang rusak, kadaluarsa, salah buat, atau tumpah. Waste produk memotong bahan resepnya." />
      <WasteForm ingredients={ingredients} products={products} />
      <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">Riwayat waste</h2>
      {wastes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada waste.</p> : (
        <ul className="divide-y rounded-xl border bg-white text-sm">
          {wastes.map(w => (
            <li key={w.id} className="flex justify-between gap-3 px-4 py-2.5">
              <span>
                <span className="block font-medium">{w.lines.map(l => `${l.name} ${l.qty.toLocaleString('id-ID')} ${unit(l)}`).join(', ')}</span>
                <span className="block text-xs text-muted-foreground">
                  {timeWIB(w.created_at)} · {WASTE_LABEL[w.reason]}{w.note ? ` · ${w.note}` : ''} · {w.source === 'tablet' ? 'tablet' : 'admin'} · {who(w.actor)}
                </span>
              </span>
              <span className="tabular-nums">{formatRupiah(w.cost)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
