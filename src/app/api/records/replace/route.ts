// /api/records/replace — bulk Find & replace in records (#70 step 2; page in step 4,
// Design §15.6.3).
//   GET                      → { fields } (key, label, column, modes, item)
//   GET ?field=…&q=…         → { values } already used in that field, most used first
//   POST { field, mode, from, to, dateFrom?, dateTo?, activity?, expectPlaces }
//                            → the change (one change-list entry with Undo)
// The preview is POST /api/records/replace/preview.

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { applyReplace, replaceFieldsInfo, usedValues } from '@/lib/records/replace';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const url = new URL(req.url);
  const field = url.searchParams.get('field');
  if (field) return NextResponse.json({ values: await usedValues(g.userId, field, (url.searchParams.get('q') ?? '').trim()) });
  return NextResponse.json({ fields: replaceFieldsInfo() });
}

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const body = await req.json().catch(() => null);
  if (!body?.field) return NextResponse.json({ error: 'Send { field, mode, from, to, …, expectPlaces }' }, { status: 400 });
  const out = await applyReplace(g.userId, body);
  return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
}
