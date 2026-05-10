import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import dbConnect from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.userId;
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await dbConnect();

  const values: string[] = await Log.distinct('activity.crossActivity', {
    userId,
    'activity.crossActivity': { $exists: true, $nin: [null, ''] },
  });

  const sorted = values.filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));

  return NextResponse.json(sorted);
}
