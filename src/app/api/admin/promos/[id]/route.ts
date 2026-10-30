import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { DUPLICATE_CODE, promoSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, promoSchema);
  if (data instanceof NextResponse) return data;

  const { id } = await params;
  if (!(await prisma.promo.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: 'Promo tidak ditemukan' }, { status: 404 });
  }
  try {
    const auditId = await prisma.$transaction(async tx => {
      await tx.promo.update({ where: { id }, data });
      return audit(actor, 'promo.update', id, data, tx);
    });
    queueSync({ promo: id }, { auditLog: auditId });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) return NextResponse.json({ ok: true });
  const auditId = await prisma.$transaction(async tx => {
    await tx.promo.delete({ where: { id } });
    return audit(actor, 'promo.delete', id, { name: promo.name, code: promo.code, used_count: promo.used_count }, tx);
  });
  queueSync({ promo: id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
