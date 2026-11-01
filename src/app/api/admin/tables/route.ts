import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { diningTableSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync } from '@/lib/replica-sync';
import { newTableToken } from '@/lib/qr/tables';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, diningTableSchema);
  if (data instanceof NextResponse) return data;
  const outlet = await getCurrentOutlet();
  try {
    const table = await prisma.diningTable.create({ data: { ...data, outlet_id: outlet.id, token: newTableToken() } });
    queueSync({ diningTable: table.id });
    return NextResponse.json(table);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Nama meja sudah dipakai' }, { status: 400 });
    throw e;
  }
}
