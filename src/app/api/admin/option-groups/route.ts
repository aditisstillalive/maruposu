import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { optionGroupSchema } from '@/lib/schemas';
import { optionRows } from '@/lib/menu-admin';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const group = await parseBody(request, optionGroupSchema);
  if (group instanceof NextResponse) return group;

  const outlet = await getCurrentOutlet();
  const { options: _options, ...fields } = group;
  const created = await prisma.optionGroup.create({
    data: { ...fields, outlet_id: outlet.id, options: { createMany: { data: optionRows(group) } } },
    include: { options: { orderBy: { sort_order: 'asc' } } },
  });
  queueSync({ optionGroup: created.id });
  return NextResponse.json(created);
}
