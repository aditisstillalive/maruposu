import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { queueSync } from '@/lib/replica-sync';
import { loadMenu } from '@/lib/pos/menu';
import { linesFromCart, QrOrderError, qrOrderSchema, submitQrOrder, sweepQrOrders } from '@/lib/pos/qr-order';
import { tableByToken } from '@/lib/qr/public';

export const dynamic = 'force-dynamic';

/** Most a table's open bill may hold, so one QR can't flood the till. */
const MAX_BILL_ITEMS = 150;

/** A customer's order from the table's QR page: becomes (or joins) the table's open bill. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const table = await tableByToken(token);
  if (!table) return NextResponse.json({ error: 'QR meja tidak berlaku. Minta bantuan kasir.' }, { status: 404 });
  if (!rateLimit(`qr:table:${table.id}`, 6, 60_000) || !rateLimit(`qr:ip:${clientIp(request.headers)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Terlalu banyak pesanan. Tunggu sebentar lalu coba lagi.' }, { status: 429 });
  }
  const parsed = qrOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pesanan tidak valid' }, { status: 400 });

  const now = new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await prisma.$transaction(async tx => {
        const swept = await sweepQrOrders(tx, table.outlet_id, now);
        const shift = await tx.shift.findFirst({ where: { outlet_id: table.outlet_id, status: 'open' }, select: { id: true } });
        if (!shift) throw new QrOrderError('Kasir belum buka. Silakan pesan langsung di kasir.');
        // Fresh from the primary: prices, sold-out and option rules as they are now
        const { products } = await loadMenu(tx, table.outlet_id);
        const lines = linesFromCart(products, parsed.data.items);
        const open = await tx.orderItem.count({ where: { order: { table_id: table.id, status: 'open' } } });
        if (open + lines.length > MAX_BILL_ITEMS) throw new QrOrderError('Pesanan meja ini sudah terlalu banyak. Silakan ke kasir.');
        const r = await submitQrOrder(tx, { outletId: table.outlet_id, shiftId: shift.id, table, lines, customerName: parsed.data.customer_name || null, now });
        return { ...r, swept };
      });
      queueSync({ orders: [result.orderId, ...result.swept.orderIds] }, ...[result.auditId, ...result.swept.auditIds].map(auditLog => ({ auditLog })));
      return NextResponse.json({ order_id: result.orderId, number: result.number, appended: result.appended });
    } catch (e) {
      if (e instanceof QrOrderError) return NextResponse.json({ error: e.message }, { status: 409 });
      // Two new bills took the same number at once: try again
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
      console.error('QR order failed:', e);
      return NextResponse.json({ error: 'Server sedang bermasalah, coba lagi' }, { status: 503 });
    }
  }
}
