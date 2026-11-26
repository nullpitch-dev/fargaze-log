import { requireUser } from '@/lib/admin/guard';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export async function GET() {
  // Its own sign-in check (26 Nov): the middleware no longer runs for /api (Vercel CPU).
  const g = await requireUser();
  if (g.denied) return g.denied;
  try {
    await connectDB();
    return NextResponse.json({ status: 'ok', message: 'MongoDB connected successfully' });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'MongoDB connection failed' }, { status: 500 });
  }
}
