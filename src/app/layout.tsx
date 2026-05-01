import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
export const metadata: Metadata = {
  title: 'FarGaze Log',
  description: 'Personal life analytics',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-zinc-100">
        <nav className="border-b border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-3 flex items-center gap-8 shadow-sm dark:shadow-none">
          <span className="text-sm font-semibold tracking-widest text-stone-400 dark:text-zinc-500 uppercase">
            FarGaze
          </span>
          <a href="/search" className="text-sm text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors">
            Search
          </a>
          <a href="/spending" className="text-sm text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors">
            Spending
          </a>
        </nav>
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
