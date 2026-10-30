import { readDb } from '@/lib/db-router';
import { requireDevice } from '@/lib/device';
import { getCurrentOutlet } from '@/lib/outlet';
import EmployeeGrid from '@/components/pos/EmployeeGrid';
import Image from 'next/image';
import LockButton from '@/components/pos/LockButton';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  await requireDevice();
  const outlet = await getCurrentOutlet();
  const employees = await readDb(db =>
    db.employee.findMany({
      where: { outlet_id: outlet.id, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, photo_url: true },
    })
  );

  return (
    <main className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <Image src={site.wordmark} alt={outlet.setting.cafe_name} width={475} height={138} className="h-7 w-auto" />
        <LockButton />
      </header>
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-light tracking-tight md:text-3xl">Siapa yang melayani?</h1>
        <p className="mt-1 text-sm text-gray-500">Nama ini tercetak di bill sebagai kasir.</p>
        <EmployeeGrid employees={employees} />
      </section>
    </main>
  );
}
