import { formatRupiah } from '@/lib/money';
import { byPromo } from '@/lib/reports/aggregate';
import { reportView, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Promo | Admin' };

export default async function PromosReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { preset, period, view: rows, query } = await reportView(await searchParams, 'promos', byPromo);
  const sold = rows.reduce((s, r) => s + r.uses, 0);
  return (
    <ReportShell title="Laporan" description="Pemakaian promo & kupon, total diskon, dan rata-rata bill dibanding tanpa promo." basePath="/admin/reports/promos" preset={preset} period={period} query={query} csv="promos">
      <DataTable
        columns={[{ label: 'Promo' }, { label: 'Dipakai', numeric: true }, { label: 'Total diskon', numeric: true }, { label: 'Penjualan', numeric: true }, { label: 'Rata-rata bill', numeric: true }]}
        rows={sold ? rows.map(r => [r.name, r.uses, formatRupiah(r.discount), formatRupiah(r.sales), formatRupiah(r.avg_ticket)]) : []}
      />
    </ReportShell>
  );
}
