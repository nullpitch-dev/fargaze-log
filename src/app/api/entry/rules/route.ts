// GET /api/entry/rules → what the entry form needs besides the edit form's options (#71):
//   groups      the field groups (groups.ts)
//   activities  [{ name, category, groups }] — rulesFor() opens and requires sections
//   labels      the favourite-place labels (집, 회사 …), offered first in the Place picker
//   zones       [{ code, offsetUTC, ianaTimezone }] — the phone's zone → a zone code
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import ActivityMaster from '@/models/ActivityMaster';
import FavoritePlace from '@/models/FavoritePlace';
import TimezoneMaster from '@/models/TimezoneMaster';
import { ENTRY_GROUPS } from '@/lib/entry/groups';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const [acts, labels, zones] = await Promise.all([
    ActivityMaster.find({ userId: g.userId }).select('name category groups -_id').sort({ name: 1 }).lean(),
    FavoritePlace.distinct('label', { userId: g.userId }),
    TimezoneMaster.find({ userId: g.userId }).select('code offsetUTC ianaTimezone -_id').lean(),
  ]);
  return NextResponse.json({ groups: ENTRY_GROUPS, activities: acts, labels: (labels as string[]).sort(), zones });
}
