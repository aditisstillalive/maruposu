import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdminApi } from '@/lib/admin-auth';
import { parseBody } from '@/lib/admin-api';
import { masterPinSchema } from '@/lib/schemas';
import { hashMasterPin } from '@/lib/master-pin';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

// Super admin only. Bumping pin_version locks every tablet unlocked with the old PIN.
export async function PUT(request: NextRequest) {
  const admin = await requireSuperAdminApi();
  if (admin instanceof NextResponse) return admin;
  const body = await parseBody(request, masterPinSchema);
  if (body instanceof NextResponse) return body;

  const { setting } = await getCurrentOutlet();
  const master_pin_hash = await hashMasterPin(body.pin);
  const auditId = await prisma.$transaction(async tx => {
    await tx.setting.update({
      where: { id: setting.id },
      data: { master_pin_hash, pin_version: { increment: 1 }, updated_by: admin.email },
    });
    return audit(admin.email, 'master_pin.change', setting.id, undefined, tx);
  });
  queueSync({ setting: setting.id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
