// GET /api/entry/rules → { groups, activities: [{ name, category, groups }] } — what the
// form needs to open and require an activity's field groups (groups.ts rulesFor).
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import ActivityMaster from '@/models/ActivityMaster';
import { ENTRY_GROUPS } from '@/lib/entry/groups';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const acts = await ActivityMaster.find({ userId: g.userId }).select('name category groups -_id').sort({ name: 1 }).lean();
  return NextResponse.json({ groups: ENTRY_GROUPS, activities: acts });
}
