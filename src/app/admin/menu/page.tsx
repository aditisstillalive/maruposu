import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import PageHeader from '@/components/admin/PageHeader';
import MenuManager from './menu-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu | Admin' };

export default async function MenuPage() {
  const outlet = await getCurrentOutlet();
  const [categories, groups] = await Promise.all([
    prisma.category.findMany({
      where: { outlet_id: outlet.id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          include: { option_groups: { orderBy: { sort_order: 'asc' }, select: { group_id: true } } },
        },
      },
    }),
    prisma.optionGroup.findMany({
      where: { outlet_id: outlet.id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true },
    }),
  ]);

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Menu" description="Kategori dan produk yang dijual di POS." />
      <MenuManager
        categories={categories.map(c => ({
          id: c.id,
          name: c.name,
          sort_order: c.sort_order,
          is_active: c.is_active,
          products: c.products.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            photo_url: p.photo_url,
            is_active: p.is_active,
            is_sold_out: p.is_sold_out,
            sort_order: p.sort_order,
            category_id: p.category_id,
            option_group_ids: p.option_groups.map(g => g.group_id),
          })),
        }))}
        groups={groups}
      />
    </div>
  );
}
