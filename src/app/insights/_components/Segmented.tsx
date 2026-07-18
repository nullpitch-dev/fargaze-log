'use client';
// src/app/insights/_components/Segmented.tsx
// Shared multi-state toggle. Extracted from DietWidget, which had it as a
// private component; WeightTrendView needed the same control and copying it
// would have left two definitions to keep in sync.
//
// Generic over string | number rather than string alone: the bucket-count
// selector in WeightTrendView keys on numbers. Widening the constraint keeps
// every existing string-based call site inferring exactly as before.

export function Segmented<T extends string | number>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] w-fit">
      {options.map(([val, label]) => (
        <button key={String(val)} onClick={() => onChange(val)}
          className={`px-2.5 py-1 transition-colors ${
            value === val
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}
