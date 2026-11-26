import { requireUser } from '@/lib/admin/guard';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET() {
  // Its own sign-in check (26 Nov): the middleware no longer runs for /api (Vercel CPU).
  const g = await requireUser();
  if (g.denied) return g.denied;
  await connectDB();
  const total = await Log.countDocuments();
  const sample = await Log.findOne().lean();
  return NextResponse.json({ total, sample });
}
