import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { tableUrl } from '@/lib/qr/tables';
import { siteOrigin } from '@/lib/qr/origin';
import PageHeader from '@/components/admin/PageHeader';
import TableManager from './table-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meja | Admin' };

export default async function TablesPage() {
  const outlet = await getCurrentOutlet();
  const origin = await siteOrigin();
  const rows = await prisma.diningTable.findMany({
    where: { outlet_id: outlet.id },
    orderBy: [{ is_active: 'desc' }, { sort_order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, token: true, is_active: true, sort_order: true },
  });
  const tables = await Promise.all(
    rows.map(async t => ({ ...t, url: tableUrl(origin, t.token), qr: await QRCode.toString(tableUrl(origin, t.token), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }))
  );
  return (
    <div className="p-4 md:p-8">
      <TableManager tables={tables}>
        <PageHeader title="Meja" description="Setiap meja punya QR sendiri. Customer scan untuk melihat menu dan memesan; pesanan masuk ke POS sebagai bill meja itu." />
      </TableManager>
    </div>
  );
}
