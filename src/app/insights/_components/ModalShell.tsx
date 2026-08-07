'use client';
// src/app/insights/_components/ModalShell.tsx
//
// Shared centred modal, rendered through a portal on document.body so it
// escapes the widget card's overflow:hidden. Click the backdrop or the ×
// to close; clicks inside the panel do not bubble out to the backdrop.
//
// Extracted from DietWidget at v4.4, when ExerciseWidget needed the same
// shell. Same trigger that lifted Segmented out at v4.2 — a second widget
// wanting an existing control is a signal to extract it, not to copy it.

import React from 'react';
import { createPortal } from 'react-dom';

export function ModalShell({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-900 dark:text-zinc-50 uppercase tracking-wide">{title}</p>
          <button onClick={onClose}
            className="text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
