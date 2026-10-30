/* eslint-disable @next/next/no-img-element */
import { formatRupiah } from '@/lib/money';
import { unitPrice, lineTotal } from '@/lib/pos/pricing';
import type { OrderDoc, Snapshot } from '@/lib/pos/types';

const METHOD: Record<string, string> = { cash: 'Tunai', edc: 'EDC', qris: 'QRIS' };

export const dateTimeWIB = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export function Row({ left, right, strong }: { left: React.ReactNode; right: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
      <span>{left}</span>
      <span className="whitespace-nowrap">{right}</span>
    </div>
  );
}

export const Rule = () => <div className="my-1 border-t border-dashed border-black" />;

/** Customer receipt, laid out for 58 mm thermal paper. */
export default function Receipt({ order, setting, cashierName }: { order: OrderDoc; setting: Snapshot['setting']; cashierName: string }) {
  const tax = setting.tax;
  const where = [order.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in', order.table_no ? `Meja ${order.table_no}` : null, order.customer_name].filter(Boolean).join(' · ');
  const refunded = order.refunds.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="receipt">
      <div className="text-center">
        <img src="/maraca-wordmark.png" alt="" className="mx-auto mb-1 h-8 w-auto" />
        <div className="font-bold">{setting.cafe_name}</div>
        {setting.address && <div>{setting.address}</div>}
      </div>
      <Rule />
      <div>{dateTimeWIB(order.paid_at ?? order.created_at)}</div>
      <div>No: {order.code}</div>
      <div>Kasir: {cashierName}</div>
      <div>{where}</div>
      <Rule />
      {order.items.map(i => (
        <div key={i.id} className="mb-1">
          <div>{i.name}</div>
          {i.options.length > 0 && <div className="pl-2">{i.options.map(o => o.name).join(', ')}</div>}
          {i.note && <div className="pl-2 italic">* {i.note}</div>}
          <Row left={<span className="pl-2">{i.qty} x {formatRupiah(unitPrice(i))}</span>} right={formatRupiah(lineTotal(i))} />
        </div>
      ))}
      <Rule />
      <Row left="Subtotal" right={formatRupiah(order.subtotal)} />
      {order.discount > 0 && <Row left={order.promo_name ?? 'Diskon'} right={`-${formatRupiah(order.discount)}`} />}
      {!tax.inclusive && <Row left={`${tax.name} ${tax.rate_bp / 100}%`} right={formatRupiah(order.tax)} />}
      <Row left="TOTAL" right={formatRupiah(order.total)} strong />
      {tax.inclusive && <Row left={`${tax.name} ${tax.rate_bp / 100}% (termasuk)`} right={formatRupiah(order.tax)} />}
      <Rule />
      {order.payment_method && <Row left={METHOD[order.payment_method]} right={formatRupiah(order.cash_received ?? order.total)} />}
      {order.change !== null && <Row left="Kembali" right={formatRupiah(order.change)} />}
      {order.payment_ref && <div>Ref: {order.payment_ref}</div>}
      {refunded > 0 && (
        <>
          <Rule />
          {order.refunds.map(r => (
            <Row key={r.id} left={`Refund (${r.method === 'cash' ? 'tunai' : 'non-tunai'})`} right={`-${formatRupiah(r.amount)}`} />
          ))}
        </>
      )}
      {setting.receipt_footer && (
        <>
          <Rule />
          <div className="text-center">{setting.receipt_footer}</div>
        </>
      )}
    </div>
  );
}
