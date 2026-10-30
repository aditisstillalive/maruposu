import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import PageHeader from '@/components/admin/PageHeader';
import OptionGroupManager from './option-group-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Varian & Add-on | Admin' };

export default async function OptionsPage() {
  const outlet = await getCurrentOutlet();
  const groups = await prisma.optionGroup.findMany({
    where: { outlet_id: outlet.id },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    include: {
      options: { orderBy: { sort_order: 'asc' } },
      _count: { select: { products: true } },
    },
  });
  return (
    <div className="p-4 md:p-8">
      <OptionGroupManager
        groups={groups.map(g => ({
          id: g.id,
          name: g.name,
          kind: g.kind as 'variant' | 'addon',
          required: g.required,
          max_select: g.max_select,
          product_count: g._count.products,
          options: g.options.map(o => ({ id: o.id, name: o.name, price_delta: o.price_delta, is_default: o.is_default, is_active: o.is_active })),
        }))}
      >
        <PageHeader
          title="Varian & Add-on"
          description="Varian: pilih satu (Hot/Ice, level gula). Add-on: boleh lebih dari satu, dengan harga tambahan (extra shot, topping)."
        />
      </OptionGroupManager>
    </div>
  );
}
