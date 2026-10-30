import Link from 'next/link';
import { formatRupiah } from '@/lib/money';
import { byCategory, byProduct } from '@/lib/reports/aggregate';
import { reportPageData, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import DataTable from '@/components/admin/reports/DataTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Produk | Admin' };

const pct = (x: number) => `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

export default async function ProductsReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { preset, period, data, query } = await reportPageData(sp);
  const category = sp.by === 'category';
  const rows = category ? byCategory(data) : byProduct(data);
  const extra: Record<string, string> = category ? { by: 'category' } : {};
  const total = (k: 'qty' | 'revenue' | 'net_of_tax' | 'cogs' | 'gross_profit') => rows.reduce((s, r) => s + r[k], 0);
  const tab = (active: boolean) => `rounded-lg px-3 py-1.5 ${active ? 'bg-black text-white' : 'border bg-white text-gray-600 hover:bg-gray-100'}`;

  return (
    <ReportShell
      title="Laporan"
      description="Ranking terlaris dengan HPP dari resep dan laba kotor (tanpa pajak); refund mengurangi hari refund dibuat."
      basePath="/admin/reports/products" preset={preset} period={period} query={query} csv={category ? 'categories' : 'products'} extra={extra}
    >
      <nav aria-label="Kelompokkan" className="mb-4 flex gap-2 text-sm">
        <Link href={`/admin/reports/products?${new URLSearchParams(query)}`} aria-current={!category ? 'page' : undefined} className={tab(!category)}>Produk</Link>
        <Link href={`/admin/reports/products?${new URLSearchParams({ ...query, by: 'category' })}`} aria-current={category ? 'page' : undefined} className={tab(category)}>Kategori</Link>
      </nav>
      <DataTable
        columns={[{ label: category ? 'Kategori' : 'Produk' }, { label: 'Terjual', numeric: true }, { label: 'Pendapatan', numeric: true }, { label: 'HPP', numeric: true }, { label: 'Laba kotor', numeric: true }, { label: 'Margin (tanpa pajak)', numeric: true }]}
        rows={rows.map(r => [r.name, r.qty.toLocaleString('id-ID'), formatRupiah(r.revenue), formatRupiah(r.cogs), formatRupiah(r.gross_profit), r.net_of_tax ? pct(r.gross_profit / r.net_of_tax) : '-'])}
        total={rows.length > 1 ? ['Total', total('qty').toLocaleString('id-ID'), formatRupiah(total('revenue')), formatRupiah(total('cogs')), formatRupiah(total('gross_profit')), total('net_of_tax') ? pct(total('gross_profit') / total('net_of_tax')) : '-'] : undefined}
      />
    </ReportShell>
  );
}
