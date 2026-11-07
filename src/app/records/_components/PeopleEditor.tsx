'use client';

// People in the record form (#70 step 3): one card per group — how (method) and which
// kind (type), with the names as chips. Names are free text with suggestions from past
// records; there is no names list (Hyoje, 5 Nov). Renaming a person everywhere is
// Find & replace's job.
//
// The record keeps people as a flat list (method, category, target); a group is a run
// of entries with the same method and type, as the sheet's people cells show them.

import type { FormPerson } from '@/lib/records/form';
import { Field, Select, TagInput, addBtn, linkBtn } from './fields';

interface Group { method: string; category: string; names: string[] }

export function groupsOf(people: FormPerson[]): Group[] {
  const out: Group[] = [];
  for (const p of people) {
    const last = out[out.length - 1];
    if (last && last.method === p.method && last.category === p.category) last.names.push(p.target);
    else out.push({ method: p.method, category: p.category, names: [p.target] });
  }
  // An empty name only marks a group that has none yet.
  return out.map(g => ({ ...g, names: g.names.filter(n => n !== '') }));
}

function flatten(groups: Group[]): FormPerson[] {
  return groups.flatMap(g => (g.names.length
    ? g.names.map(target => ({ method: g.method, category: g.category, target }))
    : [{ method: g.method, category: g.category, target: '' }]));
}

export function PeopleEditor({ people, onChange, methods, categories, names }: {
  people: FormPerson[];
  onChange: (v: FormPerson[]) => void;
  methods: string[];
  categories: string[];
  names: string[];
}) {
  const groups = groupsOf(people);
  const set = (i: number, patch: Partial<Group>) => onChange(flatten(groups.map((g, k) => (k === i ? { ...g, ...patch } : g))));
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g, i) => (
        <div key={i} className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-50/60 dark:bg-zinc-800/50 p-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="How"><Select value={g.method} onChange={v => set(i, { method: v })} options={methods} /></Field>
            <Field label="Type"><Select value={g.category} onChange={v => set(i, { category: v })} options={categories} /></Field>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-500 dark:text-zinc-400">Names</span>
            <TagInput values={g.names} onChange={v => set(i, { names: v })} suggest={names} placeholder="Add a name…" />
            {!g.names.length && <span className="text-xs text-amber-700 dark:text-amber-300">Add at least one name.</span>}
          </div>
          <div className="text-right">
            <button type="button" onClick={() => onChange(flatten(groups.filter((_, k) => k !== i)))} className={linkBtn}>Remove group</button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" onClick={() => onChange([...people, { method: '', category: '', target: '' }])} className={addBtn}>+ Add a group</button>
      </div>
    </div>
  );
}
