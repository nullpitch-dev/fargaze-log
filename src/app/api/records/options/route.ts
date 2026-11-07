// GET /api/records/options — what the record form's pickers offer (#70 step 3):
// the master and reference lists, and values already used in records (most used first).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { loadFormOptions } from '@/lib/records/formOptions';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return NextResponse.json(await loadFormOptions(g.userId));
}
