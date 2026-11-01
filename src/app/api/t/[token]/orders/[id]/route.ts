import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueSync } from '@/lib/replica-sync';
import { sweepQrOrders } from '@/lib/pos/qr-order';
import { publicOrder, tableByToken } from '@/lib/qr/public';

export const dynamic = 'force-dynamic';

/** The status page polls this until the bill is paid or cancelled. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const table = await tableByToken(token);
  if (!table) return NextResponse.json({ error: 'QR meja tidak berlaku' }, { status: 404 });
  let order = await publicOrder(table, id);
  if (!order) return NextResponse.json({ error: 'Pesanan tidak ditemukan' }, { status: 404 });
  if (order.status === 'waiting') {
    // An unpaid bill may have run out its 30 minutes
    const swept = await prisma.$transaction(tx => sweepQrOrders(tx, table.outlet_id, new Date()));
    if (swept.orderIds.length) {
      queueSync({ orders: swept.orderIds }, ...swept.auditIds.map(auditLog => ({ auditLog })));
      order = (await publicOrder(table, id)) ?? order;
    }
  }
  return NextResponse.json(order, { headers: { 'Cache-Control': 'no-store' } });
}
