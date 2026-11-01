import type { Metadata } from 'next';
import { publicOutlet, tableByToken } from '@/lib/qr/public';
import QrMenu from '@/components/qr/QrMenu';
import QrInvalid from '@/components/qr/QrInvalid';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const table = await tableByToken((await params).token);
  return { title: table ? `Pesan · Meja ${table.name}` : 'Pesan', robots: { index: false, follow: false } };
}

/** The table's QR page: the menu, a cart and "Kirim pesanan". */
export default async function TableMenu({ params }: Props) {
  const { token } = await params;
  const table = await tableByToken(token);
  if (!table) return <QrInvalid />;
  const outlet = await publicOutlet(table.outlet_id);
  return <QrMenu token={token} tableName={table.name} cafeName={outlet.cafe_name} open={outlet.open} tax={outlet.tax} categories={outlet.categories} products={outlet.products} />;
}
