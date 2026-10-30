import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { categorySchema } from '@/lib/schemas';
import { queueSync } from '@/lib/replica-sync';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, categorySchema);
  if (data instanceof NextResponse) return data;

  const { id } = await params;
  try {
    const updated = await prisma.category.updateMany({ where: { id }, data });
    if (updated.count === 0) return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Kategori dengan nama ini sudah ada' }, { status: 409 });
    }
    throw e;
  }
  queueSync({ category: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;

  const products = await prisma.product.count({ where: { category_id: id } });
  if (products > 0) {
    return NextResponse.json({ error: `Masih ada ${products} produk di kategori ini` }, { status: 409 });
  }
  await prisma.category.deleteMany({ where: { id } });
  queueSync({ category: id });
  return NextResponse.json({ ok: true });
}
