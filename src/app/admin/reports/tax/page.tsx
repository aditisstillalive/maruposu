import { formatRupiah } from '@/lib/money';
import { getCurrentOutlet } from '@/lib/outlet';
import { taxReport } from '@/lib/reports/aggregate';
import { reportView, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Pajak | Admin' };

export default async function TaxReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [{ preset, period, view: rows, query }, outlet] = await Promise.all([reportView(await searchParams, 'tax', taxReport), getCurrentOutlet()]);
  const total = (k: 'tax_sales' | 'tax_refunds' | 'tax_net') => rows.reduce((s, r) => s + r[k], 0);
  const name = outlet.setting.tax_name;
  return (
    <ReportShell
      title="Laporan"
      description={`${name} ${outlet.setting.tax_rate_bp / 100}% ${outlet.setting.tax_inclusive ? '(termasuk harga)' : ''} per hari bisnis; pajak refund mengurangi hari refund dibuat.`}
      basePath="/admin/reports/tax" preset={preset} period={period} query={query} csv="tax"
    >
      <DataTable
        columns={[{ label: 'Hari bisnis' }, { label: `${name} penjualan`, numeric: true }, { label: `${name} refund`, numeric: true }, { label: `${name} bersih`, numeric: true }]}
        rows={rows.map(r => [r.date, formatRupiah(r.tax_sales), formatRupiah(-r.tax_refunds), formatRupiah(r.tax_net)])}
        total={rows.length > 1 ? ['Total', formatRupiah(total('tax_sales')), formatRupiah(-total('tax_refunds')), formatRupiah(total('tax_net'))] : undefined}
      />
    </ReportShell>
  );
}
