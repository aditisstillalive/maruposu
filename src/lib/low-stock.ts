import { cachedRead } from '@/lib/data-cache';
import { prisma } from '@/lib/prisma';
import { isLow } from '@/lib/pos/inventory';

/**
 * Active ingredients at or under their minimum, for the admin badge and the
 * dashboard (display only; sales read stock from the database). Cached until
 * the next write, read from the primary so the cache never holds replica lag.
 */
export const lowStockIngredients = cachedRead('low-stock', async () =>
  (
    await prisma.ingredient.findMany({
      where: { is_active: true, min_stock: { not: null } },
      orderBy: { name: 'asc' },
      select: { id: true, outlet_id: true, name: true, unit: true, stock: true, min_stock: true },
    })
  ).filter(i => isLow(i.stock, i.min_stock))
);
