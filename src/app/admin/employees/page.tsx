import { prisma } from '@/lib/prisma';
import { getCurrentOutlet } from '@/lib/outlet';
import PageHeader from '@/components/admin/PageHeader';
import EmployeeManager from './employee-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Karyawan | Admin' };

export default async function EmployeesPage() {
  const outlet = await getCurrentOutlet();
  const employees = await prisma.employee.findMany({
    where: { outlet_id: outlet.id },
    orderBy: [{ is_active: 'desc' }, { sort_order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, photo_url: true, is_active: true, sort_order: true },
  });
  return (
    <div className="p-4 md:p-8">
      <EmployeeManager employees={employees}>
        <PageHeader title="Karyawan" description="Kartu karyawan yang muncul di POS untuk dipilih sebagai kasir." />
      </EmployeeManager>
    </div>
  );
}
