import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { productSchema } from '@/lib/schemas';
import { productData, productGroupLinks } from '@/lib/menu-admin';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, productSchema);
  if (data instanceof NextResponse) return data;

  if (!(await prisma.category.findUnique({ where: { id: data.category_id } }))) {
    return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 400 });
  }
  const product = await prisma.$transaction(async tx => {
    const created = await tx.product.create({
      data: { ...productData(data), option_groups: { createMany: { data: productGroupLinks(data.option_group_ids) } } },
    });
    const auditId = await audit(actor, 'product.create', created.id, { name: created.name, price: created.price }, tx);
    return { ...created, auditId };
  });
  queueSync({ product: product.id }, { auditLog: product.auditId });
  return NextResponse.json(product);
}
