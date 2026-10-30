import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { DUPLICATE_CODE, promoSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, promoSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  try {
    const { promo, auditId } = await prisma.$transaction(async tx => {
      const promo = await tx.promo.create({ data: { ...data, outlet_id: outlet.id } });
      return { promo, auditId: await audit(actor, 'promo.create', promo.id, data, tx) };
    });
    queueSync({ promo: promo.id }, { auditLog: auditId });
    return NextResponse.json(promo);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    }
    throw e;
  }
}
