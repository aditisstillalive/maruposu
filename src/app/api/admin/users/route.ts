import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { queueSync } from '@/lib/replica-sync';
import bcrypt from 'bcrypt';
import { ADMIN_PASSWORD_MIN } from '@/lib/schemas';

// Never send password hashes to the client.
const publicAdminFields = { id: true, email: true, role: true, added_by: true, created_at: true, updated_at: true };

export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { email, password, role } = body;
    
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    
    if (typeof password !== 'string' || password.length < ADMIN_PASSWORD_MIN) {
      return NextResponse.json({ error: `Password minimal ${ADMIN_PASSWORD_MIN} karakter` }, { status: 400 });
    }
    
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    
    // Check if already exists
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'User already exists as admin' }, { status: 400 });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const newAdmin = await prisma.adminUser.create({
      data: {
        email,
        password: hashedPassword,
        role,
        added_by: session.user.email,
      },
      select: publicAdminFields,
    });
    queueSync({ adminUser: newAdmin.id });
    
    return NextResponse.json(newAdmin);
  } catch (error) {
    console.error('Create admin error:', error);
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 });
  }
}

export async function GET() {
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
    
    const users = await prisma.adminUser.findMany({
      select: publicAdminFields,
      orderBy: { created_at: 'desc' },
    });
    
    return NextResponse.json(users);
  } catch (error) {
    console.error('Get admins error:', error);
    return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
  }
}