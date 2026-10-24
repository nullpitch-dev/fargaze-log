// PATCH /api/admin/changes/<id>  { sheetDone: boolean }
// Ticks a change as repeated in the sheet (or unticks it, for a mistaken tick) (#67).

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { requireUser } from '@/lib/admin/guard';
import MasterChange from '@/models/MasterChange';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;

  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'Unknown change' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.sheetDone !== 'boolean') {
    return NextResponse.json({ error: 'Send { sheetDone: true | false }' }, { status: 400 });
  }

  const updated = await MasterChange.findOneAndUpdate(
    { _id: id, userId },
    { $set: { sheetDone: body.sheetDone, sheetDoneAt: body.sheetDone ? new Date() : null } },
    { returnDocument: 'after' },
  ).select('_id sheetDone sheetDoneAt').lean();

  if (!updated) return NextResponse.json({ error: 'Unknown change' }, { status: 404 });
  return NextResponse.json(updated);
}
