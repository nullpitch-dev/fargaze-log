'use client';

// A record change (#70), shown two ways:
//   - plain lines, one per real change, the way a person says it ("Added 라면 (밀, 고기 국물)
//     1 인분 to Foods") — Hyoje, 5 Nov: the cell lines alone were hard to read;
//   - the sheet cells, one per changed cell with the whole cell before and after — what to
//     type in the sheet. Folded in the edit page's Check card, open on the result screen
//     and the Record changes page.
// Entries saved before 5 Nov (and Find & replace) have no plain lines: their cell lines
// show with "what changed" as before.

export interface Line { column: string; what: string; before: string; after: string; calculated?: boolean; part?: string }
export interface Plain { text: string; part?: string; calculated?: boolean }

const empty = <span className="text-stone-400 dark:text-zinc-500">(empty)</span>;
const cellText = (v: string) => (v === '' ? empty : <span className="break-words">{v}</span>);
const xBtn = 'shrink-0 -mr-0.5 text-base leading-none text-stone-400 hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-100';

/** One entry per cell: a cell with several changes is listed several times in `lines`. */
function cells(lines: Line[]): Line[] {
  const seen = new Set<string>();
  return lines.filter(l => {
    if (l.column === 'Row' || l.column === 'V–Z') return true;
    if (seen.has(l.column)) return false;
    seen.add(l.column);
    return true;
  });
}

function CellList({ lines, withWhat }: { lines: Line[]; withWhat: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((l, i) => (
        <li key={i} className="rounded border border-stone-200 dark:border-zinc-700 px-2 py-1 text-xs">
          <div className="flex flex-wrap gap-x-2">
            <span className="font-mono text-stone-700 dark:text-zinc-200 shrink-0">{l.column}</span>
            {(withWhat || l.column === 'Row' || l.column === 'V–Z') && <span className="text-stone-600 dark:text-zinc-300">{l.what}</span>}
            {l.calculated && <span className="text-stone-400 dark:text-zinc-500">calculated in Active</span>}
          </div>
          {(l.before || l.after) && (
            <div className="mt-0.5 text-stone-500 dark:text-zinc-400">
              {cellText(l.before)} <span className="text-stone-400 dark:text-zinc-500">→</span> <span className="text-stone-900 dark:text-zinc-50">{cellText(l.after)}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * `cellsOpen`: the sheet cells start unfolded (result screen, Record changes).
 * `onPutBack`: an × on each plain line that has a form part (the edit page's Check card).
 */
export function ChangeTable({ tab, findRow, moveTo, lines, changes, cellsOpen = true, onPutBack }: {
  tab: string | null; findRow: string; moveTo?: string | null; lines: Line[];
  changes?: Plain[]; cellsOpen?: boolean; onPutBack?: (part: string) => void;
  /** (kept for callers from before 5 Nov) */
  compact?: boolean;
}) {
  if (!lines.length && !changes?.length) return null;
  const sheet = cells(lines);
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {changes && changes.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1">
            {changes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 rounded border border-stone-200 dark:border-zinc-700 px-2 py-1.5 text-sm">
                <span className={`flex-1 min-w-0 break-words ${c.calculated ? 'text-stone-500 dark:text-zinc-400' : 'text-stone-800 dark:text-zinc-100'}`}>{c.text}</span>
                {onPutBack && c.part && (
                  <button type="button" onClick={() => onPutBack(c.part!)} title="Put this back as it was" aria-label={`Put back: ${c.text}`} className={xBtn}>×</button>
                )}
              </li>
            ))}
          </ul>
          {sheet.length > 0 && <details open={cellsOpen} className="group">
            <summary className="cursor-pointer text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100">
              Sheet cells ({sheet.length}) · tab <b className="font-medium">{tab ?? '(none)'}</b>{moveTo && moveTo !== tab && <> → <b className="font-medium">{moveTo}</b></>}
            </summary>
            <p className="mt-1 mb-1.5 text-xs text-stone-600 dark:text-zinc-300">
              Find the row: <span className="font-mono text-stone-800 dark:text-zinc-100 break-all">{findRow}</span>
            </p>
            <CellList lines={sheet} withWhat={false} />
          </details>}
        </>
      ) : (
        <>
          <p className="text-xs text-stone-600 dark:text-zinc-300">
            Tab <b className="font-medium text-stone-800 dark:text-zinc-100">{tab ?? '(none)'}</b>
            {moveTo && moveTo !== tab && <> → <b className="font-medium text-stone-800 dark:text-zinc-100">{moveTo}</b></>}
            {' · '}Find the row: <span className="font-mono text-stone-800 dark:text-zinc-100 break-all">{findRow}</span>
          </p>
          <CellList lines={lines} withWhat />
        </>
      )}
    </div>
  );
}
