import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/prisma';
import { scheduleCatchUp } from '@/lib/replica-sync';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin?callbackUrl=/admin/menu');
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });

  if (!adminUser) {
    redirect('/auth/signin?callbackUrl=/admin/menu&error=unauthorized');
  }

  scheduleCatchUp(); // retry a pending replica full sync in the background

  return (
    <div className="flex flex-col md:flex-row h-full bg-gray-50">
      <AdminSidebar isSuperAdmin={adminUser.role === 'super_admin'} />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
