import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CASHIER_COOKIE, readDevice } from '@/lib/device';

// Picks the employee serving customers on this device ("Kasir: <nama>" on the bill).
export async function POST(request: NextRequest) {
  if (!(await readDevice())) return NextResponse.json({ error: 'Device locked' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : null;
  const employee = employeeId
    ? await prisma.employee.findFirst({ where: { id: employeeId, is_active: true }, select: { id: true } })
    : null;
  if (!employee) return NextResponse.json({ error: 'Karyawan tidak ditemukan' }, { status: 404 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CASHIER_COOKIE, employee.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CASHIER_COOKIE);
  return response;
}
