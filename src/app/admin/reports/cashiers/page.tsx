import { formatRupiah } from '@/lib/money';
import { byCashier } from '@/lib/reports/aggregate';
import { reportView, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Kasir | Admin' };

export default async function CashiersReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { preset, period, view: rows, query } = await reportView(await searchParams, 'cashiers', byCashier);
  return (
    <ReportShell title="Laporan" description="Penjualan per kasir yang menerima pembayaran (sebelum refund)." basePath="/admin/reports/cashiers" preset={preset} period={period} query={query} csv="cashiers">
      <DataTable
        columns={[{ label: 'Kasir' }, { label: 'Transaksi', numeric: true }, { label: 'Penjualan', numeric: true }, { label: 'Rata-rata', numeric: true }]}
        rows={rows.map(r => [r.name, r.transactions, formatRupiah(r.gross_sales), formatRupiah(r.avg_ticket)])}
      />
    </ReportShell>
  );
}
