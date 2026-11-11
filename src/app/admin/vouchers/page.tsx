import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatRupiah } from '@/lib/money';
import PageHeader from '@/components/admin/PageHeader';
import HandledButton from './handled-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Voucher | Admin' };

const PAGE = 50;
const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Aktif', cls: 'bg-green-50 text-green-800' },
  RESERVED: { label: 'Ditahan pesanan web', cls: 'bg-amber-50 text-amber-800' },
  USED: { label: 'Terpakai', cls: 'bg-gray-100 text-gray-700' },
  VOID: { label: 'Dibatalkan', cls: 'bg-red-50 text-red-700' },
};
const CHANNEL: Record<string, string> = { web: 'Toko online', cafe: 'Kafe', both: 'Web & kafe' };
const REASON: Record<string, string> = { not_found: 'kode tidak ada di Toko Iboek', void: 'voucher dibatalkan', expired: 'sudah kedaluwarsa', not_for_cafe: 'hanya untuk toko online', invalid: 'kode tidak valid' };
const dateWIB = (d: Date | string) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const value = (v: { kind: string; value: number; max_discount: number | null; min_spend: number }) =>
  (v.kind === 'percent' ? `${v.value / 100}%${v.max_discount !== null ? ` (maks. ${formatRupiah(v.max_discount)})` : ''}` : formatRupiah(v.value))
  + (v.min_spend > 0 ? ` · min. ${formatRupiah(v.min_spend)}` : '');

type Search = { q?: string; status?: string; channel?: string; page?: string };

/** Read-only mirror of Toko Iboek's printed vouchers, plus the café's voucher problems. */
export default async function VouchersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.VoucherWhereInput = {
    ...(sp.q ? { code: { contains: sp.q.trim().toUpperCase().replace(/[^0-9A-Z-]/g, '') } } : {}),
    ...(sp.status && STATUS[sp.status] ? { status: sp.status } : {}),
    ...(sp.channel === 'cafe' || sp.channel === 'web' ? { used_channel: sp.channel } : {}),
  };
  const [rows, count, problems, cursor, pendingCount] = await Promise.all([
    prisma.voucher.findMany({ where, orderBy: [{ updated_at: 'desc' }, { code: 'asc' }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.voucher.count({ where }),
    prisma.voucherRedemption.findMany({
      where: { state: { in: ['conflict', 'rejected'] }, handled_at: null },
      include: { order: { select: { id: true, code: true, paid_at: true, business_date: true } } },
      orderBy: { at: 'desc' },
    }),
    prisma.voucherSyncCursor.findUnique({ where: { id: 'tokoiboek' } }),
    prisma.voucherRedemption.count({ where: { state: 'pending' } }),
  ]);
  const loss = problems.reduce((s, p) => s + p.amount, 0);
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter((e): e is [string, string] => !!e[1]));
    return `?${p}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader title="Voucher" description="Voucher cetak dari Toko Iboek (sumber data di Toko Iboek). Satu kode hanya bisa dipakai sekali, di toko online atau di kafe." />

      <section aria-label="Voucher bermasalah" className={`rounded-2xl border p-4 ${problems.length ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
        <h2 className="font-medium">Voucher bermasalah</h2>
        {problems.length === 0 ? (
          <p className="mt-1 text-sm text-gray-600">Tidak ada. {pendingCount > 0 && `${pendingCount} pemakaian di kafe masih menunggu dikirim ke Toko Iboek.`}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-amber-900">
              {problems.length} voucher diterima kasir tapi ditolak Toko Iboek — potongan {formatRupiah(loss)} ditanggung kafe.
            </p>
            <ul className="mt-3 divide-y rounded-xl border bg-white text-sm">
              {problems.map(p => {
                const d = (p.detail ?? {}) as { channel?: string | null; ref?: string | null; at?: string | null; reason?: string };
                const before = p.state === 'conflict'
                  ? `Sudah dipakai ${d.channel === 'web' ? 'di toko online' : d.channel === 'cafe' ? 'di kafe' : ''}${d.ref ? ` (${d.ref})` : ''}${d.at ? ` · ${dateWIB(d.at)}` : ''}`
                  : `Ditolak: ${REASON[d.reason ?? ''] ?? d.reason ?? '-'}`;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="font-mono font-medium">{p.code}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/admin/reports/transactions?from=${p.order.business_date}&to=${p.order.business_date}`} className="underline">Bill {p.order.code}</Link>
                      <span className="text-gray-500"> · {dateWIB(p.at)}</span>
                      <span className="block text-xs text-gray-600">{before}</span>
                    </span>
                    <span className="tabular-nums text-red-700">-{formatRupiah(p.amount)}</span>
                    <HandledButton id={p.id} code={p.code} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Daftar voucher" className="space-y-3">
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Cari kode" aria-label="Cari kode" className="h-10 rounded-lg border px-3 font-mono uppercase" />
          <select name="status" defaultValue={sp.status ?? ''} aria-label="Status" className="h-10 rounded-lg border px-2">
            <option value="">Semua status</option>
            {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
          <select name="channel" defaultValue={sp.channel ?? ''} aria-label="Dipakai di" className="h-10 rounded-lg border px-2">
            <option value="">Dipakai di mana saja</option>
            <option value="cafe">Dipakai di kafe</option>
            <option value="web">Dipakai di toko online</option>
          </select>
          <button className="h-10 rounded-lg bg-brand-strong px-4 text-white">Terapkan</button>
          <span className="ml-auto text-xs text-gray-500">
            {count} voucher{cursor?.pulled_at ? ` · sinkron terakhir ${dateWIB(cursor.pulled_at)}` : ''}
          </span>
        </form>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr><th className="px-3 py-2">Kode</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Nilai</th><th className="px-3 py-2">Berlaku di</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Dipakai</th><th className="px-3 py-2">Kedaluwarsa</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(v => (
                <tr key={v.code}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{v.code}</td>
                  <td className="px-3 py-2">{v.batch_name}</td>
                  <td className="px-3 py-2 tabular-nums">{value(v)}</td>
                  <td className="px-3 py-2">{CHANNEL[v.channels] ?? v.channels}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[v.status]?.cls ?? ''}`}>{STATUS[v.status]?.label ?? v.status}</span></td>
                  <td className="px-3 py-2 text-xs">{v.used_channel ? `${v.used_channel === 'cafe' ? 'Kafe' : 'Toko online'}${v.used_ref ? ` · ${v.used_ref}` : ''}${v.used_at ? ` · ${dateWIB(v.used_at)}` : ''}` : '-'}</td>
                  <td className="px-3 py-2 text-xs">{dateWIB(v.expires_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Belum ada voucher.</td></tr>}
            </tbody>
          </table>
        </div>
        {count > PAGE && (
          <nav className="flex items-center gap-3 text-sm">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="underline">Sebelumnya</Link>}
            <span>Halaman {page} dari {Math.ceil(count / PAGE)}</span>
            {page * PAGE < count && <Link href={qs({ page: String(page + 1) })} className="underline">Berikutnya</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
