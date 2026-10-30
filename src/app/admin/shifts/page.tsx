import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { addDays, isValidDate, todayWIB } from '@/lib/wib';
import { formatRupiah } from '@/lib/money';
import { varianceLabel } from '@/lib/pos/shift';
import PageHeader from '@/components/admin/PageHeader';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kas Kasir | Admin' };

const timeWIB = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const to = isValidDate(sp.to) ? sp.to : todayWIB();
  const from = isValidDate(sp.from) ? sp.from : addDays(to, -6);
  const outlet = await getCurrentOutlet();
  const [shifts, employees] = await Promise.all([
    prisma.shift.findMany({
      where: { outlet_id: outlet.id, OR: [{ status: 'open' }, { business_date: { gte: from, lte: to } }] },
      orderBy: { opened_at: 'desc' },
    }),
    prisma.employee.findMany({ where: { outlet_id: outlet.id }, select: { id: true, name: true } }),
  ]);
  const name = (id: string | null) => (id ? employees.find(e => e.id === id)?.name ?? id : '-');

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Kas Kasir" description="Riwayat shift: modal awal, saldo seharusnya, uang dihitung, dan selisih per tutup kasir." />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-muted-foreground">Dari</span><input type="date" name="from" defaultValue={from} className="h-8 rounded-lg border px-2" /></label>
        <label className="space-y-1"><span className="block text-muted-foreground">Sampai</span><input type="date" name="to" defaultValue={to} className="h-8 rounded-lg border px-2" /></label>
        <button className="h-8 rounded-lg border bg-white px-3">Tampilkan</button>
      </form>
      {shifts.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Belum ada shift di rentang ini.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3">Hari bisnis</th>
                <th className="p-3">Dibuka</th>
                <th className="p-3">Ditutup</th>
                <th className="p-3 text-right">Modal</th>
                <th className="p-3 text-right">Seharusnya</th>
                <th className="p-3 text-right">Dihitung</th>
                <th className="p-3 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => {
                const open = s.status === 'open';
                const label = open ? 'Terbuka' : varianceLabel(s.variance ?? 0);
                const tone = open ? 'bg-amber-50 text-amber-800' : s.variance ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700';
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-3 tabular-nums">{s.business_date}</td>
                    <td className="p-3">{timeWIB(s.opened_at)} · {name(s.opened_by)}</td>
                    <td className="p-3">
                      {s.closed_at ? `${timeWIB(s.closed_at)} · ${s.closed_via === 'admin' ? `admin (${s.closed_by})` : name(s.closed_by)}` : '-'}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatRupiah(s.opening_float)}</td>
                    <td className="p-3 text-right tabular-nums">{s.expected_cash === null ? '-' : formatRupiah(s.expected_cash)}</td>
                    <td className="p-3 text-right tabular-nums">{s.counted_cash === null ? '-' : formatRupiah(s.counted_cash)}</td>
                    <td className="p-3 text-right">
                      <Link href={`/admin/shifts/${s.id}`} className={`rounded-full px-2 py-1 text-xs font-medium hover:underline ${tone}`}>{label}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
