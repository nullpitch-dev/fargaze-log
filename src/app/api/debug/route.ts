import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const count = await Log.countDocuments({ userId: 'hyoje' });
  const sample = await Log.findOne({ userId: 'hyoje' })
    .select('activity.title start.year')
    .lean();
  const note9 = await Log.findOne({ 'activity.title': /Note9/i })
    .select('activity.title userId')
    .lean();

  return NextResponse.json({ count, sample, note9 });
}
