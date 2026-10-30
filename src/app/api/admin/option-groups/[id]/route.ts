import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { optionGroupSchema } from '@/lib/schemas';
import { saveOptionGroup } from '@/lib/menu-admin';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

type Params = { params: Promise<{ id: string }> };

// Existing options keep their ids (recipes hang off them); bills keep their own
// name/price snapshot, so editing options never changes past bills.
export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const group = await parseBody(request, optionGroupSchema);
  if (group instanceof NextResponse) return group;

  const { id } = await params;
  if (!(await prisma.optionGroup.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: 'Grup tidak ditemukan' }, { status: 404 });
  }
  const outlet = await getCurrentOutlet();
  const auditId = await prisma.$transaction(async tx => {
    await saveOptionGroup(tx, outlet.id, id, group);
    return audit(actor, 'option_group.update', id, { name: group.name, options: group.options }, tx);
  });
  queueSync({ optionGroup: id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  await prisma.optionGroup.deleteMany({ where: { id } });
  queueSync({ optionGroup: id });
  return NextResponse.json({ ok: true });
}
