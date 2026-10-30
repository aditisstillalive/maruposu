import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { adminActor, parseBody } from '@/lib/admin-api';
import { passwordChangeSchema } from '@/lib/schemas';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { queueSync } from '@/lib/replica-sync';

const WINDOW_MS = 15 * 60 * 1000;

// The signed-in admin changes their own password; the current one is required.
export async function PUT(request: NextRequest) {
  const email = await adminActor();
  if (email instanceof NextResponse) return email;
  const body = await parseBody(request, passwordChangeSchema);
  if (body instanceof NextResponse) return body;

  // Same throttle as sign-in: a stolen session shouldn't get unlimited guesses
  const allowed = rateLimit(`password:email:${email}`, 10, WINDOW_MS) && rateLimit(`password:ip:${clientIp(request.headers)}`, 30, WINDOW_MS);
  if (!allowed) return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin?.password || !(await bcrypt.compare(body.current, admin.password))) {
    return NextResponse.json({ error: 'Password lama salah' }, { status: 400 });
  }

  const password = await bcrypt.hash(body.password, 12);
  const auditId = await prisma.$transaction(async tx => {
    await tx.adminUser.update({ where: { id: admin.id }, data: { password } });
    return audit(email, 'admin.password_change', admin.id, undefined, tx);
  });
  queueSync({ adminUser: admin.id }, { auditLog: auditId });
  return NextResponse.json({ ok: true });
}
