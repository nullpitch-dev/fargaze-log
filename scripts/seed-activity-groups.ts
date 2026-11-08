// Seeds the entry form's field groups per activity (#71, Design §15.7) from the records,
// with the survey's thresholds (sheetSurvey.ts): over the last 12 months (all years when
// an activity has fewer than 20 records there), a group filled in at least 98% of its
// records is REQUIRED, in at least 50% SHOWN. An activity with fewer than 5 records gets
// no rules of its own and takes its category's (groups.ts rulesFor).
//
//   npx tsx --tsconfig tsconfig.json scripts/seed-activity-groups.ts            → shows, writes nothing
//   npx tsx --tsconfig tsconfig.json scripts/seed-activity-groups.ts --write    → writes activities without rules
//   … --write --all                                                             → also replaces rules set by hand
// Hyoje's own choices (8 Nov) are laid over what the records say (OVERRIDES).
// Reads .env.local (production). Only activity_master.groups changes; no record does.
// Written to myfiles/admin/activity-groups-YYYY-MM-DD.md as well.

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import ActivityMaster from '../src/models/ActivityMaster';
import { ENTRY_GROUPS, groupFilled, rulesFor } from '../src/lib/entry/groups';
import { DEFAULT_SHARE, REQUIRED_SHARE, MIN_RECENT } from '../src/lib/survey/sheetSurvey';

const USER_ID = 'hyoje';

// Hyoje, 8 Nov 2026. `match`: an activity name, a name prefix ending in '*', or
// 'category:<name>' for every activity in a category.
// require: added to Required · relax: moved from Required to Shown.
// An activity with too few records starts from its category's rules, then takes these.
const OVERRIDES: { match: string; require?: string[]; relax?: string[] }[] = [
  { match: '음주', require: ['alcohols'] },                 // foods stay optional
  { match: '영화 관람', require: ['movie'] },
  { match: '여행(기간)', require: ['travel'] },
  { match: '구매 - *', require: ['cost', 'purchase'] },     // an amount of 0 is fine (bought with points)
  { match: '구매 - 차량 렌트', require: ['place'] },
  { match: '구매 - 통신기기', require: ['place'] },
  { match: '골프 레슨', relax: ['cost', 'purchase'] },      // paid by the month or quarter, not per lesson
  { match: '선물', require: ['people'] },
  { match: '선물 수령', require: ['people'] },
  { match: 'category:기념', relax: ['place'] },             // anniversaries have no place
];
const overridesFor = (name: string, category: string) => OVERRIDES.filter(o =>
  o.match.startsWith('category:') ? o.match.slice(9) === category
    : o.match.endsWith('*') ? name.startsWith(o.match.slice(0, -1)) : name === o.match);

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
  // 1. What the records say.
  const computed = acts.map(a => {
    const s = stats.get(a.name);
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
    return { a, s, required, shown, basis };
  });
  const asRules = computed.filter(c => c.basis !== '—').map(c => ({ name: c.a.name, category: c.a.category, groups: { required: c.required, shown: c.shown } }));

  // 2. Your choices, on top (an activity with too few records starts from its category's rules).
  let written = 0, skipped = 0;
  for (const c of computed) {
    const { a, s } = c;
    let { required, shown, basis } = c;
    const hasOwn = !!(a.groups?.shown?.length || a.groups?.required?.length);
    const over = overridesFor(a.name, a.category);
    if (over.length) {
      if (basis === '—') {
        const cat = rulesFor(a.name, [...asRules, { name: a.name, category: a.category }]);
        required = [...cat.required];
        shown = cat.shown.filter(k => !cat.required.includes(k));
        basis = "category's + your choices";
      } else basis += ' + your choices';
      for (const o of over) {
        for (const k of o.require ?? []) { if (!required.includes(k)) required.push(k); shown = shown.filter(x => x !== k); }
        for (const k of o.relax ?? []) { if (required.includes(k)) { required = required.filter(x => x !== k); if (!shown.includes(k)) shown.push(k); } }
      }
    }
    const now = hasOwn ? `own: ${[...(a.groups.required ?? []).map((k: string) => k + '*'), ...(a.groups.shown ?? [])].join(', ')}` : '';
    lines.push(`| ${a.category} | ${a.name} | ${s?.records ?? 0} | ${basis} | ${required.join(', ') || '—'} | ${shown.join(', ') || '—'} | ${now} |`);
    if (!write) continue;
    if (hasOwn && !all) { skipped++; continue; }
    if (basis === '—' || (!required.length && !shown.length)) {
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
