// POST /api/records/replace/preview — what a Find & replace would do, writing nothing (#70):
// { title, problems[], records, places, skipped (already said the new text), byTab,
//   rows[] (first 500: id, tab, findRow, before, after, count, skipped), more,
//   steps[] (Find & Replace, unfiltered) | lines[] (one per record, filtered) }

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { previewReplace } from '@/lib/records/replace';

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const body = await req.json().catch(() => null);
  if (!body?.field) return NextResponse.json({ error: 'Send { field, mode, from, to, … }' }, { status: 400 });
  const out = await previewReplace(g.userId, body);
  return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
}
