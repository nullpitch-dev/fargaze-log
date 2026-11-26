// Google Calendar sync (Design §15.9) by hand. Reads .env.local (MONGODB_URI,
// GOOGLE_SERVICE_ACCOUNT_FILE, GCAL_FAMILY_ID).
//
//   npm run gcal              --check: is it set up, can the service account reach the
//                             calendar, and how many records / plans hold an event
//   npm run gcal -- --run     one sync run now (what changed in the last 10 minutes, or since
//                             the last run), with its report
//   npm run gcal -- --run --days 3   the same over the last 3 days (as the nightly check)
//
// Nothing here writes to Google except --run.

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const USER_ID = 'hyoje';
const args = process.argv.slice(2);
const RUN = args.includes('--run');
const days = (() => { const i = args.indexOf('--days'); return i >= 0 ? Number(args[i + 1]) : null; })();

async function main() {
  const mongoose = (await import('mongoose')).default;
  const { default: Log } = await import('../src/models/Log');
  const { default: LogPlan } = await import('../src/models/LogPlan');
  const { default: GcalEvent } = await import('../src/models/GcalEvent');
  const { default: GcalState } = await import('../src/models/GcalState');
  const { syncConfigured, calendarIdOf, canReach } = await import('../src/lib/gcal/google');
  const { syncCalendar } = await import('../src/lib/gcal/sync');

  const { default: connectDB } = await import('../src/lib/mongodb');
  await connectDB();   // the app's own connection (the sync uses it too)
  console.log(`database: ${mongoose.connection.name}`);
  const id = calendarIdOf('family');
  console.log(`Family calendar ID: ${id ? id.replace(/^(.{6}).*(@.*)$/, '$1…$2') : '(GCAL_FAMILY_ID not set)'}`);
  console.log(`set up: ${syncConfigured() ? 'yes' : 'no'}`);
  if (id && syncConfigured()) {
    try { console.log(`reach the calendar: ${await canReach(id)}`); }
    catch (e: any) { console.log(`reach the calendar: FAILED — ${e?.response?.data?.error?.message ?? e?.message ?? e}`); console.log('  → share the calendar with the service account ("Make changes to events"), and turn on the Google Calendar API in its Google Cloud project.'); }
  }
  const q = { userId: USER_ID };
  const [recHint, recTick, planHint, planTick, rows, state] = await Promise.all([
    Log.countDocuments({ ...q, 'sync.eventId': { $type: 'string' } }),
    Log.countDocuments({ ...q, 'sync.export': { $in: ['Y', 'y'] } }),
    LogPlan.countDocuments({ ...q, 'plan.state': 'open', 'sync.eventId': { $type: 'string' } }),
    LogPlan.countDocuments({ ...q, 'plan.state': 'open', 'sync.export': { $in: ['Y', 'y'] } }),
    GcalEvent.countDocuments(q),
    GcalState.findOne(q).lean() as any,
  ]);
  console.log(`records ticked: ${recTick}, holding an event ID (most from the Apps Script): ${recHint}`);
  console.log(`open plans ticked: ${planTick}, holding an event ID: ${planHint}`);
  console.log(`events the app looks after (gcal_events): ${rows}`);
  console.log(`last run: ${state?.lastRunAt ? new Date(state.lastRunAt).toISOString() : 'never'} ${state?.lastReport ?? ''}`);
  const failing = await GcalEvent.find({ ...q, error: { $ne: null } }).limit(10).lean() as any[];
  for (const f of failing) console.log(`  failing: ${f.docId} (${f.tries} tries): ${f.error}`);

  if (RUN) {
    const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
    const r = await syncCalendar(USER_ID, { since, all: !!days });
    console.log('run:', JSON.stringify(r, null, 2));
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
