import { redirect } from 'next/navigation';
import { readDevice } from '@/lib/device';
import { getCurrentOutlet } from '@/lib/outlet';
import Image from 'next/image';
import PinPad from '@/components/pos/PinPad';
import RegisterSW from '@/components/pos/RegisterSW';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  if (await readDevice()) redirect('/pos');
  const { setting } = await getCurrentOutlet();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="mb-10 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-gray-500">Selamat datang di</p>
        <h1 className="mt-4">
          <Image src={site.logo} alt={setting.cafe_name} width={487} height={284} priority className="mx-auto h-auto w-56 sm:w-64" />
        </h1>
      </div>
      <PinPad />
      <RegisterSW />
    </main>
  );
}
