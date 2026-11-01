import type { Metadata } from 'next';
import { publicOrder, tableByToken } from '@/lib/qr/public';
import QrStatus from '@/components/qr/QrStatus';
import QrInvalid from '@/components/qr/QrInvalid';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pesanan saya', robots: { index: false, follow: false } };

/** Where the customer lands after ordering: number, items and whether it's paid. */
export default async function OrderStatusPage({ params }: { params: Promise<{ token: string; orderId: string }> }) {
  const { token, orderId } = await params;
  const table = await tableByToken(token);
  if (!table) return <QrInvalid />;
  const order = await publicOrder(table, orderId);
  if (!order) return <QrInvalid />;
  return <QrStatus token={token} orderId={orderId} tableName={table.name} initial={order} />;
}
