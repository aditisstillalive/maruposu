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


/**
 * Creates or updates an option group. Existing options keep their ids (their
 * recipes hang off them); options left out are deleted with their recipes.
 * Returns the group id.
 */
export async function saveOptionGroup(tx: Prisma.TransactionClient, outletId: string, id: string | null, group: OptionGroupInput): Promise<string> {
  const { options, ...fields } = group;
  const groupId = id
    ? (await tx.optionGroup.update({ where: { id }, data: fields })).id
    : (await tx.optionGroup.create({ data: { ...fields, outlet_id: outletId } })).id;

  const existing = new Set((await tx.option.findMany({ where: { group_id: groupId }, select: { id: true } })).map(o => o.id));
  const kept: string[] = [];
  for (const [sort_order, { id: optionId, ...o }] of options.entries()) {
    if (optionId && existing.has(optionId)) {
      await tx.option.update({ where: { id: optionId }, data: { ...o, sort_order } });
      kept.push(optionId);
    } else {
      kept.push((await tx.option.create({ data: { ...o, sort_order, group_id: groupId } })).id);
    }
  }
  await tx.option.deleteMany({ where: { group_id: groupId, id: { notIn: kept } } });
  return groupId;
}
