import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { categorySchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, categorySchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  try {
    const category = await prisma.category.create({ data: { ...data, outlet_id: outlet.id } });
    queueSync({ category: category.id });
    return NextResponse.json(category);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Kategori dengan nama ini sudah ada' }, { status: 409 });
    }
    throw e;
  }
}
