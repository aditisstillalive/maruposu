import { dateTimeWIB } from './Receipt';
import type { OrderDoc } from '@/lib/pos/types';

/** Ticket for the bar: what to make, for whom. No prices. */
export default function BaristaTicket({ order }: { order: OrderDoc }) {
  const where = [order.order_type === 'takeaway' ? 'TAKEAWAY' : 'DINE-IN', order.table_no ? `Meja ${order.table_no}` : null].filter(Boolean).join(' · ');
  return (
    <div className="receipt">
      <div className="text-center text-3xl font-bold">#{String(order.number).padStart(3, '0')}</div>
      <div className="text-center font-bold">{where}</div>
      {order.customer_name && <div className="text-center text-base font-bold">{order.customer_name}</div>}
      <div className="text-center">{dateTimeWIB(order.created_at)}</div>
      <div className="my-1 border-t border-dashed border-black" />
      {order.items.map(i => (
        <div key={i.id} className="mb-1.5">
          <div className="text-sm font-bold">{i.qty} x {i.name}</div>
          {i.options.length > 0 && <div className="pl-3">{i.options.map(o => o.name).join(', ')}</div>}
          {i.note && <div className="pl-3 font-bold">* {i.note}</div>}
        </div>
      ))}
    </div>
  );
}
