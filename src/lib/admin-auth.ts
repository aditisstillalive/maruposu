import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  return session;
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/api/auth/signin?callbackUrl=/admin/dashboard');
  }
  
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireAdmin();
  
  if (!session.user?.email) {
    redirect('/api/auth/signin?callbackUrl=/admin/dashboard');
  }
  
  // Check if user is super_admin in database
  const { prisma } = await import('@/lib/prisma');
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });
  
  if (!adminUser || adminUser.role !== 'super_admin') {
    redirect('/admin?error=unauthorized');
  }

  return session;
}

// For server actions (which are public endpoints): throws unless the caller is in AdminUser.
export async function assertAdmin(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const { prisma } = await import('@/lib/prisma');
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });
  if (!adminUser) throw new Error('Unauthorized');
}

export async function getSessionEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// For API routes: returns a 401 response unless the caller is in AdminUser.
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { prisma } = await import('@/lib/prisma');
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
// For super-admin-only API routes (master PIN, admin users).
export async function requireSuperAdminApi(): Promise<{ email: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { prisma } = await import('@/lib/prisma');
  const adminUser = await prisma.adminUser.findUnique({ where: { email: session.user.email } });
  if (!adminUser || adminUser.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { email: adminUser.email };
}
