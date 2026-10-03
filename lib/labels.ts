import type { FilterKey } from './status';
import type { LastSync } from './sync';

const COUNT_NOUNS: Record<FilterKey, [singular: string, plural: string]> = {
  all: ['beer', 'beers'],
  free: ['gluten-free beer', 'gluten-free beers'],
  low: ['gluten-removed beer', 'gluten-removed beers'],
  favorite: ['favorite', 'favorites'],
};

export function countLabel(count: number, filter: FilterKey, query: string) {
  const [singular, plural] = COUNT_NOUNS[filter];
  const label = `${count} ${count === 1 ? singular : plural}`;
  const trimmed = query.trim();
  return trimmed ? `${label} matching "${trimmed}"` : label;
}

/** "Updated 3 h ago · 4 changed": how current the list is, from the last successful sync. */
export function freshnessLabel(lastSync: LastSync | null, now = Date.now()) {
  if (!lastSync) return 'Built-in list';
  const minutes = Math.floor((now - new Date(lastSync.at).getTime()) / 60000);
  const ago =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 60 * 24
          ? `${Math.floor(minutes / 60)} h ago`
          : `${Math.floor(minutes / (60 * 24))} d ago`;
  return lastSync.changes > 0 ? `Updated ${ago} · ${lastSync.changes} changed` : `Updated ${ago}`;
}
