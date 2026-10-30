// Creates the outlet, its settings (master PIN) and the super admin. Safe to re-run:
// existing rows are left alone, so a re-run never resets a PIN changed in the admin.
//   npm run db:seed            # needs SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_PASSWORD, SEED_MASTER_PIN
//   npm run db:seed -- --demo  # also adds sample employees and menu (local testing only)
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { hashMasterPin } from '../src/lib/master-pin';
import { ADMIN_PASSWORD_MIN, masterPinSchema } from '../src/lib/schemas';

const prisma = new PrismaClient();

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  let outlet = await prisma.outlet.findFirst({ orderBy: { created_at: 'asc' }, include: { setting: true } });
  if (!outlet) {
    outlet = await prisma.outlet.create({
      data: { name: 'Maraca Books & Coffee', address: 'Jl. Jalak Harupat No.9A, Babakan, Bogor Tengah, Kota Bogor' },
      include: { setting: true },
    });
    console.log('Created outlet', outlet.name);
  }

  if (!outlet.setting) {
    const pin = env('SEED_MASTER_PIN');
    const check = masterPinSchema.safeParse({ pin, confirm: pin });
    if (!check.success) throw new Error(`SEED_MASTER_PIN: ${check.error.issues[0]?.message}`);
    await prisma.setting.create({
      data: { outlet_id: outlet.id, cafe_name: outlet.name, master_pin_hash: await hashMasterPin(pin) },
    });
    console.log('Created settings with the master PIN from SEED_MASTER_PIN');
  }

  const email = env('SEED_SUPER_ADMIN_EMAIL').toLowerCase();
  if (!(await prisma.adminUser.findUnique({ where: { email } }))) {
    const password = env('SEED_SUPER_ADMIN_PASSWORD');
    if (password.length < ADMIN_PASSWORD_MIN) throw new Error(`SEED_SUPER_ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN} characters`);
    await prisma.adminUser.create({
      data: { email, password: await bcrypt.hash(password, 12), role: 'super_admin', added_by: 'seed' },
    });
    console.log('Created super admin', email);
  }

  if (process.argv.includes('--demo')) await seedDemo(outlet.id);
}

async function seedDemo(outletId: string) {
  if (await prisma.employee.count()) return console.log('Demo data skipped (employees exist)');
  await prisma.employee.createMany({
    data: ['Rani', 'Dimas', 'Sekar'].map((name, sort_order) => ({ outlet_id: outletId, name, sort_order })),
  });
  const suhu = await prisma.optionGroup.create({
    data: {
      outlet_id: outletId, name: 'Suhu', kind: 'variant', required: true, min_select: 1, max_select: 1,
      options: { create: [{ name: 'Ice', is_default: true, sort_order: 0 }, { name: 'Hot', sort_order: 1 }] },
    },
  });
  const gula = await prisma.optionGroup.create({
    data: {
      outlet_id: outletId, name: 'Level Gula', kind: 'variant', required: true, min_select: 1, max_select: 1,
      options: { create: ['Normal', 'Less', 'No Sugar'].map((name, i) => ({ name, is_default: i === 0, sort_order: i })) },
    },
  });
  const extra = await prisma.optionGroup.create({
    data: {
      outlet_id: outletId, name: 'Extra', kind: 'addon', required: false, min_select: 0, max_select: 3,
      options: { create: [{ name: 'Extra shot', price_delta: 6000 }, { name: 'Oat milk', price_delta: 8000, sort_order: 1 }] },
    },
  });
  const coffee = [suhu.id, gula.id, extra.id];
  const menu: [string, [string, number, string[]][]][] = [
    ['Kopi', [['Es Kopi Susu', 22000, coffee], ['Americano', 20000, [suhu.id, extra.id]], ['Butterscotch Latte', 30000, coffee]]],
    ['Non-Kopi', [['Matcha Latte', 28000, [suhu.id, gula.id]], ['Teh Tarik', 18000, [suhu.id, gula.id]]]],
    ['Makanan', [['Chicken Bolognese', 39000, []], ['Croissant', 20000, []]]],
  ];
  for (const [i, [category, products]] of menu.entries()) {
    await prisma.category.create({
      data: {
        outlet_id: outletId, name: category, sort_order: i,
        products: {
          create: products.map(([name, price, groups], sort_order) => ({
            name, price, sort_order,
            option_groups: { create: groups.map((group_id, j) => ({ group_id, sort_order: j })) },
          })),
        },
      },
    });
  }
  console.log('Added demo employees and menu');
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
