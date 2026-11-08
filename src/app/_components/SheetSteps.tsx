'use client';

// Sheet steps ("Then in the sheet") — 8 Nov 2026 (Hyoje): the counts to expect in bold,
// and the text to find and the text to put in bold and underlined, copied to the
// clipboard on a click. The steps stay plain strings from the server (old change-list
// entries too); this recognises the shapes they are written in:
//   Find ^A( - .*)?$ and replace with B$1. Tick …         (place points, renamePlace.ts)
//   Find: <regex>   Replace with: <text>   — …            (item cells, replace.ts)
//   find and replace A → B in column …                     (rename.ts, replace.ts)
//   find and replace A → B in the same ranges …            (replace.ts, second pass)
//   … (expect 12) / expect none / expect 3 rows
// Anything else shows as written.

import { Fragment, useState, type ReactNode } from 'react';

/** Bold, underlined text that copies itself; ✓ for a moment after a copy. */
export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }, () => {});
      }}
      title="Copy"
      className="inline font-semibold underline underline-offset-2 decoration-stone-400 dark:decoration-zinc-500 text-stone-900 dark:text-zinc-50 hover:decoration-stone-800 dark:hover:decoration-zinc-100 break-all text-left"
    >{text}{done && <span className="ml-1 font-normal no-underline text-emerald-700 dark:text-emerald-400">✓ copied</span>}</button>
  );
}

const PATTERNS: { re: RegExp; parts: (m: RegExpExecArray) => ReactNode[] }[] = [
  { // Find X and replace with Y. Tick …
    re: /Find (.+?) and replace with (.+?)(?=\. Tick )/,
    parts: m => ['Find ', <CopyText key="f" text={m[1]} />, ' and replace with ', <CopyText key="r" text={m[2]} />],
  },
  { // Find: X   Replace with: Y   —
    re: /Find: (.+?)   Replace with: (.*?)(?=   —)/,
    parts: m => ['Find: ', <CopyText key="f" text={m[1]} />, '   Replace with: ', m[2] ? <CopyText key="r" text={m[2]} /> : '(empty)'],
  },
  { // find and replace X → Y in column … / in the same ranges
    re: /([Ff]ind and replace) (.+?) → (.+?)(?= in (?:column|the same ranges))/,
    parts: m => [`${m[1]} `, <CopyText key="f" text={m[2]} />, ' → ', m[3] === '(empty)' ? '(empty)' : <CopyText key="r" text={m[3]} />],
  },
  { // expect 12 / expect none / expect 3 rows
    re: /\bexpect (?:none|[\d,]+(?: rows?)?)/,
    parts: m => [<b key="e" className="font-semibold text-stone-900 dark:text-zinc-50">{m[0]}</b>],
  },
];

/** One step with its copyable parts and bold counts. */
export function StepText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let rest = text, k = 0;
  while (rest) {
    let best: { i: number; m: RegExpExecArray; p: typeof PATTERNS[number] } | null = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.i)) best = { i: m.index, m, p };
    }
    if (!best) { out.push(rest); break; }
    if (best.i) out.push(rest.slice(0, best.i));
    out.push(<Fragment key={k++}>{best.p.parts(best.m)}</Fragment>);
    rest = rest.slice(best.i + best.m[0].length);
  }
  return <>{out}</>;
}

/** Numbered steps; a step starting with a space is a sub-line of the one above. */
export function StepList({ steps, className }: { steps: string[]; className: string }) {
  let k = 0;
  return (
    <ol className={className}>
      {steps.map((st, i) => {
        const sub = st.startsWith(' ');
        if (!sub) k++;
        return <li key={i} className={`break-words ${sub ? 'pl-5' : ''}`}>{sub ? null : `${k}. `}<StepText text={sub ? st.trim() : st} /></li>;
      })}
    </ol>
  );
}
