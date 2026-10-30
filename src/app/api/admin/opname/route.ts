import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { opnameSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';
import { saveOpnameTx } from '@/lib/pos/stock';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, opnameSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  const { id, auditId } = await prisma.$transaction(async tx => {
    const r = await saveOpnameTx(tx, { outletId: outlet.id, actor, note: data.note, lines: data.lines });
    return { id: r.id, auditId: await audit(actor, 'stock.opname', r.id, { lines: data.lines.length }, tx) };
  }, { timeout: 20_000 });
  queueSync({ stockDoc: { opname: id } }, { auditLog: auditId });
  return NextResponse.json({ id });
}
