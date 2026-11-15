import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { adminCloseSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { closeShiftTx, isRejected } from '@/lib/pos/apply';
import { queueSync } from '@/lib/replica-sync';

// Closes a shift the tablet couldn't (lost, broken, forgotten). Open bills stay
// open and move to the next shift when it opens.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(request, adminCloseSchema);
  if (body instanceof NextResponse) return body;

  const { id } = await params;
  const outlet = await getCurrentOutlet();
  try {
    const result = await prisma.$transaction(tx =>
      closeShiftTx(
        tx,
        {
          outletId: outlet.id,
          tax: { name: outlet.setting.tax_name, rate_bp: outlet.setting.tax_rate_bp, inclusive: outlet.setting.tax_inclusive },
        },
        { shiftId: id, denominations: body.denominations, note: body.reason, closedBy: actor, via: 'admin', at: new Date() }
      )
    );
    queueSync({ shift: id }, { auditLog: result.auditId });
    return NextResponse.json({ ok: true, expected: result.expected, variance: result.variance });
  } catch (e) {
    if (isRejected(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
