import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { toPromoRule } from '@/lib/pos/promo-map';
import PageHeader from '@/components/admin/PageHeader';
import PromoManager from './promo-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promo | Admin' };

export default async function PromosPage() {
  const outlet = await getCurrentOutlet();
  const [promos, categories] = await Promise.all([
    prisma.promo.findMany({ where: { outlet_id: outlet.id }, orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }] }),
    prisma.category.findMany({
      where: { outlet_id: outlet.id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, products: { orderBy: [{ sort_order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } } },
    }),
  ]);
  return (
    <div className="p-4 md:p-8">
      <PromoManager promos={promos.map(toPromoRule)} categories={categories}>
        <PageHeader title="Promo & Kupon" description="Satu promo per bill. Promo tanpa kode dipilih kasir dari daftar; kupon dipakai dengan memasukkan kodenya." />
      </PromoManager>
    </div>
  );
}
