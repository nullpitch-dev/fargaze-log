import { useState, useRef, useEffect } from 'react';

// A multi-select filter that applies changes live, EXCEPT an empty selection,
// which is held (the chart keeps its last non-empty view) until the dropdown
// closes. Lets "Deselect all → pick a few" not blank the chart mid-edit.
export function useLiveFilter(allOptions: string[]) {
  const [draft, setDraft]     = useState<string[]>([]);   // what the dropdown shows
  const [applied, setApplied] = useState<string[]>([]);   // what the chart filters by
  const draftRef = useRef<string[]>([]);
  const inited   = useRef(false);

  // Seed both to all-selected once, when options first arrive.
  useEffect(() => {
    if (!inited.current && allOptions.length) {
      setDraft(allOptions);
      setApplied(allOptions);
      draftRef.current = allOptions;
      inited.current = true;
    }
  }, [allOptions]);

  const onChange = (next: string[]) => {
    setDraft(next);
    draftRef.current = next;
    if (next.length) setApplied(next);          // live-apply only non-empty
  };
  const onClose = () => setApplied(draftRef.current);   // commit on close (may be empty)

  return { draft, applied, onChange, onClose };
}
