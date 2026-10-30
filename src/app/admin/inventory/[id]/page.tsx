import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatStock, unitPriceLabel } from '@/lib/pos/inventory';
import { MOVE_LABEL } from '@/lib/pos/waste-labels';
import PageHeader from '@/components/admin/PageHeader';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kartu stok | Admin' };

const DAY_MS = 24 * 60 * 60 * 1000;
const timeWIB = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function StockCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getCurrentOutlet();
  const ingredient = await prisma.ingredient.findFirst({ where: { id, outlet_id: outlet.id } });
  if (!ingredient) notFound();
  const [moves, employees] = await Promise.all([
    prisma.stockMovement.findMany({ where: { ingredient_id: id, created_at: { gte: new Date(Date.now() - 30 * DAY_MS) } }, orderBy: { created_at: 'desc' }, take: 500 }),
    prisma.employee.findMany({ where: { outlet_id: outlet.id }, select: { id: true, name: true } }),
  ]);
  const who = (actor: string) => (actor.startsWith('employee:') ? employees.find(e => `employee:${e.id}` === actor)?.name ?? actor : actor);
  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">← Inventaris</Link>
      <PageHeader
        title={`Kartu stok · ${ingredient.name}`}
        description={`Stok ${formatStock(ingredient.stock, ingredient)} · harga rata-rata ${ingredient.avg_cost_milli ? unitPriceLabel(ingredient.avg_cost_milli, ingredient) : '-'} · 30 hari terakhir`}
      />
      {moves.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada pergerakan.</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3">Waktu</th><th className="p-3">Jenis</th><th className="p-3">Keterangan</th>
                <th className="p-3 text-right">Jumlah</th><th className="p-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {moves.map(m => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3 tabular-nums">{timeWIB(m.created_at)}</td>
                  <td className="p-3">{MOVE_LABEL[m.kind] ?? m.kind}</td>
                  <td className="p-3 text-muted-foreground">{[m.note, who(m.actor)].filter(Boolean).join(' · ')}</td>
                  <td className={`p-3 text-right tabular-nums ${m.qty < 0 ? 'text-red-700' : 'text-green-700'}`}>{m.qty > 0 ? '+' : ''}{m.qty.toLocaleString('id-ID')} {ingredient.unit}</td>
                  <td className="p-3 text-right tabular-nums">{m.balance.toLocaleString('id-ID')} {ingredient.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
