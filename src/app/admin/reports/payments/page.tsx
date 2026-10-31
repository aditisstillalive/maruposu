import { formatRupiah } from '@/lib/money';
import { byPayment } from '@/lib/reports/aggregate';
import { METHOD_LABEL } from '@/lib/reports/tables';
import { reportView, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Pembayaran | Admin' };

const pct = (x: number) => `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

export default async function PaymentsReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { preset, period, view: p, query } = await reportView(await searchParams, 'payments', byPayment);
  const gross = p.methods.reduce((s, m) => s + m.amount, 0);
  const refunds = p.refunds.cash + p.refunds.cashless;
  return (
    <ReportShell title="Laporan" description="Penjualan per metode bayar; refund dicatat terpisah." basePath="/admin/reports/payments" preset={preset} period={period} query={query} csv="payments">
      <DataTable
        columns={[{ label: 'Metode' }, { label: 'Transaksi', numeric: true }, { label: 'Jumlah', numeric: true }, { label: 'Porsi', numeric: true }]}
        rows={[
          ...p.methods.map(m => [METHOD_LABEL[m.method], m.transactions, formatRupiah(m.amount), pct(m.share)]),
          ...(refunds ? [['Refund tunai', '', formatRupiah(-p.refunds.cash), ''], ['Refund non-tunai', '', formatRupiah(-p.refunds.cashless), '']] : []),
        ]}
        total={p.methods.length ? ['Bersih', p.methods.reduce((s, m) => s + m.transactions, 0), formatRupiah(gross - refunds), ''] : undefined}
      />
    </ReportShell>
  );
}
