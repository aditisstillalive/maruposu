import { prisma } from '@/lib/prisma';

// Single-outlet for now: the first outlet (created by the seed) is "the café".
export async function getCurrentOutlet() {
  const outlet = await prisma.outlet.findFirst({ orderBy: { created_at: 'asc' }, include: { setting: true } });
  if (!outlet?.setting) throw new Error('No outlet configured. Run `npm run db:seed`.');
  return { ...outlet, setting: outlet.setting };
}
