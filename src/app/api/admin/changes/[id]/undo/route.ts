// POST /api/admin/changes/<id>/undo — undoes a rename or merge (#67 step 3).
// Possible until the next migration reloads the records; a merge only until it is
// repeated in the sheet. The undo is logged as its own change.

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { requireUser } from '@/lib/admin/guard';
import { getList } from '@/lib/admin/lists';
import { undoChange } from '@/lib/admin/rename';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;

  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'Unknown change' }, { status: 404 });

  const out = await undoChange(g.userId, id, getList);
  return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
}
