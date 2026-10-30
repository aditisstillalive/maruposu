import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { ingredientSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

// No DELETE: movements and recipes refer to ingredients; deactivate instead.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, ingredientSchema);
  if (data instanceof NextResponse) return data;

  const { id } = await params;
  const before = await prisma.ingredient.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 });
  // Stock and recipes are counted in this unit; changing it would silently rescale them
  if (before.unit !== data.unit && (await prisma.stockMovement.count({ where: { ingredient_id: id } })) > 0) {
    return NextResponse.json({ error: 'Satuan tidak bisa diubah karena bahan sudah punya riwayat stok' }, { status: 409 });
  }
  try {
    const auditId = await prisma.$transaction(async tx => {
      await tx.ingredient.update({ where: { id }, data });
      return audit(actor, 'ingredient.update', id, { before: { name: before.name, unit: before.unit, min_stock: before.min_stock }, after: data }, tx);
    });
    queueSync({ ingredients: [id] }, { auditLog: auditId });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Bahan dengan nama ini sudah ada' }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
