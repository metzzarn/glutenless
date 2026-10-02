import { countLabel, freshnessLabel } from '../lib/labels';

describe('countLabel', () => {
  it('names what the selected tab holds', () => {
    expect(countLabel(264, 'all', '')).toBe('264 beers');
    expect(countLabel(187, 'free', '')).toBe('187 gluten-free beers');
    expect(countLabel(77, 'low', '')).toBe('77 gluten-removed beers');
    expect(countLabel(3, 'favorite', '')).toBe('3 favorites');
  });

  it('uses the singular for exactly one', () => {
    expect(countLabel(1, 'all', '')).toBe('1 beer');
    expect(countLabel(1, 'free', '')).toBe('1 gluten-free beer');
    expect(countLabel(1, 'favorite', '')).toBe('1 favorite');
  });

  it('adds the trimmed search query', () => {
    expect(countLabel(8, 'free', '  ipa ')).toBe('8 gluten-free beers matching "ipa"');
    expect(countLabel(8, 'free', '   ')).toBe('8 gluten-free beers');
  });
});

describe('freshnessLabel', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const syncedAgo = (minutes: number, changes = 0) =>
    freshnessLabel({ at: new Date(now - minutes * 60000).toISOString(), changes }, now);

  it('says the built-in list is in use before any sync', () => {
    expect(freshnessLabel(null, now)).toBe('Built-in list');
  });

  it('rounds down into minutes, hours and days', () => {
    expect(syncedAgo(0)).toBe('Updated just now');
    expect(syncedAgo(0.9)).toBe('Updated just now');
    expect(syncedAgo(1)).toBe('Updated 1 min ago');
    expect(syncedAgo(59)).toBe('Updated 59 min ago');
    expect(syncedAgo(60)).toBe('Updated 1 h ago');
    expect(syncedAgo(60 * 24 - 1)).toBe('Updated 23 h ago');
    expect(syncedAgo(60 * 24)).toBe('Updated 1 d ago');
    expect(syncedAgo(60 * 24 * 9)).toBe('Updated 9 d ago');
  });

  it('treats a sync time slightly in the future (clock skew) as just now', () => {
    expect(syncedAgo(-2)).toBe('Updated just now');
  });

  it('measures against the current time by default', () => {
    expect(freshnessLabel({ at: new Date(Date.now() - 3 * 60000).toISOString(), changes: 0 })).toBe(
      'Updated 3 min ago'
    );
  });

  it('mentions how many beers the update changed, if any', () => {
    expect(syncedAgo(5, 4)).toBe('Updated 5 min ago · 4 changed');
    expect(syncedAgo(5, 0)).toBe('Updated 5 min ago');
  });
});
