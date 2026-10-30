import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import UsersPageClient from './page-client';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Management | Admin',
};

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/api/auth/signin?callbackUrl=/admin/users');
  }
  
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });
  
  if (!adminUser || adminUser.role !== 'super_admin') {
    redirect('/admin?error=unauthorized');
  }
  
  const users = await prisma.adminUser.findMany({
    select: { id: true, email: true, role: true, added_by: true, created_at: true, updated_at: true },
    orderBy: { created_at: 'desc' },
  });
  
  // Serialize dates for client component
  const serializedUsers = users.map(u => ({
    ...u,
    created_at: u.created_at.toISOString(),
    updated_at: u.updated_at.toISOString(),
  }));
  
  return (
    <UsersPageClient 
      initialUsers={serializedUsers} 
      currentUserEmail={session.user.email} 
    />
  );
}