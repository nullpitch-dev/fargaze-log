// /api/entry/presets (#71, Design §15.7)
//   GET                                      → { presets }
//   POST { name, form, time: { kind, minutes } } → { preset }   kind: open | moment | length
//   PUT  { ids }                             → new order
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { listPresets, createPreset, reorderPresets } from '@/lib/entry/presets';
import { reply, body } from '@/lib/entry/reply';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return NextResponse.json({ presets: await listPresets(g.userId) });
}

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await createPreset(g.userId, await body(req)));
}

export async function PUT(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  return reply(await reorderPresets(g.userId, b?.ids));
}
