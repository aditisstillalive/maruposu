import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { settingSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

export async function PUT(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, settingSchema);
  if (data instanceof NextResponse) return data;

  const { setting } = await getCurrentOutlet();
  const auditId = await prisma.$transaction(async tx => {
    await tx.setting.update({ where: { id: setting.id }, data: { ...data, updated_by: actor } });
    return audit(actor, 'setting.update', setting.id, {
      before: { tax_name: setting.tax_name, tax_rate_bp: setting.tax_rate_bp, tax_inclusive: setting.tax_inclusive },
      after: { tax_name: data.tax_name, tax_rate_bp: data.tax_rate_bp, tax_inclusive: data.tax_inclusive },
    }, tx);
  });
  queueSync({ setting: setting.id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
