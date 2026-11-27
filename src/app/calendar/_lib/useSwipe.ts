'use client';
// Swipe to the next / previous period on a phone (Hyoje, 27 Nov: "A for now" — a simple swipe,
// not Google's follow-the-finger). Day, 3 days, Week, Month and search's Month mode.
//
// Touch only: a mouse never swipes (the ‹ › buttons are there). A swipe is a mostly sideways
// slide of at least 60 px within 0.8 s; scrolling up and down through the hours is left alone.
// Touch events, not pointer events: the browser cancels pointer events once it starts
// scrolling the hours, but touch events still end. A swipe that starts on an event doesn't open
// it (a moved finger makes no click; a click that slips through just after is swallowed).
// After the change the view slides in from the side it came from.

import { useCallback, useRef } from 'react';

const MIN_DX = 60;
const MAX_MS = 800;

export function useSwipe(onSwipe: ((dir: 1 | -1) => void) | null) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const swallowUntil = useRef(0);
  const box = useRef<HTMLDivElement | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!onSwipe || e.touches.length !== 1) { start.current = null; return; }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, [onSwipe]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || !onSwipe || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < 1.5 * Math.abs(dy) || Date.now() - s.t > MAX_MS) return;
    const dir: 1 | -1 = dx < 0 ? 1 : -1;            // finger to the left → the next period
    swallowUntil.current = Date.now() + 400;
    onSwipe(dir);
    // Slide the new period in from the side it comes from.
    try {
      box.current?.animate(
        [{ transform: `translateX(${dir * 36}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
        { duration: 180, easing: 'ease-out' });
    } catch { /* no Web Animations: no slide */ }
  }, [onSwipe]);

  const onTouchCancel = useCallback(() => { start.current = null; }, []);
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() < swallowUntil.current) { e.preventDefault(); e.stopPropagation(); }
  }, []);

  // Sideways slides belong to the app, not the browser (27 Nov: a slide to the right was taken
  // as the browser's own gesture and its end never arrived). Up and down, and pinch, stay the
  // browser's. Applied to everything inside too: the hours scroll in a box of their own, and a
  // scroll box only looks at its own touch-action.
  const className = onSwipe ? 'touch-pan-y touch-pinch-zoom [&_*]:touch-pan-y [&_*]:touch-pinch-zoom' : '';
  return { ref: box, onTouchStart, onTouchEnd, onTouchCancel, onClickCapture, className };
}

