'use client';
// Back closes a pop-up (Hyoje, 12 Nov): a menu, a pane or a modal adds a history entry
// while it is open, so the phone's or browser's Back closes it instead of leaving the page.
//
// Every close goes through history.back() (dismiss), so the entry never stays behind; what
// should happen after closing (open a page, run a menu action) waits until Back has landed —
// a navigation started before that would be undone by it. Pop-ups opened on top of each
// other close one per Back, top first.
//
// Next.js 15 copies its own state into entries added with pushState, so its router treats
// the Back as a move to the same page and leaves it alone.
import { useCallback, useEffect, useRef } from 'react';

const afters = new Map<string, () => void>();

// Pop-ups open now (their history keys). An entry with a key not in here was left behind by a
// pop-up that is gone (25 Nov, Hyoje: Back after saving still showed the New form): Back steps
// over it, so it never shows the page it was added on. Checked after every Back and on load.
const live = new Set<string>();
if (typeof window !== 'undefined' && !(window as any).__fgStaleSkip) {
  (window as any).__fgStaleSkip = true;
  const skip = () => {
    const k = window.history.state?.fgModal;
    if (k && !live.has(k)) window.history.back();
  };
  window.addEventListener('popstate', () => setTimeout(skip, 0));
  setTimeout(skip, 0);
}

/** Close the pop-up on top (if any) through Back, then run `fn`. For callers outside it. */
export function closeModalThen(fn: () => void) {
  const key = typeof window !== 'undefined' ? window.history.state?.fgModal : null;
  if (!key) { fn(); return; }
  afters.set(key, fn);
  window.history.back();
}

/** Call in a pop-up while it is shown. Returns `dismiss(after?)`: use it for every close. */
export function useBackToClose(close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const keyRef = useRef('');

  useEffect(() => {
    const key = Math.random().toString(36).slice(2);
    keyRef.current = key;
    live.add(key);
    window.history.pushState({ fgModal: key }, '');
    let done = false;
    const onPop = () => {
      if (done) return;
      const state = window.history.state;
      // Still on our entry, or on one above it: a pop-up opened on top of us closed.
      if (state?.fgModal === key) return;
      done = true;
      live.delete(key);
      window.removeEventListener('popstate', onPop);
      const after = afters.get(key);
      afters.delete(key);
      closeRef.current();
      after?.();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      live.delete(key);
      // Closed some other way than Back (a pick, a tap outside, the page moving on): take our
      // entry away too, or it stays behind and a later Back lands on this page again — after
      // saving a form, Back went to the form (Hyoje, 24 Nov). Next tick: a page change
      // replaces the entry first, and React's dev double-mount pushes a new one; neither
      // still shows our key, so neither goes back.
      if (done) return;
      done = true;
      setTimeout(() => { if (window.history.state?.fgModal === key) window.history.back(); }, 0);
    };
  }, []);

  return useCallback((after?: () => void) => {
    if (window.history.state?.fgModal === keyRef.current) {
      if (after) afters.set(keyRef.current, after);
      window.history.back();
    } else {
      // Our entry is gone already (or never landed): just close.
      closeRef.current();
      after?.();
    }
  }, []);
}
