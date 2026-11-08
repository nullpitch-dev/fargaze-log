// Seeds the entry form's field groups per activity (#71, Design §15.7) from the records,
// with the survey's thresholds (sheetSurvey.ts): over the last 12 months (all years when
// an activity has fewer than 20 records there), a group filled in at least 98% of its
// records is REQUIRED, in at least 50% SHOWN. An activity with fewer than 5 records gets
// no rules of its own and takes its category's (groups.ts rulesFor).
//
//   npx tsx --tsconfig tsconfig.json scripts/seed-activity-groups.ts            → shows, writes nothing
//   npx tsx --tsconfig tsconfig.json scripts/seed-activity-groups.ts --write    → writes activities without rules
//   … --write --all                                                             → also replaces rules set by hand
// Reads .env.local (production). Only activity_master.groups changes; no record does.
// Written to myfiles/admin/activity-groups-YYYY-MM-DD.md as well.

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import ActivityMaster from '../src/models/ActivityMaster';
import { ENTRY_GROUPS, groupFilled } from '../src/lib/entry/groups';
import { DEFAULT_SHARE, REQUIRED_SHARE, MIN_RECENT } from '../src/lib/survey/sheetSurvey';

const USER_ID = 'hyoje';
const MIN_RECORDS = 5;
const write = process.argv.includes('--write');
const all = process.argv.includes('--all');

interface Stat { records: number; recent: number; filled: Map<string, number>; filledRecent: Map<string, number> }

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing in .env.local');
  await mongoose.connect(process.env.MONGODB_URI);
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const sinceKey = since.getUTCFullYear() * 10000 + (since.getUTCMonth() + 1) * 100 + since.getUTCDate();

  const stats = new Map<string, Stat>();
  const projection = ['activity.name', 'start.year', 'start.month', 'start.day', ...new Set(ENTRY_GROUPS.flatMap(g => g.paths))].join(' ');
  const cursor = Log.find({ userId: USER_ID }).select(projection).lean().cursor();
  for await (const d of cursor as any) {
    const name = d.activity?.name;
    if (!name) continue;
    let s = stats.get(name);
    if (!s) stats.set(name, s = { records: 0, recent: 0, filled: new Map(), filledRecent: new Map() });
    const key = (d.start?.year ?? 0) * 10000 + (d.start?.month ?? 0) * 100 + (d.start?.day ?? 0);
    const recent = key >= sinceKey;
    s.records++;
    if (recent) s.recent++;
    for (const g of ENTRY_GROUPS) {
      if (!groupFilled(d, g.key)) continue;
      s.filled.set(g.key, (s.filled.get(g.key) ?? 0) + 1);
      if (recent) s.filledRecent.set(g.key, (s.filledRecent.get(g.key) ?? 0) + 1);
    }
  }

  const acts = await ActivityMaster.find({ userId: USER_ID }).sort({ category: 1, name: 1 }).lean() as any[];
  const lines: string[] = [`# Activity field groups — ${new Date().toISOString().slice(0, 10)}`, '', '| Category | Activity | Records | Basis | Required | Shown | Now |', '| --- | --- | --- | --- | --- | --- | --- |'];
  let written = 0, skipped = 0;
  for (const a of acts) {
    const s = stats.get(a.name);
    const hasOwn = !!(a.groups?.shown?.length || a.groups?.required?.length);
    let required: string[] = [], shown: string[] = [], basis = '—';
    if (s && s.records >= MIN_RECORDS) {
      const useRecent = s.recent >= MIN_RECENT;
      const n = useRecent ? s.recent : s.records;
      basis = useRecent ? 'last 12 months' : 'all years';
      for (const g of ENTRY_GROUPS) {
        const share = ((useRecent ? s.filledRecent : s.filled).get(g.key) ?? 0) / n;
        if (share >= REQUIRED_SHARE) required.push(g.key);
        else if (share >= DEFAULT_SHARE) shown.push(g.key);
      }
    }
    const now = hasOwn ? `own: ${[...(a.groups.required ?? []).map((k: string) => k + '*'), ...(a.groups.shown ?? [])].join(', ')}` : '';
    lines.push(`| ${a.category} | ${a.name} | ${s?.records ?? 0} | ${basis} | ${required.join(', ') || '—'} | ${shown.join(', ') || '—'} | ${now} |`);
    if (!write) continue;
    if (hasOwn && !all) { skipped++; continue; }
    if (basis === '—') {
      if (hasOwn && all) await ActivityMaster.updateOne({ _id: a._id }, { $unset: { groups: 1 } });
      continue;
    }
    await ActivityMaster.updateOne({ _id: a._id }, { $set: { groups: { required, shown } } });
    written++;
  }
  console.log(lines.join('\n'));
  const dir = path.join(process.cwd(), 'myfiles', 'admin');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `activity-groups-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`\n${write ? `Written: ${written} activities${skipped ? `; ${skipped} with rules set by hand left as they are (--all replaces them)` : ''}.` : 'Nothing written (add --write).'}\nAlso in ${path.relative(process.cwd(), file)}`);
  await mongoose.disconnect();
}

main().catch(async e => { console.error(e); await mongoose.disconnect().catch(() => {}); process.exit(1); });
