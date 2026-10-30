import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function audit(
  actor: string,
  action: string,
  target?: string | null,
  detail?: Prisma.InputJsonValue,
  db: Pick<typeof prisma, 'auditLog'> = prisma
): Promise<string> {
  const row = await db.auditLog.create({ data: { actor, action, target: target ?? null, detail }, select: { id: true } });
  return row.id;
}
