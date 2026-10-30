import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { readCashier, requireDevice } from '@/lib/device';
import { getCurrentOutlet } from '@/lib/outlet';
import EmployeeAvatar from '@/components/pos/EmployeeAvatar';
import Image from 'next/image';
import LockButton from '@/components/pos/LockButton';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  await requireDevice();
  const cashier = await readCashier();
  if (!cashier) redirect('/staff');
  const { setting } = await getCurrentOutlet();

  return (
    <main className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="flex items-center gap-4 border-b bg-white px-6 py-3">
        <Image src={site.wordmark} alt={setting.cafe_name} width={475} height={138} className="h-7 w-auto" />
        <span className="ml-auto flex items-center gap-2 text-sm">
          <EmployeeAvatar name={cashier.name} photoUrl={cashier.photo_url} size="sm" />
          <span className="text-gray-500">Kasir:</span>
          <span className="font-medium">{cashier.name}</span>
        </span>
        <Link
          href="/staff"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Users className="h-4 w-4" />
          Ganti Kasir
        </Link>
        <LockButton />
      </header>
      <section className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
          Layar kasir (menu, bill, pembayaran) dibangun di fase F2.
        </p>
      </section>
    </main>
  );
}
