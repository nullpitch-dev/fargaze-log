// POST /api/admin/lists/<slug>/rename — rename, move or merge (#67 step 3).
//
//   { mode: 'row', id, values }          a row's new name and / or category
//   { mode: 'category', from, to }       every row of a category
//   + apply: true, expectRecords: n      carry it out (n = the preview's record count)
//
// Without `apply` it only previews: records, years, warnings and the sheet steps.
// Activities and cost categories only; the logic is in src/lib/admin/rename.ts.

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { requireUser } from '@/lib/admin/guard';
import { getList } from '@/lib/admin/lists';
import { previewRename, applyRename, type RenameRequest } from '@/lib/admin/rename';

export async function POST(req: Request, { params }: { params: Promise<{ list: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;

  const { list } = await params;
  const def = getList(list);
  if (!def) return NextResponse.json({ error: `Unknown list: ${list}` }, { status: 404 });

  const body = await req.json().catch(() => null);
  let r: RenameRequest;
  if (body?.mode === 'row' && typeof body.id === 'string' && isValidObjectId(body.id) && body.values && typeof body.values === 'object') {
    r = { mode: 'row', id: body.id, values: body.values };
  } else if (body?.mode === 'category' && typeof body.from === 'string' && typeof body.to === 'string') {
    r = { mode: 'category', from: body.from, to: body.to };
  } else {
    return NextResponse.json({ error: "Send { mode: 'row', id, values } or { mode: 'category', from, to }" }, { status: 400 });
  }

  if (body.apply === true) {
    if (typeof body.expectRecords !== 'number') return NextResponse.json({ error: 'Send expectRecords from the preview' }, { status: 400 });
    const out = await applyRename(def, g.userId, r, body.expectRecords);
    return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
  }
  const out = await previewRename(def, g.userId, r);
  return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
}
