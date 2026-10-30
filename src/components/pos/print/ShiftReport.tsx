import { formatRupiah } from '@/lib/money';
import { DENOMINATIONS, varianceLabel } from '@/lib/pos/shift';
import type { ClosedShift } from '@/lib/pos/client/db';
import type { Snapshot, SnapshotEmployee } from '@/lib/pos/types';
import { dateTimeWIB, Row, Rule } from './Receipt';

const num = (n: number) => n.toLocaleString('id-ID');

/** Closing report for 58 mm paper ("Laporan Tutup Kasir"). */
export default function ShiftReport({ closed, setting, employees }: { closed: ClosedShift; setting: Snapshot['setting']; employees: SnapshotEmployee[] }) {
  const name = (id: string) => employees.find(e => e.id === id)?.name ?? id;
  const s = closed.summary;
  return (
    <div className="receipt">
      <div className="text-center font-bold">{setting.cafe_name}</div>
      <div className="text-center font-bold">LAPORAN TUTUP KASIR</div>
      <div className="text-center">Hari bisnis {closed.shift.business_date}</div>
      <Rule />
      <div>Buka : {dateTimeWIB(closed.shift.opened_at)}</div>
      <div className="pl-8">{name(closed.shift.opened_by)}</div>
      <div>Tutup: {dateTimeWIB(closed.closed_at)}</div>
      <div className="pl-8">{name(closed.closed_by)}</div>
      <Rule />
      <div className="font-bold">PENJUALAN ({s.transactions} transaksi)</div>
      <Row left="Tunai" right={formatRupiah(s.cash_sales)} />
      <Row left="EDC" right={formatRupiah(s.edc_sales)} />
      <Row left="QRIS" right={formatRupiah(s.qris_sales)} />
      <Row left="Total" right={formatRupiah(s.gross_sales)} strong />
      {s.discounts > 0 && <Row left="Diskon promo" right={formatRupiah(s.discounts)} />}
      <Row left={`${setting.tax.name} ${setting.tax.rate_bp / 100}%`} right={formatRupiah(s.tax)} />
      <Row left="Bill dibatalkan" right={String(s.voids)} />
      {(s.refunds_cash > 0 || s.refunds_cashless > 0) && (
        <>
          <Row left="Refund tunai" right={formatRupiah(s.refunds_cash)} />
          <Row left="Refund non-tunai" right={formatRupiah(s.refunds_cashless)} />
        </>
      )}
      <Rule />
      <div className="font-bold">KAS LACI</div>
      <Row left="Modal awal" right={formatRupiah(s.opening_float)} />
      <Row left="+ Penjualan tunai" right={formatRupiah(s.cash_sales)} />
      <Row left="+ Kas masuk" right={formatRupiah(s.paid_in)} />
      <Row left="- Kas keluar" right={formatRupiah(s.paid_out)} />
      <Row left="- Refund tunai" right={formatRupiah(s.refunds_cash)} />
      <Row left="Saldo seharusnya" right={formatRupiah(closed.expected)} strong />
      <Rule />
      <div className="font-bold">UANG DIHITUNG</div>
      {DENOMINATIONS.filter(d => closed.denominations.notes[String(d)]).map(d => (
        <Row key={d} left={`${num(d)} x ${closed.denominations.notes[String(d)]}`} right={formatRupiah(d * closed.denominations.notes[String(d)])} />
      ))}
      {closed.denominations.coins > 0 && <Row left="Koin" right={formatRupiah(closed.denominations.coins)} />}
      <Row left="Total dihitung" right={formatRupiah(closed.counted)} strong />
      <Rule />
      <Row left="Selisih" right={varianceLabel(closed.variance)} strong />
      {closed.note && <div>Catatan: {closed.note}</div>}
    </div>
  );
}
