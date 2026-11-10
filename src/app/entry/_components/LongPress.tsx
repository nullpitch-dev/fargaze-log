'use client';

// Long press for the entry app (Hyoje, 10 Nov): more actions without more buttons on a
// narrow screen. Half a second's press opens a small menu at the foot of the screen; a
// right-click does the same on a computer. The tap that ends a long press does nothing,
// and the phone's own link menu is held back.
// Chrome on Android also starts selecting the text (and offers Copy and a Google search,
// Hyoje 10 Nov): CSS user-select alone doesn't always stop it, so a pressable element is
// marked data-longpress and a selectstart inside one is refused; any selection that got
// through is cleared when the menu opens.

import { useCallback, useEffect, useRef } from 'react';

const HOLD_MS = 500;
const SLOP_PX = 10;   // a finger that moves more than this is scrolling, not pressing

let guarded = false;
function guardSelection() {
  if (guarded || typeof document === 'undefined') return;
  guarded = true;
  document.addEventListener('selectstart', e => {
    const t = e.target as Node | null;
    const el = t && (t.nodeType === 1 ? (t as Element) : t.parentElement);
    if (el?.closest('input, textarea')) return;   // a stamp's note box stays editable
    if (el?.closest('[data-longpress]')) e.preventDefault();
  });
}

export function useLongPress() {
  useEffect(guardSelection, []);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const from = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; from.current = null; };

  return useCallback((onLong: () => void) => {
    const fire = () => {
      cancel();
      if (fired.current) return;
      fired.current = true;
      try { navigator.vibrate?.(15); } catch { /* not on every phone */ }
      try { window.getSelection()?.removeAllRanges(); } catch { /* nothing selected */ }
      onLong();
    };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        from.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(fire, HOLD_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (from.current && Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); fire(); },
      onClickCapture: (e: React.MouseEvent) => {
        if (!fired.current) return;
        e.preventDefault(); e.stopPropagation();
        fired.current = false;
      },
      'data-longpress': '',
      style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface SheetAction { label: string; hint?: string; run: () => void }

/** The menu a long press opens: a title, the actions, and Cancel. */
export function ActionSheet({ title, actions, onClose }: { title: string; actions: SheetAction[]; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div role="menu" aria-label={title} onClick={e => e.stopPropagation()}
        className="w-full max-w-md m-2 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 shadow-xl overflow-hidden">
        <p className="px-4 pt-3 pb-2 text-xs text-stone-500 dark:text-zinc-400 truncate">{title}</p>
        {actions.map(a => (
          <button key={a.label} role="menuitem" onClick={() => { onClose(); a.run(); }}
            className="block w-full text-left px-4 py-3 border-t border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800">
            <span className="block text-sm text-stone-800 dark:text-zinc-100">{a.label}</span>
            {a.hint && <span className="block text-xs text-stone-500 dark:text-zinc-400">{a.hint}</span>}
          </button>
        ))}
        <button onClick={onClose} className="block w-full px-4 py-3 border-t border-stone-200 dark:border-zinc-700 text-sm font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800">Cancel</button>
      </div>
    </div>
  );
}
