import type { PrismaClient, Prisma } from '@prisma/client';
import type { MenuProduct, SnapshotCategory } from './types';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Active categories and products with their option groups, in menu order —
 * what the till and the customer order page show and what QR orders are
 * checked against.
 */
export async function loadMenu(db: Db, outletId: string): Promise<{ categories: SnapshotCategory[]; products: MenuProduct[] }> {
  const [categories, groups] = await Promise.all([
    db.category.findMany({
      where: { outlet_id: outletId, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: { is_active: true },
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          include: { option_groups: { orderBy: { sort_order: 'asc' } } },
        },
      },
    }),
    db.optionGroup.findMany({
      where: { outlet_id: outletId },
      include: { options: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
    }),
  ]);
  const groupById = new Map(groups.map(g => [g.id, g]));
  const products: MenuProduct[] = categories.flatMap(c =>
    c.products.map(p => ({
      id: p.id, category_id: c.id, name: p.name, price: p.price, photo_url: p.photo_url, is_sold_out: p.is_sold_out,
      groups: p.option_groups
        .map(link => groupById.get(link.group_id))
        .filter((g): g is NonNullable<typeof g> => !!g && g.options.length > 0)
        .map(g => ({
          id: g.id, name: g.name, kind: g.kind as 'variant' | 'addon', required: g.required,
          min_select: g.min_select, max_select: g.max_select,
          options: g.options.map(o => ({ id: o.id, name: o.name, price_delta: o.price_delta, is_default: o.is_default })),
        })),
    }))
  );
  return { categories: categories.map(c => ({ id: c.id, name: c.name })), products };
}
