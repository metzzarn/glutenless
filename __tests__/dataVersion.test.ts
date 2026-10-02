import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Storage } from 'expo-sqlite/kv-store';
import stamp from '../data/beers-version.json';
import { BUNDLED_VERSION, getLocalVersion, isNewerVersion, setLocalVersion } from '../lib/dataVersion';

describe('data/beers-version.json', () => {
  it('matches data/beers.json — run `npm run stamp-data` after editing the beer list', () => {
    const beers = readFileSync(join(__dirname, '..', 'data', 'beers.json'));
    expect(createHash('sha256').update(beers).digest('hex')).toBe(stamp.sha256);
  });

  it('has a readable updatedAt that the app uses as the bundled version', () => {
    expect(Number.isNaN(Date.parse(stamp.updatedAt))).toBe(false);
    expect(BUNDLED_VERSION).toBe(stamp.updatedAt);
  });
});

describe('isNewerVersion', () => {
  const older = '2026-01-01T00:00:00.000Z';
  const newer = '2026-06-01T00:00:00.000Z';

  it('compares stamps by time', () => {
    expect(isNewerVersion(newer, older)).toBe(true);
    expect(isNewerVersion(older, newer)).toBe(false);
    expect(isNewerVersion(newer, newer)).toBe(false);
  });

  it('treats any readable stamp as newer than none, or than an unreadable one', () => {
    expect(isNewerVersion(older, null)).toBe(true);
    expect(isNewerVersion(older, 'garbage')).toBe(true);
  });

  it('never treats an unreadable stamp as newer', () => {
    expect(isNewerVersion('garbage', null)).toBe(false);
    expect(isNewerVersion('garbage', older)).toBe(false);
  });
});

describe('local version', () => {
  beforeEach(() => Storage.clearSync());
  afterEach(() => jest.restoreAllMocks());

  it('is remembered', () => {
    expect(getLocalVersion()).toBeNull();
    setLocalVersion('2026-06-01T00:00:00.000Z');
    expect(getLocalVersion()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('reads as unknown, and saving is skipped, when storage fails', () => {
    const fail = () => {
      throw new Error('no storage');
    };
    jest.spyOn(Storage, 'getItemSync').mockImplementation(fail);
    jest.spyOn(Storage, 'setItemSync').mockImplementation(fail);
    expect(getLocalVersion()).toBeNull();
    expect(() => setLocalVersion('2026-06-01T00:00:00.000Z')).not.toThrow();
  });
});
