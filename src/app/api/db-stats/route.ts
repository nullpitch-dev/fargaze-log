import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET() {
  await connectDB();
  const total = await Log.countDocuments();
  const sample = await Log.findOne().lean();
  return NextResponse.json({ total, sample });
}
