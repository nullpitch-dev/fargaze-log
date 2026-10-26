// Gear-menu shortcuts (#67): which master lists are pinned.
// Shown in the order of /admin (LISTS), whatever order they were pinned in.

import AdminSettings from '@/models/AdminSettings';
import { LISTS } from './lists';

/** Used until the first pin or unpin is saved. */
export const STARTER_PINS = ['activity', 'cost', 'place-coord', 'ingredient'];

export interface Pin { slug: string; title: string }

const tidy = (slugs: string[]) => LISTS.map(l => l.slug).filter(s => slugs.includes(s));

export async function getPins(userId: string): Promise<string[]> {
  const doc = await AdminSettings.findOne({ userId }).select('pins').lean() as { pins?: string[] } | null;
  return tidy(doc?.pins ?? STARTER_PINS);
}

export async function setPinned(userId: string, slug: string, pinned: boolean): Promise<string[]> {
  const now = await getPins(userId);
  const next = tidy(pinned ? [...now, slug] : now.filter(s => s !== slug));
  await AdminSettings.updateOne({ userId }, { $set: { pins: next } }, { upsert: true });
  return next;
}

export const toPins = (slugs: string[]): Pin[] =>
  slugs.map(s => ({ slug: s, title: LISTS.find(l => l.slug === s)!.title }));
