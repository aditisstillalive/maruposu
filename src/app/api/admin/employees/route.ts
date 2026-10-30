import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { employeeSchema } from '@/lib/schemas';
import { getCurrentOutlet } from '@/lib/outlet';
import { queueSync } from '@/lib/replica-sync';

export async function POST(request: NextRequest) {
  const actor = await adminActor();
  if (actor instanceof NextResponse) return actor;
  const data = await parseBody(request, employeeSchema);
  if (data instanceof NextResponse) return data;

  const outlet = await getCurrentOutlet();
  const employee = await prisma.employee.create({ data: { ...data, outlet_id: outlet.id } });
  queueSync({ employee: employee.id });
  return NextResponse.json(employee);
}
