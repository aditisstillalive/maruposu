import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { getSessionEmail, requireAdminApi } from '@/lib/admin-auth';
import { firstIssue } from '@/lib/schemas';

/** The signed-in admin's email, or the 401 response to return. */
export async function adminActor(): Promise<string | NextResponse> {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return (await getSessionEmail())!;
}

/** Parsed body, or a 400 response with the first validation message. */
export async function parseBody<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.infer<S> | NextResponse> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  return parsed.data;
}
