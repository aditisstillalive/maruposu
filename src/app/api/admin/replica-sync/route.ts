import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { fullSync, getReplicaStatus } from '@/lib/replica-sync';

export const maxDuration = 300;

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return NextResponse.json(await getReplicaStatus());
}

// Copies everything from the primary to the replica.
export async function POST() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const result = await fullSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
