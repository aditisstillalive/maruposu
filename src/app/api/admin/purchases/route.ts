import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { purchaseSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';
import { toBaseQty } from '@/lib/pos/inventory';
import { postStock } from '@/lib/pos/stock';

// Stock in: adds the bought quantities and moves each ingredient's average cost.
export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, purchaseSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  const ingredients = await prisma.ingredient.findMany({ where: { outlet_id: outlet.id, id: { in: data.lines.map(l => l.ingredient_id) } } });
  const lines = data.lines.map(l => {
    const ing = ingredients.find(i => i.id === l.ingredient_id);
    return ing ? { ingredient_id: ing.id, qty: toBaseQty(l.amount, l.unit, ing.purchase_size), total_cost: l.total_cost } : null;
  });
  if (lines.some(l => !l || l.qty < 1)) return NextResponse.json({ error: 'Bahan tidak ditemukan atau jumlah terlalu kecil' }, { status: 400 });
  const valid = lines as { ingredient_id: string; qty: number; total_cost: number }[];

  const { purchase, auditId } = await prisma.$transaction(async tx => {
    const purchase = await tx.purchase.create({
      data: {
        outlet_id: outlet.id, supplier: data.supplier, note: data.note, created_by: actor,
        total: valid.reduce((s, l) => s + l.total_cost, 0), items: { create: valid },
      },
    });
    await postStock(tx, { outletId: outlet.id, actor, refType: 'purchase', refId: purchase.id, note: data.supplier, lines: valid.map(l => ({ ...l, kind: 'purchase' as const })) });
    return { purchase, auditId: await audit(actor, 'stock.purchase', purchase.id, { total: purchase.total, lines: valid }, tx) };
  });
  queueSync({ stockDoc: { purchase: purchase.id } }, { auditLog: auditId });
  return NextResponse.json(purchase);
}
