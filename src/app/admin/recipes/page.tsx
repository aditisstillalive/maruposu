import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import PageHeader from '@/components/admin/PageHeader';
import RecipeEditor from './recipe-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Resep & HPP | Admin' };

export default async function RecipesPage() {
  const outlet = await getCurrentOutlet();
  const [categories, groups, ingredients] = await Promise.all([
    prisma.category.findMany({
      where: { outlet_id: outlet.id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { products: { orderBy: [{ sort_order: 'asc' }, { name: 'asc' }], include: { recipe: true } } },
    }),
    prisma.optionGroup.findMany({
      where: { outlet_id: outlet.id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { options: { orderBy: { sort_order: 'asc' }, include: { recipe: true } } },
    }),
    prisma.ingredient.findMany({ where: { outlet_id: outlet.id }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, avg_cost_milli: true, is_active: true } }),
  ]);
  const lines = (r: { ingredient_id: string; qty: number }[]) => r.map(l => ({ ingredient_id: l.ingredient_id, qty: l.qty }));
  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Resep & HPP" description="Bahan per porsi. Resep produk dipakai untuk setiap penjualan; resep pilihan ditambahkan bila pilihan itu dipilih. HPP memakai harga rata-rata bahan." />
      <RecipeEditor
        categories={categories.map(c => ({ id: c.id, name: c.name, products: c.products.map(p => ({ id: p.id, name: p.name, price: p.price, lines: lines(p.recipe) })) }))}
        groups={groups.map(g => ({ id: g.id, name: g.name, options: g.options.map(o => ({ id: o.id, name: o.name, price: o.price_delta, lines: lines(o.recipe) })) }))}
        ingredients={ingredients}
      />
    </div>
  );
}
