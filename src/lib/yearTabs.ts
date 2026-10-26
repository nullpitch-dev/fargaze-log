// Year tabs of the Archive file (#73, Design §11.8). Pure functions, no database.
//
// The Archive file holds one archive tab, '~N', with every record that starts in year
// N or earlier, and one tab per later year, named by the year ('2026', '2027' …).
// N is stored in the database (admin_settings.archiveUntil, default 2025) so that the
// app, which never reads the sheet, knows the tab names too. N changes once a year,
// after the January merge, and only by `npm run migrate -- --full --rollover`.
//
// The January rollover (N = 2025 → 2026):
//   1 Jan       add a tab '2027'; daily records go there (tabs: ~2025, 2026, 2027).
//   early Jan   copy 2026's records to the end of ~2025, rename it ~2026, delete 2026.
//   then        npm run migrate -- --full --rollover   (sets N to 2026 if the run succeeds)

/** Used while the database holds no value. */
export const DEFAULT_ARCHIVE_UNTIL = 2025;

export const archiveTabName = (archiveUntil: number) => `~${archiveUntil}`;

const ARCHIVE_RE = /^~(\d{4})$/;
const YEAR_RE = /^\d{4}$/;

/** The tab a record starting in `year` belongs to; null when it has no start year. */
export function tabForYear(year: unknown, archiveUntil: number): string | null {
  const y = Number(year);
  if (!Number.isInteger(y) || y <= 0) return null;
  return y <= archiveUntil ? archiveTabName(archiveUntil) : String(y);
}

// ── Scripts: which tabs to read ──────────────────────────────────────────────

export interface TabJob {
  tab: string;
  /** Records in this tab start in these years (inclusive). */
  from: number | null;
  to: number;
  archive: boolean;
}

export type TabPlan =
  | { ok: true; archive: TabJob; years: TabJob[]; rolloverTo: number | null }
  | { ok: false; errors: string[] };

/**
 * Works out the archive tab and the year tabs from the Archive file's tab names, and
 * checks them against the stored archive year. Tabs with other names (Staging …) are
 * ignored. `rollover` is true when the run was asked to move the archive year on.
 */
export function planTabs(titles: string[], archiveUntil: number, rollover: boolean): TabPlan {
  const archives = titles.map(t => ARCHIVE_RE.exec(t)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1]));
  const yearTabs = titles.filter(t => YEAR_RE.test(t)).map(Number).sort((a, b) => a - b);
  const want = archiveTabName(archiveUntil);
  const next = archiveTabName(archiveUntil + 1);
  const errors: string[] = [];

  if (archives.length !== 1) {
    return { ok: false, errors: [archives.length
      ? `The Archive file has ${archives.length} archive tabs (${archives.map(archiveTabName).join(', ')}); it should have one, ${want}${rollover ? ` or ${next}` : ''}.`
      : `The Archive file has no archive tab; it should have ${want}${rollover ? ` or ${next}` : ''}.`] };
  }
  const a = archives[0];
  let rolloverTo: number | null = null;

  if (a === archiveUntil) {
    if (rollover) errors.push(`--rollover was given, but the archive tab is still ${want}: there is nothing to roll over. Merge ${archiveUntil + 1} into ${want} and rename it ${next} first, or run without --rollover.`);
  } else if (a === archiveUntil + 1) {
    if (rollover) rolloverTo = a;
    else errors.push(`The archive tab is ${next}, but the database still says ${want}. If ${archiveUntil + 1} has been merged into it, run npm run migrate -- --full --rollover.`);
  } else {
    errors.push(`The archive tab is ${archiveTabName(a)}, but the database says ${want}${rollover ? ` (a rollover can only move it on to ${next})` : ''}.`);
  }

  const stale = yearTabs.filter(y => y <= a);
  if (stale.length) {
    errors.push(`Tab${stale.length === 1 ? '' : 's'} ${stale.join(', ')} should have been merged into ${archiveTabName(a)} and deleted.`);
  }
  const later = yearTabs.filter(y => y > a);
  if (later.length) {
    const gaps: number[] = [];
    for (let y = a + 1; y < later[later.length - 1]; y++) if (!later.includes(y)) gaps.push(y);
    if (gaps.length) errors.push(`The Archive file has no tab ${gaps.join(', ')}; every year after ${archiveTabName(a)} needs its own tab.`);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    archive: { tab: archiveTabName(a), from: null, to: a, archive: true },
    years: later.map(y => ({ tab: String(y), from: y, to: y, archive: false })),
    rolloverTo,
  };
}

/** The database records a tab rebuilds: what the migration deletes before it re-inserts. */
export const clearFilter = (job: TabJob): Record<string, unknown> =>
  job.archive ? { 'start.year': { $lte: job.to } } : { 'start.year': job.to };

/**
 * Records that sit in the wrong tab: a year tab holds only its own year, the archive
 * only years up to its own. Returns one reason per index into `docs`.
 */
export function wrongTab(job: TabJob, docs: any[], archiveUntil: number): Map<number, string> {
  const out = new Map<number, string>();
  docs.forEach((doc, i) => {
    const y = Number(doc?.start?.year);
    if (!Number.isInteger(y) || y <= 0) { out.set(i, `Has no start year — every record in '${job.tab}' needs one`); return; }
    const okHere = (job.from === null || y >= job.from) && y <= job.to;
    if (!okHere) out.set(i, `Starts in ${y} but is in '${job.tab}' — move the row to '${tabForYear(y, archiveUntil)}'`);
  });
  return out;
}

// ── The app: counts per tab for the sheet steps on /admin ────────────────────

export interface TabCount { tab: string; n: number }

/**
 * Turns record counts by start year into counts by tab, newest year tab first and the
 * archive last. Every year tab from the archive up to this year (or the newest record)
 * is listed, even with no records, because a sheet step names each tab.
 */
export function countsByTab(byYear: { year: number | null; n: number }[], archiveUntil: number, thisYear: number): TabCount[] {
  const top = Math.max(thisYear, ...byYear.map(y => y.year ?? 0));
  const out: TabCount[] = [];
  for (let y = top; y > archiveUntil; y--) {
    out.push({ tab: String(y), n: byYear.filter(x => x.year === y).reduce((a, x) => a + x.n, 0) });
  }
  // No start year: counted with the archive, as before #73.
  out.push({ tab: archiveTabName(archiveUntil), n: byYear.filter(x => x.year === null || x.year <= archiveUntil).reduce((a, x) => a + x.n, 0) });
  return out;
}

/**
 * Counts saved before #73 (in master_change.extra.counts) have y2026 / older instead of
 * byTab; the tabs then were 2026 and ~2025.
 */
export function savedByTab(c: { byTab?: TabCount[]; y2026?: number; older?: number }): TabCount[] {
  return c.byTab ?? [{ tab: '2026', n: c.y2026 ?? 0 }, { tab: '~2025', n: c.older ?? 0 }];
}
