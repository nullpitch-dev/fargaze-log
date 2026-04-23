import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ status: 'ok', message: 'MongoDB connected successfully' });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'MongoDB connection failed' }, { status: 500 });
  }
}
