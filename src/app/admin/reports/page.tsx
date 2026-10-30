import { formatRupiah } from '@/lib/money';
import { longDateID } from '@/lib/reports/dates';
import { byDay, summary } from '@/lib/reports/aggregate';
import { reportPageData, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';
import DailyChart from '@/components/admin/reports/DailyChart';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan | Admin' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { preset, period, data, query } = await reportPageData(await searchParams);
  const s = summary(data);
  const days = byDay(data);
  const lines: [string, string, string?][] = [
    ['Transaksi', s.transactions.toLocaleString('id-ID'), 'Bill lunas + bill yang di-refund'],
    ['Penjualan kotor', formatRupiah(s.gross_sales)],
    ['Refund', formatRupiah(-s.refunds), 'Dihitung di hari refund dibuat'],
    ['Pendapatan bersih', formatRupiah(s.net_revenue)],
    ['Pajak', formatRupiah(-s.tax), 'Pajak penjualan dikurangi pajak refund'],
    ['Pendapatan tanpa pajak', formatRupiah(s.net_of_tax)],
    ['HPP', formatRupiah(-s.cogs)],
    ['Laba kotor', formatRupiah(s.gross_profit)],
    ['Rata-rata per transaksi', formatRupiah(s.avg_ticket)],
    ['Total diskon', formatRupiah(s.discounts), `${s.promo_orders} bill memakai promo`],
    ['Bill dibatalkan', s.voids.toLocaleString('id-ID')],
  ];
  const sum = (k: 'transactions' | 'net_revenue' | 'gross_profit') => days.reduce((t, d) => t + d[k], 0);

  return (
    <ReportShell title="Laporan" description="Penjualan per periode." basePath="/admin/reports" preset={preset} period={period} query={query} csv="daily">
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="Ringkasan" className="rounded-xl border bg-white">
          <table className="w-full text-sm">
            <tbody>
              {lines.map(([label, value, hint]) => (
                <tr key={label} className="border-b last:border-0">
                  <th scope="row" className={`p-3 text-left ${['Pendapatan bersih', 'Laba kotor'].includes(label) ? 'font-semibold' : 'font-normal'}`}>
                    {label}
                    {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
                  </th>
                  <td className={`p-3 text-right tabular-nums whitespace-nowrap ${['Pendapatan bersih', 'Laba kotor'].includes(label) ? 'font-semibold' : ''}`}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-label="Per hari" className="space-y-4 lg:col-span-2">
          {days.length > 1 && (
            <div className="rounded-xl border bg-white p-4">
              <DailyChart data={days} />
            </div>
          )}
          <DataTable
            columns={[{ label: 'Hari bisnis' }, { label: 'Transaksi', numeric: true }, { label: 'Pendapatan bersih', numeric: true }, { label: 'Laba kotor', numeric: true }]}
            rows={days.map(d => [longDateID(d.date), d.transactions, formatRupiah(d.net_revenue), formatRupiah(d.gross_profit)])}
            total={days.length > 1 ? ['Total', sum('transactions'), formatRupiah(sum('net_revenue')), formatRupiah(sum('gross_profit'))] : undefined}
          />
        </section>
      </div>
    </ReportShell>
  );
}
