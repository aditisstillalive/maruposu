import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { readDb } from '@/lib/db-router';
import { getCurrentOutlet } from '@/lib/outlet';
import { formatRupiah } from '@/lib/money';
import { businessDateWIB } from '@/lib/pos/codes';
import { isLow } from '@/lib/pos/inventory';
import { byDay, byPayment, byProduct, summary } from '@/lib/reports/aggregate';
import { loadReportData } from '@/lib/reports/load';
import { periodFromParams } from '@/lib/reports/params';
import { previousPeriod } from '@/lib/reports/period';
import PageHeader from '@/components/admin/PageHeader';
import PeriodPicker from '@/components/admin/reports/PeriodPicker';
import KpiTile from '@/components/admin/reports/KpiTile';
import DailyChart from '@/components/admin/reports/DailyChart';
import PaymentMix from '@/components/admin/reports/PaymentMix';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard | Admin' };

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '0%');

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { preset, period } = periodFromParams(await searchParams, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const [data, prev, ingredients] = await Promise.all([
    loadReportData(outlet.id, period),
    loadReportData(outlet.id, previousPeriod(period)),
    readDb(db => db.ingredient.findMany({ where: { outlet_id: outlet.id, is_active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, stock: true, min_stock: true } })),
  ]);
  const s = summary(data);
  const p = summary(prev);
  const days = byDay(data);
  const top = byProduct(data).slice(0, 5);
  const low = ingredients.filter(i => isLow(i.stock, i.min_stock));

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Dashboard" description={`Hari bisnis ${period.from === period.to ? period.from : `${period.from} – ${period.to}`} (berakhir 04:00 WIB).`} />
      <PeriodPicker basePath="/admin/dashboard" preset={preset} period={period} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Pendapatan bersih" value={s.net_revenue} previous={p.net_revenue} format="rupiah" note={s.refunds ? `Penjualan ${formatRupiah(s.gross_sales)} − refund ${formatRupiah(s.refunds)}` : undefined} />
        <KpiTile label="Transaksi" value={s.transactions} previous={p.transactions} format="number" note={s.voids ? `${s.voids} bill dibatalkan` : undefined} />
        <KpiTile label="Rata-rata per transaksi" value={s.avg_ticket} previous={p.avg_ticket} format="rupiah" />
        <KpiTile label="Laba kotor" value={s.gross_profit} previous={p.gross_profit} format="rupiah" note={`Setelah pajak ${formatRupiah(s.tax)} & HPP ${formatRupiah(s.cogs)}`} />
        <KpiTile label="Efektivitas promo" value={s.discounts} previous={p.discounts} format="rupiah" note={`Diskon · ${s.promo_orders} dari ${s.transactions} bill (${pct(s.promo_orders, s.transactions)})`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Pendapatan & laba per hari">
            {days.length > 1 ? (
              <DailyChart data={days} />
            ) : (
              <p className="text-sm text-muted-foreground">Pilih rentang lebih dari satu hari (mis. 7 hari) untuk melihat grafik harian.</p>
            )}
          </Section>
        </div>
        <Section title="Metode bayar">
          <PaymentMix data={byPayment(data)} />
        </Section>
        <div className="lg:col-span-2">
          <Section title="Produk terlaris">
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 font-normal">Produk</th>
                    <th className="py-1 text-right font-normal">Terjual</th>
                    <th className="py-1 text-right font-normal">Pendapatan</th>
                    <th className="py-1 text-right font-normal">Laba kotor</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map(r => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-1.5">{r.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatRupiah(r.revenue)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatRupiah(r.gross_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
        <Section title="Bahan menipis" action={<Link href="/admin/inventory" className="text-xs text-muted-foreground hover:underline">Lihat inventaris</Link>}>
          {low.length === 0 ? (
            <p className="text-sm text-muted-foreground">Semua stok aman.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {low.map(i => (
                <li key={i.id} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="Menipis" />
                  <Link href={`/admin/inventory/${i.id}`} className="hover:underline">{i.name}</Link>
                  <span className="ml-auto tabular-nums text-muted-foreground">{i.stock.toLocaleString('id-ID')} {i.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
