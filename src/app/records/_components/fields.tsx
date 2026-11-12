'use client';

// The record form's inputs (#70 step 3). Small and plain: a text box that can suggest,
// a drop-down that keeps an old value outside its list, a number box that hands the
// text through (the server says when it isn't a number), chips, and item lists.

import { useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '@/app/_components/useBackToClose';

export const inputCls = 'w-full min-w-0 bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-2 py-1.5 text-sm text-stone-900 dark:text-zinc-50 placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-stone-500 dark:focus:border-zinc-400 dark:[color-scheme:dark]';
export const linkBtn = 'text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100';
export const addBtn = 'text-xs px-2 py-1 rounded border border-dashed border-stone-300 dark:border-zinc-600 text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800';

// ── Layout ───────────────────────────────────────────────────────────────────

export function Section({ title, onRemove, onReset, children }: { title: string; onRemove?: () => void; onReset?: () => void; children: ReactNode }) {
  return (
    // Denser, with titles and borders that stand out more (Hyoje, 12 Nov).
    <section className="bg-white dark:bg-zinc-900 border-[1.5px] border-stone-400 dark:border-zinc-500 rounded-lg px-3 py-2.5 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-700 dark:text-zinc-200">{title}</h2>
        <span className="flex items-center gap-3">
          {onReset && <button type="button" onClick={onReset} className={linkBtn} title="Clear what was measured or paid, keep the rest">Reset</button>}
          {onRemove && <button type="button" onClick={onRemove} className={linkBtn} title="Empty this section and hide it">Remove</button>}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** A labelled row. `cols` = how many boxes sit side by side from 640 px. */
export function Field({ label, note, children, group }: { label: string; note?: ReactNode; children: ReactNode;
  /** Holds pills (Choice): a plain box, not a <label> — a tap between pills would press the first. */
  group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-stone-500 dark:text-zinc-400">{label}</span>
      {children}
      {note && <span className="text-xs text-stone-400 dark:text-zinc-500">{note}</span>}
    </Tag>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 ${className}`}>{children}</div>;
}

// ── Text with suggestions ────────────────────────────────────────────────────

/** Suggestions that start with the text come first, then those that contain it. */
export function filterSuggestions(all: string[], text: string, max = 8): string[] {
  const q = text.trim().toLowerCase();
  if (!q) return all.slice(0, max);
  // The exact value is listed first only when others match too (typing 음료 still shows
  // 음료 above 구매 - 음료, Hyoje 8 Nov); alone, the list stays closed.
  const exact: string[] = [], starts: string[] = [], has: string[] = [];
  for (const v of all) {
    const l = v.toLowerCase();
    if (l === q) exact.push(v);
    else if (l.startsWith(q)) starts.push(v); else if (l.includes(q)) has.push(v);
    if (starts.length >= max) break;
  }
  const others = [...starts, ...has];
  return others.length ? [...exact, ...others].slice(0, max) : [];
}

export function Text({ value, onChange, placeholder, suggest, describe, onPick, className = '', autoFocus, onEnter, onBlur, disabled, wideList }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Values to suggest (most used first). Anything may still be typed. */
  suggest?: string[];
  /** A grey note beside a suggestion, e.g. the activity's category. */
  describe?: (v: string) => string | undefined;
  onPick?: (v: string) => void;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** The suggestions take the width of the nearest positioned parent (e.g. the whole
   *  Activity : Title row, Hyoje 10 Nov) instead of the box's own. Default off. */
  wideList?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const id = useId();
  const items = useMemo(() => (open && suggest ? filterSuggestions(suggest, value) : []), [open, suggest, value]);
  const pick = (v: string) => { onChange(v); onPick?.(v); setOpen(false); setHi(-1); };
  return (
    <div className={`${wideList ? '' : 'relative '}min-w-0 ${className}`}>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onBlur?.(); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setOpen(true); setHi(h => Math.min(items.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setHi(h => Math.max(-1, h - 1)); }
          else if (e.key === 'Enter') {
            if (hi >= 0 && items[hi]) { e.preventDefault(); pick(items[hi]); }
            else if (onEnter) { e.preventDefault(); onEnter(); }
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        role={suggest ? 'combobox' : undefined}
        aria-expanded={suggest ? items.length > 0 : undefined}
        aria-controls={suggest ? id : undefined}
        autoComplete="off"
        disabled={disabled}
        className={`${inputCls} disabled:bg-stone-100 dark:disabled:bg-zinc-800 disabled:text-stone-500 dark:disabled:text-zinc-400`}
      />
      {items.length > 0 && (
        <ul id={id} role="listbox" className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto rounded border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
          {items.map((v, i) => (
            <li key={v} role="option" aria-selected={i === hi}
              onMouseDown={e => { e.preventDefault(); pick(v); }}
              className={`px-2 py-1.5 cursor-pointer flex justify-between gap-2 ${i === hi ? 'bg-stone-100 dark:bg-zinc-800' : 'hover:bg-stone-50 dark:hover:bg-zinc-800'}`}>
              <span className="truncate text-stone-800 dark:text-zinc-100">{v}</span>
              {describe?.(v) && <span className="shrink-0 text-xs text-stone-400 dark:text-zinc-500">{describe(v)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Drop-down ────────────────────────────────────────────────────────────────

export interface Opt { value: string; label?: string }

/** A list value. An old value that is no longer in the list stays, marked. */
export function Select({ value, onChange, options, empty = '—', className = '' }: { value: string; onChange: (v: string) => void; options: (string | Opt)[]; empty?: string; className?: string }) {
  // Not the phone's own picker (Hyoje, 12 Nov: "so ugly", a full screen of radio rows): a
  // button that opens a sheet of pills — one tap, a few rows (PickerSheet).
  const opts = options.map(o => (typeof o === 'string' ? { value: o } : o));
  const missing = value !== '' && !opts.some(o => o.value === value);
  const [open, setOpen] = useState(false);
  const shown = value === '' ? '' : opts.find(o => o.value === value)?.label ?? value;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`${inputCls} flex items-center justify-between gap-1 text-left ${missing ? 'border-red-400 dark:border-red-500' : ''} ${className}`}>
        <span className={`truncate ${value === '' ? 'text-stone-400 dark:text-zinc-500' : ''}`}>{value === '' ? empty : shown}{missing ? ' (not in the list)' : ''}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-stone-400 dark:text-zinc-500">▾</span>
      </button>
      {open && (
        <PickerSheet value={value} options={opts} empty={empty} missing={missing}
          onPick={v => onChange(v)} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** The sheet behind Select: pills in a grid sized to the longest label (4 → 1 per row), the
 *  current one filled, the empty choice first; a search box for long lists. Back closes it. */
function PickerSheet({ value, options, empty, missing, onPick, onClose }: {
  value: string; options: Opt[]; empty: string; missing: boolean; onPick: (v: string) => void; onClose: () => void;
}) {
  const dismiss = useBackToClose(onClose);
  const [q, setQ] = useState('');
  const longest = Math.max(0, ...options.map(o => [...(o.label ?? o.value)].length));
  const cols = longest <= 4 ? 4 : longest <= 8 ? 3 : longest <= 14 ? 2 : 1;
  const search = options.length > 15;
  const list = q.trim() ? options.filter(o => (o.label ?? o.value).toLowerCase().includes(q.trim().toLowerCase())) : options;
  const pick = (v: string) => dismiss(() => onPick(v));
  const pill = (on: boolean, red = false) => `shrink-0 rounded-full border px-2 py-1.5 text-sm leading-tight truncate ${on
    ? red ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950 dark:text-red-200' : 'border-stone-700 bg-stone-800 text-white dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900'
    : 'border-stone-300 text-stone-700 dark:border-zinc-600 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800'}`;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => dismiss()}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[70dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 shadow-xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stone-300 dark:bg-zinc-600 sm:hidden" />
        {search && (
          <div className="px-3 pt-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className={inputCls} />
          </div>
        )}
        {/* The list scrolls; each row keeps its height (Hyoje, 12 Nov: a long list — time
            zones — squeezed every row into the sheet, cutting the labels in half). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="p-3 grid gap-2 auto-rows-max" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {!q && <button type="button" onClick={() => pick('')} className={`${pill(value === '')} border-dashed`}>{empty}</button>}
            {missing && !q && <button type="button" onClick={() => pick(value)} className={pill(true, true)}>{value}</button>}
            {list.map(o => (
              <button type="button" key={o.value} onClick={() => pick(o.value)} className={pill(o.value === value)}
                ref={o.value === value ? (el => { if (el && !q) el.scrollIntoView({ block: 'center' }); }) : undefined}>{o.label ?? o.value}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => dismiss()}
          className="border-t border-stone-200 dark:border-zinc-700 py-3 text-sm font-medium text-stone-600 dark:text-zinc-300">Cancel</button>
      </div>
    </div>,
    document.body,
  );
}

// ── Pick from a list, by typing ──────────────────────────────────────────────

/**
 * A list value found by typing (5 Nov: alcohol, cost category — "like Ingredients").
 * Shows the chosen value's label; typing filters the list (any part of the label);
 * leaving without picking goes back to the chosen value. An old value outside the
 * list shows red, as in a drop-down.
 */
export function PickText({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);   // null = not typing
  const labelOf = (v: string) => options.find(o => o.value === v)?.label ?? options.find(o => o.value === v)?.value ?? v;
  const byLabel = useMemo(() => new Map(options.map(o => [o.label ?? o.value, o.value])), [options]);
  const labels = useMemo(() => options.map(o => o.label ?? o.value), [options]);
  const missing = value !== '' && !options.some(o => o.value === value);
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className={missing && text == null ? '[&_input]:border-red-400 dark:[&_input]:border-red-500' : ''}>
        <Text
          value={text ?? labelOf(value)}
          onChange={v => setText(v)}
          suggest={labels}
          placeholder={placeholder}
          onPick={l => { const v = byLabel.get(l); if (v != null) onChange(v); setText(null); }}
          onEnter={() => { const v = byLabel.get((text ?? '').trim()); if (v != null) onChange(v); else if ((text ?? '').trim() === '') onChange(''); setText(null); }}
          onBlur={() => { const t = (text ?? '').trim(); if (text != null) { const v = byLabel.get(t); if (v != null) onChange(v); else if (t === '') onChange(''); } setText(null); }}
        />
      </div>
      {missing && text == null && <span className="text-xs text-red-700 dark:text-red-300">Not in the list</span>}
    </div>
  );
}

/** A note that stays folded ("+ Note") until it is wanted or already has text. */
export function NoteBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return <div><button type="button" onClick={() => setOpen(true)} className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100">+ Note</button></div>;
  }
  return <Text value={value} onChange={onChange} placeholder="Note" autoFocus={open && !value} />;
}

// ── Number ───────────────────────────────────────────────────────────────────

/**
 * Holds what is typed. A number goes to the form as a number; anything else goes as
 * the text, so the check can say "'7o' is not a number" instead of dropping it.
 */
export function NumberBox({ value, onChange, placeholder, suffix }: { value: number | null | string; onChange: (v: any) => void; placeholder?: string; suffix?: string }) {
  const shown = value == null ? '' : String(value);
  // `sent` = what this box last handed out; a different value came from outside
  // (reload, Remove) and replaces the text.
  const [st, setSt] = useState({ text: shown, sent: shown });
  if (shown !== st.sent) setSt({ text: shown, sent: shown });
  const text = st.text;
  const bad = text.trim() !== '' && !Number.isFinite(Number(text.replace(/,/g, '').trim()));
  return (
    <div className="relative">
      <input
        value={text}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={e => {
          const t = e.target.value;
          const clean = t.replace(/,/g, '').trim();
          const out = clean === '' ? null : Number.isFinite(Number(clean)) ? Number(clean) : t;
          setSt({ text: t, sent: out == null ? '' : String(out) });
          onChange(out);
        }}
        className={`${inputCls} text-right font-mono ${suffix ? 'pr-9' : ''} ${bad ? 'border-red-400 dark:border-red-500' : ''}`}
      />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 dark:text-zinc-500 pointer-events-none">{suffix}</span>}
    </div>
  );
}

// ── Chips ────────────────────────────────────────────────────────────────────

const chipCls = 'inline-flex items-center gap-1 max-w-full rounded-full border px-2 py-0.5 text-xs';

/** Several values from a list, each on or off. Old values outside the list stay, marked. */
export function ToggleChips({ values, options, onChange }: { values: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const extra = values.filter(v => !options.includes(v));
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...options, ...extra].map(o => {
        const on = values.includes(o);
        const outside = extra.includes(o);
        return (
          <button type="button" key={o} aria-pressed={on}
            onClick={() => onChange(on ? values.filter(v => v !== o) : [...values, o])}
            className={`${chipCls} ${on
              ? outside ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950 dark:text-red-200' : 'border-stone-700 bg-stone-800 text-white dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900'
              : 'border-stone-300 text-stone-600 dark:border-zinc-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'}`}>
            {o}{outside && ' (not in the list)'}
          </button>
        );
      })}
    </div>
  );
}

/** One choice: pills when the list is short enough to show at once (one tap; Hyoje, 12 Nov),
 *  a drop-down otherwise. Short = at most `maxPills` values, none longer than `maxLen`. */
export function Choice({ value, options, onChange, empty, maxPills = 6, maxLen = 6, cols = 3 }: {
  value: string; options: string[]; onChange: (v: string) => void; empty?: string; maxPills?: number; maxLen?: number;
  /** Pills per row at most. */ cols?: number;
}) {
  const pills = options.length > 0 && options.length <= maxPills && options.every(o => [...o].length <= maxLen);
  if (!pills) return <Select value={value} onChange={onChange} options={options} empty={empty} />;
  return <OnePills value={value} options={options} onChange={onChange} cols={Math.min(options.length, cols)} />;
}

/** One choice as small pills in a grid of `cols` columns (Hyoje, 12 Nov: Food's type and
 *  levels — one tap instead of a drop-down). A tap on the chosen one clears it; a value not
 *  in the list shows red, as in ToggleChips. */
export function OnePills({ value, options, onChange, cols = 1 }: { value: string; options: string[]; onChange: (v: string) => void; cols?: number }) {
  const all = value && !options.includes(value) ? [...options, value] : options;
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {all.map(o => {
        const on = o === value;
        const outside = on && !options.includes(o);
        return (
          <button type="button" key={o} aria-pressed={on} onClick={() => onChange(on ? '' : o)}
            className={`rounded-full border px-1 py-1 text-xs leading-tight truncate ${on
              ? outside ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950 dark:text-red-200' : 'border-stone-700 bg-stone-800 text-white dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900'
              : 'border-stone-300 text-stone-600 dark:border-zinc-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Free values as chips: tap one to change it, × to remove it, and a box to add more
 * (with suggestions). `known` marks a chip red when it is not in that list.
 */
export function TagInput({ values, onChange, suggest, describe, known, placeholder = 'Add…' }: {
  values: string[];
  onChange: (v: string[]) => void;
  suggest?: string[];
  describe?: (v: string) => string | undefined;
  known?: Set<string>;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState('');
  const add = (v: string) => {
    const x = v.trim();
    if (x) onChange([...values, x]);
    setDraft('');
  };
  const commit = () => {
    if (editing == null) return;
    const x = edit.trim();
    onChange(x ? values.map((v, i) => (i === editing ? x : v)) : values.filter((_, i) => i !== editing));
    setEditing(null);
  };
  const rest = useMemo(() => suggest?.filter(s => !values.includes(s)), [suggest, values]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v, i) => editing === i ? (
        <input key={i} value={edit} autoFocus onChange={e => setEdit(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setEditing(null); }}
          className={`${inputCls} w-32 py-0.5 text-xs`} />
      ) : (
        <span key={i} className={`${chipCls} ${known && !known.has(v)
          ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950 dark:text-red-200'
          : 'border-stone-300 bg-stone-50 text-stone-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100'}`}>
          <button type="button" onClick={() => { setEditing(i); setEdit(v); }} className="truncate" title="Change">{v}</button>
          <button type="button" onClick={() => onChange(values.filter((_, k) => k !== i))} aria-label={`Remove ${v}`} className="text-stone-400 hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-100">×</button>
        </span>
      ))}
      <Text value={draft} onChange={setDraft} suggest={rest} describe={describe} onPick={add} onEnter={() => add(draft)}
        placeholder={placeholder} className="w-36 flex-none" />
    </div>
  );
}

// ── Item lists ───────────────────────────────────────────────────────────────

/** A list of cards (purchases, foods, exercise …): × removes one, + adds one. */
export function ItemList<T>({ items, onChange, blank, render, addLabel = '+ Add' }: {
  items: T[];
  onChange: (v: T[]) => void;
  blank: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, i: number) => ReactNode;
  addLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="relative rounded border border-stone-200 dark:border-zinc-700 bg-stone-50/60 dark:bg-zinc-800/50 p-2 pr-8">
          {render(it, patch => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}
          <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remove"
            className="absolute top-1.5 right-2 text-stone-400 hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-100 text-lg leading-none">×</button>
        </div>
      ))}
      <div><button type="button" onClick={() => onChange([...items, blank()])} className={addBtn}>{addLabel}</button></div>
    </div>
  );
}
