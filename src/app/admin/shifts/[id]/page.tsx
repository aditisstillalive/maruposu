import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { loadShiftDetail } from '@/lib/pos/shift-admin';
import { DENOMINATIONS, varianceLabel } from '@/lib/pos/shift';
import { formatRupiah } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/admin/PageHeader';
import CloseForm from './close-form';
import PrintShift from './print-shift';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail shift | Admin' };

const timeWIB = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const MOVE: Record<string, string> = { paid_in: 'Kas masuk', paid_out: 'Kas keluar', refund_out: 'Refund tunai' };
const STATUS: Record<string, string> = { open: 'Open', paid: 'Lunas', void: 'Batal', refunded: 'Refund' };

export default async function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, outlet] = await Promise.all([loadShiftDetail(id), getCurrentOutlet()]);
  if (!detail) notFound();
  const employees = await prisma.employee.findMany({ where: { outlet_id: outlet.id }, select: { id: true, name: true, photo_url: true } });
  const name = (eid: string | null) => (eid ? employees.find(e => e.id === eid)?.name ?? eid : '-');
  const { shift, summary: s, orders, moves } = detail;
  const open = shift.status === 'open';

  const rows: [string, number, boolean?][] = [
    ['Modal awal', s.opening_float], ['Penjualan tunai', s.cash_sales], ['Kas masuk', s.paid_in], ['Kas keluar', -s.paid_out],
    ['Refund tunai', -s.refunds_cash], ['Saldo seharusnya', s.expected_cash, true],
  ];

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/shifts" className="text-sm text-muted-foreground hover:underline">← Kas Kasir</Link>
      <PageHeader
        title={`Shift ${shift.business_date}`}
        description={
          open
            ? `Terbuka sejak ${timeWIB(shift.opened_at)} oleh ${name(shift.opened_by)}`
            : `Dibuka ${timeWIB(shift.opened_at)} oleh ${name(shift.opened_by)} · ${shift.closed_via === 'admin' ? `Ditutup lewat admin oleh ${shift.closed_by}` : `Ditutup di tablet oleh ${name(shift.closed_by)}`} ${timeWIB(shift.closed_at!)}`
        }
      >
        {!open && (
          <PrintShift
            closed={{
              shift: { ...shift, status: 'closed' }, summary: s, denominations: shift.denominations ?? { notes: {}, coins: 0 },
              counted: shift.counted_cash ?? 0, expected: shift.expected_cash ?? s.expected_cash, variance: shift.variance ?? 0,
              note: shift.close_note, closed_by: shift.closed_by ?? '', closed_at: shift.closed_at ?? shift.opened_at, seen: true,
            }}
            setting={{
              cafe_name: outlet.setting.cafe_name, address: outlet.address, receipt_footer: outlet.setting.receipt_footer,
              tax: { name: outlet.setting.tax_name, rate_bp: outlet.setting.tax_rate_bp, inclusive: outlet.setting.tax_inclusive },
            }}
            employees={employees}
          />
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Kas laci</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {rows.map(([label, value, strong]) => (
              <div key={label} className={`flex justify-between ${strong ? 'border-t pt-1 font-medium' : ''}`}>
                <span>{label}</span><span className="tabular-nums">{formatRupiah(value)}</span>
              </div>
            ))}
            {!open && (
              <>
                <div className="flex justify-between"><span>Uang dihitung</span><span className="tabular-nums">{formatRupiah(shift.counted_cash ?? 0)}</span></div>
                <div className={`flex justify-between font-medium ${shift.variance ? 'text-red-700' : 'text-green-700'}`}><span>Selisih</span><span>{varianceLabel(shift.variance ?? 0)}</span></div>
              </>
            )}
            {open && <p className="pt-2 text-xs text-muted-foreground">Angka sementara; dihitung ulang saat ditutup.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Penjualan</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {([['Transaksi', String(s.transactions)], ['Tunai', formatRupiah(s.cash_sales)], ['EDC', formatRupiah(s.edc_sales)], ['QRIS', formatRupiah(s.qris_sales)],
              ['Total', formatRupiah(s.gross_sales)], ['Diskon promo', formatRupiah(s.discounts)], ['Pajak', formatRupiah(s.tax)], ['Bill dibatalkan', String(s.voids)],
              ['Refund non-tunai', formatRupiah(s.refunds_cashless)]] as const).map(([l, v]) => (
              <div key={l} className="flex justify-between"><span>{l}</span><span className="tabular-nums">{v}</span></div>
            ))}
          </CardContent>
        </Card>

        {!open && (
          <Card>
            <CardHeader><CardTitle>Hitungan & catatan</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {DENOMINATIONS.filter(d => shift.denominations?.notes[String(d)]).map(d => (
                <div key={d} className="flex justify-between tabular-nums">
                  <span>{formatRupiah(d)} × {shift.denominations!.notes[String(d)]}</span><span>{formatRupiah(d * shift.denominations!.notes[String(d)])}</span>
                </div>
              ))}
              {!!shift.denominations?.coins && <div className="flex justify-between"><span>Koin</span><span className="tabular-nums">{formatRupiah(shift.denominations.coins)}</span></div>}
              {shift.close_note && <p className="pt-2">Catatan: {shift.close_note}</p>}
              {shift.sync_note && <p className="pt-1 text-xs text-amber-700">{shift.sync_note}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {open && <CloseForm shiftId={shift.id} openBills={orders.filter(o => o.status === 'open').length} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Kas masuk / keluar</CardTitle></CardHeader>
          <CardContent>
            {moves.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada.</p> : (
              <ul className="divide-y text-sm">
                {moves.map(m => (
                  <li key={m.id} className="flex justify-between gap-2 py-1.5">
                    <span>{MOVE[m.kind]} · {m.note}<span className="block text-xs text-muted-foreground">{timeWIB(m.created_at)} · {name(m.employee_id)}</span></span>
                    <span className="tabular-nums">{m.kind === 'paid_in' ? '+' : '-'}{formatRupiah(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Transaksi ({orders.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {orders.map(o => (
                <li key={o.id} className="flex justify-between gap-2 py-1.5">
                  <span>#{String(o.number).padStart(3, '0')} {o.customer_name ?? ''} <span className="text-xs text-muted-foreground">· {STATUS[o.status]}{o.payment_method ? ` · ${o.payment_method.toUpperCase()}` : ''}{o.void_reason ? ` · ${o.void_reason}` : ''}</span></span>
                  <span className="tabular-nums">{o.status === 'open' || o.status === 'void' ? '-' : formatRupiah(o.total)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
