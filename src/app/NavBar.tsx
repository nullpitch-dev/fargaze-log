'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Pin { slug: string; title: string }

export default function NavBar() {
  const pathname = usePathname();

  function navClass(path: string) {
    const isActive = pathname.startsWith(path);
    return `text-sm transition-colors ${
      isActive
        ? 'text-stone-900 dark:text-zinc-100 font-bold'
        : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
    }`;
  }

  // ── Gear menu: All master lists + the lists pinned on /admin (#67) ─────────
  // openOn = the page the menu was opened on; moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [pinsError, setPinsError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpenOn(null);

  // Read the pins each time the menu opens, so a star just ticked on /admin shows.
  function toggle() {
    if (open) { close(); return; }
    setOpenOn(pathname);
    setPinsError(false);
    fetch('/api/admin/pins')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => setPins(d.pins))
      .catch(() => setPinsError(true));
  }

  // Close on a click or tap outside, and on Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenOn(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (href: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      pathname === href
        ? 'text-stone-900 dark:text-zinc-100 font-semibold bg-stone-50 dark:bg-zinc-800'
        : 'text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800'
    }`;

  return (
    <nav className="border-b border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-3 flex items-center gap-8 max-[520px]:px-4 max-[520px]:gap-4 whitespace-nowrap shadow-sm dark:shadow-none">
      {/* Hidden on narrow screens (Fold 6 outer screen, ~344 px), so the bar fits and the page is not zoomed out */}
      <span className="text-sm font-semibold tracking-widest text-stone-400 dark:text-zinc-500 uppercase max-[520px]:hidden">
        FarGaze
      </span>
			<Link href="/calendar" className={navClass('/calendar')}>Calendar</Link>
      <Link href="/insights" className={navClass('/insights')}>Insights</Link>
      <Link href="/search" className={navClass('/search')}>Search</Link>
      <Link href="/spending" className={navClass('/spending')}>Spending</Link>
      <div ref={menuRef} className="relative ml-auto flex items-center">
        <button
          type="button"
          onClick={toggle}
          title="Master lists"
          aria-label="Master lists"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`${navClass('/admin')} p-1 -m-1`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-3 w-56 z-50 py-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg shadow-lg"
          >
            <Link href="/admin" role="menuitem" onClick={close} className={item('/admin')}>All master lists</Link>
            <div className="my-1 border-t border-stone-100 dark:border-zinc-800" />
            {pinsError && <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400">Could not load shortcuts</p>}
            {!pins && !pinsError && <p className="px-4 py-2 text-xs text-stone-400 dark:text-zinc-500">Loading…</p>}
            {pins && pins.length === 0 && (
              <p className="px-4 py-2 text-xs text-stone-400 dark:text-zinc-500">No shortcuts. Tap ☆ on a list to pin it.</p>
            )}
            {pins?.map(p => (
              <Link key={p.slug} href={`/admin/${p.slug}`} role="menuitem" onClick={close} className={item(`/admin/${p.slug}`)}>{p.title}</Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
