import { formatRupiah } from '@/lib/money';
import { voidsAndRefunds } from '@/lib/reports/aggregate';
import { reportPageData, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Void & Refund | Admin' };

const timeWIB = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function VoidsReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { preset, period, data, query } = await reportPageData(await searchParams);
  const v = voidsAndRefunds(data);
  return (
    <ReportShell title="Laporan" description="Bill yang dibatalkan dan refund, dengan alasan dan siapa yang melakukannya." basePath="/admin/reports/voids" preset={preset} period={period} query={query} csv="voids">
      <div className="space-y-6">
        <section aria-label="Bill dibatalkan" className="space-y-2">
          <h2 className="text-sm font-semibold">Bill dibatalkan ({v.totals.voids})</h2>
          <DataTable
            empty="Tidak ada bill dibatalkan."
            columns={[{ label: 'No. bill' }, { label: 'Hari bisnis' }, { label: 'Item' }, { label: 'Alasan' }, { label: 'Oleh' }]}
            rows={v.voids.map(o => [o.code, o.business_date, o.items.map(i => `${i.qty}x ${i.name}`).join(', '), o.void_reason, o.voided_by ?? '-'])}
          />
        </section>
        <section aria-label="Refund" className="space-y-2">
          <h2 className="text-sm font-semibold">Refund ({v.totals.refunds})</h2>
          <DataTable
            empty="Tidak ada refund."
            columns={[{ label: 'No. bill' }, { label: 'Waktu' }, { label: 'Item' }, { label: 'Alasan' }, { label: 'Oleh' }, { label: 'Metode' }, { label: 'Jumlah', numeric: true }]}
            rows={v.refunds.map(r => [r.order_code, timeWIB(r.created_at), r.items.map(i => `${i.qty}x ${i.name}`).join(', '), r.reason, r.employee, r.method === 'cash' ? 'Tunai' : 'Non-tunai', formatRupiah(r.amount)])}
            total={v.refunds.length ? ['Total', '', '', '', '', '', formatRupiah(v.totals.refund_amount)] : undefined}
          />
        </section>
      </div>
    </ReportShell>
  );
}
