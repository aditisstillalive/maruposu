import Link from 'next/link';
import { formatRupiah } from '@/lib/money';
import { filterOrders, ordersFilterFromParams } from '@/lib/reports/filters';
import { METHOD_LABEL } from '@/lib/reports/tables';
import { reportPageData, type SearchParams } from '@/lib/reports/page-data';
import ReportShell from '@/components/admin/reports/ReportShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Transaksi | Admin' };

const PAGE_SIZE = 100;
const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: 'Lunas', tone: 'bg-green-50 text-green-700' },
  refunded: { label: 'Refund', tone: 'bg-amber-50 text-amber-800' },
  void: { label: 'Batal', tone: 'bg-red-50 text-red-700' },
};
const timeWIB = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function TransactionsReport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { preset, period, data, query } = await reportPageData(sp);
  const filter = ordersFilterFromParams(sp);
  const extra = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as Record<string, string>;
  const all = filterOrders(data.orders, filter).sort((a, b) => (b.paid_at ?? b.business_date).localeCompare(a.paid_at ?? a.business_date));
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const who = (id: string | null) => (id ? data.employees[id] ?? id : '-');
  const sold = all.filter(o => o.status !== 'void');
  const pageHref = (n: number) => `/admin/reports/transactions?${new URLSearchParams({ ...query, ...extra, page: String(n) })}`;
  const select = 'h-8 rounded-lg border bg-white px-2';

  return (
    <ReportShell title="Laporan" description="Setiap bill dengan item, promo, metode, dan kasir." basePath="/admin/reports/transactions" preset={preset} period={period} query={query} csv="transactions" extra={extra}>
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        {Object.entries(query).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="space-y-1"><label htmlFor="f-status" className="block text-muted-foreground">Status</label>
          <select id="f-status" name="status" defaultValue={filter.status ?? ''} className={select}>
            <option value="">Semua</option><option value="paid">Lunas</option><option value="refunded">Refund</option><option value="void">Batal</option>
          </select>
        </div>
        <div className="space-y-1"><label htmlFor="f-method" className="block text-muted-foreground">Metode</label>
          <select id="f-method" name="method" defaultValue={filter.method ?? ''} className={select}>
            <option value="">Semua</option>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1"><label htmlFor="f-cashier" className="block text-muted-foreground">Kasir</label>
          <select id="f-cashier" name="cashier" defaultValue={filter.cashier ?? ''} className={select}>
            <option value="">Semua</option>
            {Object.entries(data.employees).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <button className="h-8 rounded-lg border bg-white px-3">Terapkan</button>
      </form>

      <p className="mb-2 text-sm text-muted-foreground">
        <span data-testid="result-count">{all.length} bill</span>
        {sold.length > 0 && <> · total {formatRupiah(sold.reduce((s, o) => s + o.total, 0))}</>}
        {pages > 1 && <> · halaman {page} dari {pages}</>}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Tidak ada transaksi yang cocok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Bill</th>
                <th className="p-3 font-medium">Waktu bayar</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Kasir</th>
                <th className="p-3 font-medium">Metode</th>
                <th className="p-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(o => {
                const refunded = o.items.reduce((s, i) => s + i.refunded_amount, 0);
                return (
                  <tr key={o.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <span className="font-medium tabular-nums">{o.code}</span>
                      {o.customer_name && <span className="text-muted-foreground"> · {o.customer_name}</span>}
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {o.items.map((i, k) => (
                          <li key={k}>{i.qty}x {i.name}{i.options.length > 0 && ` (${i.options.join(', ')})`} · {formatRupiah(i.paid)}</li>
                        ))}
                        {o.promo_name && <li>Promo {o.promo_name} · −{formatRupiah(o.discount)}</li>}
                        {o.void_reason && <li>Alasan batal: {o.void_reason}</li>}
                      </ul>
                    </td>
                    <td className="p-3 whitespace-nowrap">{o.paid_at ? timeWIB(o.paid_at) : o.business_date}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[o.status]?.tone ?? ''}`}>{STATUS[o.status]?.label ?? o.status}</span></td>
                    <td className="p-3">{who(o.paid_by ?? o.created_by)}</td>
                    <td className="p-3">{o.payment_method ? METHOD_LABEL[o.payment_method] : '-'}</td>
                    <td className="p-3 text-right tabular-nums">
                      {o.status === 'void' ? '-' : formatRupiah(o.total)}
                      {refunded > 0 && <span className="block text-xs text-muted-foreground">refund −{formatRupiah(refunded)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Halaman" className="mt-4 flex gap-2 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="rounded-lg border bg-white px-3 py-1.5">Sebelumnya</Link>}
          {page < pages && <Link href={pageHref(page + 1)} className="rounded-lg border bg-white px-3 py-1.5">Berikutnya</Link>}
        </nav>
      )}
    </ReportShell>
  );
}
