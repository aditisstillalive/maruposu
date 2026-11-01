import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import { tableUrl } from '@/lib/qr/tables';
import { siteOrigin } from '@/lib/qr/origin';
import PrintOnLoad from './print-on-load';
import type { ReceiptLogo } from '@/lib/pos/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cetak QR meja | Admin' };

/** QR cards to stick on the tables: logo, "Scan untuk pesan", the table's name and its QR. */
export default async function PrintTables({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = '' } = await searchParams;
  const outlet = await getCurrentOutlet();
  const origin = await siteOrigin();
  const rows = await prisma.diningTable.findMany({
    where: { outlet_id: outlet.id, is_active: true, id: { in: ids.split(',').filter(Boolean) } },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  });
  const logo = outlet.setting.receipt_logo as ReceiptLogo | null;
  const cards = await Promise.all(rows.map(async t => ({ ...t, qr: await QRCode.toString(tableUrl(origin, t.token), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) })));
  return (
    <div className="bg-white p-6 print:p-0">
      <style>{'@page { size: A4; margin: 10mm } @media print { aside, header, nav { display: none !important } }'}</style>
      <PrintOnLoad />
      <div className="grid grid-cols-2 gap-6 print:gap-4">
        {cards.map(t => (
          <div key={t.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-black p-6 text-center" style={{ minHeight: '125mm' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo?.preview ?? '/maraca-logo.png'} alt={outlet.setting.cafe_name} className="mb-3 h-20 w-auto object-contain" />
            <p className="text-lg font-semibold">Scan untuk pesan</p>
            <p className="text-sm text-gray-600">Lihat menu & pesan dari meja, bayar di kasir</p>
            <div className="my-4 w-52" dangerouslySetInnerHTML={{ __html: t.qr }} />
            <p className="text-3xl font-bold">Meja {t.name}</p>
          </div>
        ))}
      </div>
      {cards.length === 0 && <p className="text-sm text-gray-500">Tidak ada meja aktif untuk dicetak.</p>}
    </div>
  );
}
