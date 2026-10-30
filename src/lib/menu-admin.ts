import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { productSchema, OptionGroupInput } from '@/lib/schemas';

type ProductInput = z.infer<typeof productSchema>;

// Column data for Product create/update; option links are written separately.
export function productData({ option_group_ids: _ids, ...rest }: ProductInput) {
  return rest;
}

export function productGroupLinks(ids: string[]): Prisma.ProductOptionGroupCreateManyProductInput[] {
  return [...new Set(ids)].map((group_id, sort_order) => ({ group_id, sort_order }));
}

export function optionRows(group: OptionGroupInput): Prisma.OptionCreateManyGroupInput[] {
  return group.options.map((o, sort_order) => ({ ...o, sort_order }));
}
