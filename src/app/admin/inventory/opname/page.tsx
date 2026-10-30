import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatRupiah } from '@/lib/money';
import PageHeader from '@/components/admin/PageHeader';
import OpnameForm from './opname-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stok Opname | Admin' };

const timeWIB = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function OpnamePage() {
  const outlet = await getCurrentOutlet();
  const [ingredients, opnames] = await Promise.all([
    prisma.ingredient.findMany({ where: { outlet_id: outlet.id, is_active: true }, orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, purchase_unit: true, purchase_size: true, stock: true, avg_cost_milli: true } }),
    prisma.stockOpname.findMany({ where: { outlet_id: outlet.id }, orderBy: { created_at: 'desc' }, take: 30, include: { lines: true } }),
  ]);
  const all = await prisma.ingredient.findMany({ where: { outlet_id: outlet.id }, select: { id: true, name: true, unit: true, avg_cost_milli: true } });
  const ing = (id: string) => all.find(i => i.id === id);
  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">← Inventaris</Link>
      <PageHeader title="Stok Opname" description="Isi stok fisik bahan yang dihitung (boleh sebagian). Selisih dihitung dari stok sistem saat disimpan." />
      <OpnameForm ingredients={ingredients} />
      <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">Riwayat opname</h2>
      {opnames.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada opname.</p> : (
        <ul className="divide-y rounded-xl border bg-white text-sm">
          {opnames.map(o => {
            const value = o.lines.reduce((s, l) => s + (l.diff * (ing(l.ingredient_id)?.avg_cost_milli ?? 0)) / 1000, 0);
            const changed = o.lines.filter(l => l.diff !== 0);
            return (
              <li key={o.id} className="px-4 py-2.5">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{timeWIB(o.created_at)} · {o.lines.length} bahan{o.note ? ` · ${o.note}` : ''}</span>
                  <span className={`tabular-nums ${value < 0 ? 'text-red-700' : ''}`}>{formatRupiah(Math.round(value))}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {changed.length ? changed.map(l => `${ing(l.ingredient_id)?.name} ${l.diff > 0 ? '+' : ''}${l.diff.toLocaleString('id-ID')} ${ing(l.ingredient_id)?.unit}`).join(', ') : 'Tidak ada selisih'} · {o.created_by}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
