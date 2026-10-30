import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { employeeSchema } from '@/lib/schemas';
import { queueSync } from '@/lib/replica-sync';

// No DELETE: employees will be referenced by orders and shifts, so they're deactivated instead.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, employeeSchema);
  if (data instanceof NextResponse) return data;

  const { id } = await params;
  const updated = await prisma.employee.updateMany({ where: { id }, data });
  if (updated.count === 0) return NextResponse.json({ error: 'Karyawan tidak ditemukan' }, { status: 404 });
  queueSync({ employee: id });
  return NextResponse.json({ ok: true });
}
