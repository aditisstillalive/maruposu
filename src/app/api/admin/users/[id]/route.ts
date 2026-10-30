import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { queueSync } from '@/lib/replica-sync';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: session.user.email },
    });
    
    if (!adminUser || adminUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const { id } = await params;
    
    // Prevent removing yourself
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }
    
    if (target.email === session.user.email) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }
    
    await prisma.adminUser.delete({ where: { id } });
    queueSync({ adminUser: id });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete admin error:', error);
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 });
  }
}