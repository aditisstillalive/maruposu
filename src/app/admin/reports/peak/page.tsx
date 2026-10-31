import { byProduct, heatmap } from '@/lib/reports/aggregate';
import { busiest, DAY_NAMES, hourRange, peakParams } from '@/lib/reports/peak';
import { reportView, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';
import Heatmap from '@/components/admin/reports/Heatmap';
import ProductSelect from '@/components/admin/reports/ProductSelect';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Jam Ramai | Admin' };

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default async function PeakReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const wanted = typeof sp.product === 'string' ? sp.product : '';
  const { preset, period, view, query } = await reportView(peakParams(sp), `peak:${wanted}`, d => {
    const products = byProduct(d).map(p => ({ key: p.key, name: p.name }));
    // A product not sold in this period (stale link) falls back to all transactions
    const product = wanted && products.some(p => p.key === wanted) ? wanted : '';
    return { products, product, grid: heatmap(d, product ? { product } : undefined) };
  });
  const { products, product, grid } = view;
  const top = busiest(grid);
  const unit = product ? 'terjual' : 'transaksi';
  const extra: Record<string, string> = product ? { product } : {};

  return (
    <ReportShell title="Laporan" description="Jam dan hari ramai menurut waktu pembayaran (WIB)." basePath="/admin/reports/peak" preset={preset} period={period} query={query} extra={extra}>
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <ProductSelect products={products} value={product} />
          <p className="text-sm">
            {top
              ? <>Paling ramai: <strong>{DAY_NAMES[top.day]} {hh(top.hour)}–{hh((top.hour + 1) % 24)}</strong> ({top.transactions} {unit})</>
              : <span className="text-muted-foreground">Belum ada penjualan di periode ini.</span>}
          </p>
        </div>
        <Heatmap grid={grid} hours={hourRange(grid)} unit={unit} />
      </div>
    </ReportShell>
  );
}
