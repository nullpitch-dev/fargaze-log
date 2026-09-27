// src/app/api/calendar/record/route.ts
//
// GET /api/calendar/record?id=<ObjectId> — one whole record, for the detail
// pane. The events list carries only what the grid needs.

import { NextRequest, NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  await connectDB();
  const doc: any = await Log.findOne({ userId, _id: id }).lean();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ...doc, _id: String(doc._id) });
}
