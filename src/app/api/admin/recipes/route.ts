import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { recipeSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

export async function PUT(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, recipeSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  const target = data.product_id
    ? await prisma.product.findFirst({ where: { id: data.product_id, category: { outlet_id: outlet.id } }, select: { id: true, name: true } })
    : await prisma.option.findFirst({ where: { id: data.option_id, group: { outlet_id: outlet.id } }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: 'Produk/pilihan tidak ditemukan' }, { status: 404 });
  const known = await prisma.ingredient.count({ where: { outlet_id: outlet.id, id: { in: data.lines.map(l => l.ingredient_id) } } });
  if (known !== data.lines.length) return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 400 });

  const where = data.product_id ? { product_id: data.product_id } : { option_id: data.option_id };
  const auditId = await prisma.$transaction(async tx => {
    await tx.recipeLine.deleteMany({ where });
    await tx.recipeLine.createMany({ data: data.lines.map(l => ({ ...where, ingredient_id: l.ingredient_id, qty: l.qty })) });
    return audit(actor, 'recipe.update', target.id, { name: target.name, lines: data.lines }, tx);
  });
  queueSync({ recipe: data.product_id ? { product: data.product_id } : { option: data.option_id } }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
