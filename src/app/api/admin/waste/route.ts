import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { adminWasteSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';
import { recordWasteTx } from '@/lib/pos/stock';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, adminWasteSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  const id = crypto.randomUUID();
  const auditId = await prisma.$transaction(async tx => {
    await recordWasteTx(tx, { id, outletId: outlet.id, source: 'admin', reason: data.reason, note: data.note, actor, at: new Date(), lines: data.lines });
    return audit(actor, 'stock.waste', id, { reason: data.reason, lines: data.lines }, tx);
  });
  queueSync({ stockDoc: { waste: id } }, { auditLog: auditId });
  return NextResponse.json({ id });
}
