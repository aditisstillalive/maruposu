import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { ingredientSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, ingredientSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  try {
    const { ingredient, auditId } = await prisma.$transaction(async tx => {
      const ingredient = await tx.ingredient.create({ data: { ...data, outlet_id: outlet.id } });
      return { ingredient, auditId: await audit(actor, 'ingredient.create', ingredient.id, data, tx) };
    });
    queueSync({ ingredients: [ingredient.id] }, { auditLog: auditId });
    return NextResponse.json(ingredient);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Bahan dengan nama ini sudah ada' }, { status: 409 });
    }
    throw e;
  }
}
