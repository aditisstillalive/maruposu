import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

type Params = { params: Promise<{ id: string }> };

/** The owner has dealt with a voucher conflict/rejection (e.g. absorbed the loss): off the problem list. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, z.object({ handled: z.literal(true) }));
  if (data instanceof NextResponse) return data;
  const { id } = await params;
  const r = await prisma.voucherRedemption.findUnique({ where: { id } });
  if (!r || !['conflict', 'rejected'].includes(r.state)) return NextResponse.json({ error: 'Voucher bermasalah tidak ditemukan' }, { status: 404 });
  await prisma.voucherRedemption.update({ where: { id }, data: { handled_at: new Date(), handled_by: actor } });
  const auditId = await audit(actor, 'voucher.handled', r.order_id, { code: r.code, state: r.state, amount: r.amount });
  queueSync({ orders: [r.order_id] }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
