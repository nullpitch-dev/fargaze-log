// Session check for the admin API (#67, risk #9).
// Every admin route takes the user from the session, never from the request.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import dbConnect from '@/lib/mongodb';

export type Guarded = { userId: string; denied?: undefined } | { userId?: undefined; denied: NextResponse };

export async function requireUser(): Promise<Guarded> {
  const session = await auth();
  const userId = (session?.user as any)?.userId as string | undefined;
  if (!userId) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  await dbConnect();
  return { userId };
}
