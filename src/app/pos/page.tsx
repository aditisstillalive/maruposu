import { requireDevice } from '@/lib/device';
import PosApp from '@/components/pos/app/PosApp';
import RegisterSW from '@/components/pos/RegisterSW';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kasir' };

// Online, an expired device session goes back to the PIN page. Offline, the
// service worker serves the last copy of this page and PosApp checks the
// tablet's own session.
export default async function PosPage() {
  await requireDevice();
  return (
    <>
      <PosApp />
      <RegisterSW />
    </>
  );
}
