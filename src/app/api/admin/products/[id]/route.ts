import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { productSchema } from '@/lib/schemas';
import { productData, productGroupLinks } from '@/lib/menu-admin';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, productSchema);
  if (data instanceof NextResponse) return data;

  const { id } = await params;
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  if (!(await prisma.category.findUnique({ where: { id: data.category_id } }))) {
    return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 400 });
  }

  const auditId = await prisma.$transaction(async tx => {
    await tx.product.update({ where: { id }, data: productData(data) });
    await tx.productOptionGroup.deleteMany({ where: { product_id: id } });
    await tx.productOptionGroup.createMany({
      data: productGroupLinks(data.option_group_ids).map(link => ({ ...link, product_id: id })),
    });
    if (before.price === data.price) return null;
    return audit(actor, 'product.price_change', id, { name: data.name, from: before.price, to: data.price }, tx);
  });
  queueSync({ product: id }, ...(auditId ? [{ auditLog: auditId }] : []));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ ok: true });
  const auditId = await prisma.$transaction(async tx => {
    await tx.product.delete({ where: { id } });
    return audit(actor, 'product.delete', id, { name: product.name, price: product.price }, tx);
  });
  queueSync({ product: id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
