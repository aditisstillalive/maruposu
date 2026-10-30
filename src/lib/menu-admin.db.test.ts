import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { saveOptionGroup } from './menu-admin';
import { optionGroupSchema } from './schemas';

let outletId = '';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "RecipeLine","Ingredient","ProductOptionGroup","Option","OptionGroup","Outlet" CASCADE');
  outletId = (await prisma.outlet.create({ data: { name: 'M' } })).id;
});

describe('saveOptionGroup', () => {
  it('editing a group keeps existing option ids and their recipes', async () => {
    const created = await prisma.$transaction(tx =>
      saveOptionGroup(tx, outletId, null, optionGroupSchema.parse({ name: 'Suhu', kind: 'variant', required: true, options: [{ name: 'Ice', price_delta: 0 }, { name: 'Hot', price_delta: 0 }] }))
    );
    const [ice, hot] = await prisma.option.findMany({ where: { group_id: created }, orderBy: { sort_order: 'asc' } });
    const es = await prisma.ingredient.create({ data: { outlet_id: outletId, name: 'Es batu', unit: 'g' } });
    await prisma.recipeLine.create({ data: { ingredient_id: es.id, option_id: ice.id, qty: 150 } });
    await prisma.recipeLine.create({ data: { ingredient_id: es.id, option_id: hot.id, qty: 1 } });

    await prisma.$transaction(tx =>
      saveOptionGroup(tx, outletId, created, optionGroupSchema.parse({
        name: 'Suhu', kind: 'variant', required: true,
        options: [{ id: ice.id, name: 'Iced', price_delta: 0 }, { name: 'Warm', price_delta: 0 }],
      }))
    );
    const after = await prisma.option.findMany({ where: { group_id: created }, orderBy: { sort_order: 'asc' } });
    expect(after.map(o => o.name)).toEqual(['Iced', 'Warm']);
    expect(after[0].id).toBe(ice.id);
    expect(await prisma.recipeLine.findMany({ where: { option_id: ice.id } })).toHaveLength(1);
    expect(await prisma.option.findUnique({ where: { id: hot.id } })).toBeNull();
    expect(await prisma.recipeLine.count({ where: { option_id: hot.id } })).toBe(0);
  });

  it("ignores an option id from another group", async () => {
    const a = await prisma.$transaction(tx => saveOptionGroup(tx, outletId, null, optionGroupSchema.parse({ name: 'A', kind: 'addon', required: false, options: [{ name: 'x', price_delta: 0 }] })));
    const b = await prisma.$transaction(tx => saveOptionGroup(tx, outletId, null, optionGroupSchema.parse({ name: 'B', kind: 'addon', required: false, options: [{ name: 'y', price_delta: 0 }] })));
    const foreign = (await prisma.option.findFirstOrThrow({ where: { group_id: a } })).id;
    await prisma.$transaction(tx => saveOptionGroup(tx, outletId, b, optionGroupSchema.parse({ name: 'B', kind: 'addon', required: false, options: [{ id: foreign, name: 'z', price_delta: 0 }] })));
    expect((await prisma.option.findUniqueOrThrow({ where: { id: foreign } })).group_id).toBe(a);
  });
});
