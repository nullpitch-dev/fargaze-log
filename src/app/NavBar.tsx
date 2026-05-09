'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <nav className="border-b border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-3 flex items-center gap-8 shadow-sm dark:shadow-none">
      <span className="text-sm font-semibold tracking-widest text-stone-400 dark:text-zinc-500 uppercase">
        FarGaze
      </span>
      <Link href="/search" className={navClass('/search')}>Search</Link>
      <Link href="/spending" className={navClass('/spending')}>Spending</Link>
    </nav>
  );
}
