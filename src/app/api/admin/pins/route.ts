// GET /api/admin/pins — the gear menu's shortcuts: [{ slug, title }] in /admin order.
// PUT /api/admin/pins  { slug, pinned: true | false } — pin or unpin one list;
//                      answers with the new shortcuts.

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { getList } from '@/lib/admin/lists';
import { getPins, setPinned, toPins } from '@/lib/admin/pins';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return NextResponse.json({ pins: toPins(await getPins(g.userId)) });
}

export async function PUT(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!getList(slug)) return NextResponse.json({ error: `No list called "${slug}"` }, { status: 400 });
  if (typeof body?.pinned !== 'boolean') return NextResponse.json({ error: 'pinned must be true or false' }, { status: 400 });
  return NextResponse.json({ pins: toPins(await setPinned(g.userId, slug, body.pinned)) });
}
