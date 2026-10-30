import { requireSuperAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import PageHeader from '@/components/admin/PageHeader';
import MasterPinForm from './master-pin-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Master PIN | Admin' };

export default async function MasterPinPage() {
  await requireSuperAdmin();
  const last = await prisma.auditLog.findFirst({ where: { action: 'master_pin.change' }, orderBy: { created_at: 'desc' } });
  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Master PIN" description="PIN 6 digit untuk membuka POS di tablet kasir. Hanya super admin yang bisa mengganti." />
      <MasterPinForm lastChange={last ? { by: last.actor, at: last.created_at.toISOString() } : null} />
    </div>
  );
}
