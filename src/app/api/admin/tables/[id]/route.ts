import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { diningTablePatchSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';
import { newTableToken } from '@/lib/qr/tables';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, diningTablePatchSchema);
  if (data instanceof NextResponse) return data;
  const { id } = await params;
  const { regenerate, ...fields } = data;
  try {
    const table = await prisma.diningTable.update({ where: { id }, data: { ...fields, ...(regenerate ? { token: newTableToken() } : {}) } });
    const auditId = regenerate ? await audit(actor, 'table.qr_regenerate', id, { name: table.name }) : null;
    queueSync({ diningTable: id }, ...(auditId ? [{ auditLog: auditId }] : []));
    return NextResponse.json(table);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Nama meja sudah dipakai' }, { status: 400 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return NextResponse.json({ error: 'Meja tidak ditemukan' }, { status: 404 });
    throw e;
  }
}

/** Bills keep the table's name; their link to it is cleared. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  await prisma.diningTable.deleteMany({ where: { id } });
  queueSync({ diningTable: id });
  return NextResponse.json({ ok: true });
}
