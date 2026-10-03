import { useColors } from './theme';

export type GlutenStatus = 'free' | 'low';

export type FilterKey = 'all' | GlutenStatus | 'favorite';

export const STATUS_META: Record<GlutenStatus, { label: string; badge: string }> = {
  free: { label: 'Gluten-Free', badge: 'GF' },
  low: { label: 'Gluten-Removed', badge: 'GR' },
};

/** A status's label and badge together with its colors for the current light/dark palette. */
export function useStatusMeta(status: GlutenStatus) {
  const colors = useColors();
  return { ...STATUS_META[status], ...colors.status[status] };
}

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Gluten-Free' },
  { key: 'low', label: 'Gluten-Removed' },
  { key: 'favorite', label: 'Favorites' },
];

/**
 * Derives gluten status from the dataset's own glutenFree flag rather than
 * ppm: this dataset's ppm readings are all "under some threshold" style
 * values (no beer is literally "0 ppm"), so a ppm-based split would
 * misclassify every naturally gluten-free beer as gluten-removed.
 */
export function statusFromFlags(glutenFree: boolean): GlutenStatus {
  return glutenFree ? 'free' : 'low';
}

/**
 * A beer's `confirmed` list records which fields a human has checked against
 * a primary source. Gluten status counts as confirmed only when whichever
 * flag is actually true for this beer (glutenFree or glutenRemoved) is
 * itself on that list — confirming the other, inapplicable flag doesn't count.
 */
export function isGlutenStatusConfirmed(beer: {
  glutenFree: boolean;
  glutenRemoved: boolean;
  confirmed?: string[];
}): boolean {
  const key = beer.glutenFree ? 'glutenFree' : 'glutenRemoved';
  return (beer.confirmed ?? []).includes(key);
}
