import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { optionGroupSchema } from '@/lib/schemas';
import { saveOptionGroup } from '@/lib/menu-admin';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const group = await parseBody(request, optionGroupSchema);
  if (group instanceof NextResponse) return group;

  const outlet = await getCurrentOutlet();
  const id = await prisma.$transaction(tx => saveOptionGroup(tx, outlet.id, null, group));
  queueSync({ optionGroup: id });
  return NextResponse.json(await prisma.optionGroup.findUnique({ where: { id }, include: { options: { orderBy: { sort_order: 'asc' } } } }));
}
