#!/usr/bin/env node
/**
 * Merges candidate beers into data/beers.json.
 *
 *   node tools/merge-beers.mjs <candidates.json> [--dry-run]
 *
 * <candidates.json> is a JSON array of beers in the beers.json schema, without
 * `id` or `confirmed`. Existing entries are never modified: candidates are
 * validated, de-duplicated against the list (brewery + name), given new ids
 * continuing from the highest existing one, and appended as unconfirmed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampData } from './stamp-data.mjs';

const BEERS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'beers.json');

const KEY_ORDER = [
  'id',
  'name',
  'brewery',
  'country',
  'style',
  'abv',
  'ibu',
  'ppm',
  'glutenFree',
  'glutenRemoved',
  'discontinued',
  'grains',
  'note',
  'breweryUrl',
  'confirmed',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const candidatesPath = args.find((arg) => !arg.startsWith('--'));
if (!candidatesPath) {
  console.error('Usage: node tools/merge-beers.mjs <candidates.json> [--dry-run]');
  process.exit(1);
}

/** Lowercases and strips diacritics/punctuation so "Schnitzer Bräu" matches "schnitzer brau". */
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const beerKey = (beer) => `${normalize(beer.brewery)}|${normalize(beer.name)}`;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

/** Returns a list of problems with a candidate; empty when it is valid. */
function validate(beer) {
  if (typeof beer !== 'object' || beer === null || Array.isArray(beer)) return ['not an object'];

  const problems = [];
  for (const key of ['name', 'brewery', 'country', 'style', 'note']) {
    if (!isNonEmptyString(beer[key])) problems.push(`${key} must be a non-empty string`);
  }
  if (typeof beer.abv !== 'number' || beer.abv < 0 || beer.abv > 20) {
    problems.push('abv must be a number between 0 and 20');
  }
  if (beer.ibu !== null && !Number.isInteger(beer.ibu)) problems.push('ibu must be an integer or null');
  if (!/^<\d+ ppm$/.test(beer.ppm)) problems.push('ppm must look like "<20 ppm"');
  if (typeof beer.glutenFree !== 'boolean' || typeof beer.glutenRemoved !== 'boolean') {
    problems.push('glutenFree and glutenRemoved must be booleans');
  } else if (beer.glutenFree === beer.glutenRemoved) {
    problems.push('exactly one of glutenFree / glutenRemoved must be true');
  }
  if (beer.discontinued !== undefined && typeof beer.discontinued !== 'boolean') {
    problems.push('discontinued must be a boolean');
  }
  if (!Array.isArray(beer.grains) || beer.grains.length === 0 || !beer.grains.every(isNonEmptyString)) {
    problems.push('grains must be a non-empty array of strings');
  }
  if (!/^https?:\/\/\S+$/.test(beer.breweryUrl)) problems.push('breweryUrl must be an http(s) URL');

  const unknown = Object.keys(beer).filter((key) => !KEY_ORDER.includes(key));
  if (unknown.length > 0) problems.push(`unknown fields: ${unknown.join(', ')}`);
  return problems;
}

const serialize = (beers) => `[\n${beers.map((beer) => `  ${JSON.stringify(beer)}`).join(',\n')}\n]\n`;

const original = readFileSync(BEERS_PATH, 'utf8');
const beers = JSON.parse(original);
if (serialize(beers) !== original) {
  console.error('data/beers.json is not in the expected one-beer-per-line format — refusing to rewrite it.');
  process.exit(1);
}

const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
if (!Array.isArray(candidates)) {
  console.error(`${candidatesPath} must contain a JSON array`);
  process.exit(1);
}

const seen = new Map(beers.map((beer) => [beerKey(beer), beer]));
const existingNames = new Map(beers.map((beer) => [normalize(beer.name), beer]));
let nextId = Math.max(...beers.map((beer) => beer.id)) + 1;

const added = [];
const duplicates = [];
const invalid = [];

for (const [index, candidate] of candidates.entries()) {
  const label = candidate?.name ? `"${candidate.name}" (${candidate.brewery})` : `index ${index}`;
  const problems = validate(candidate);
  if (problems.length > 0) {
    invalid.push(`${label}: ${problems.join('; ')}`);
    continue;
  }
  const key = beerKey(candidate);
  if (seen.has(key)) {
    duplicates.push(`${label} — already in the list as id ${seen.get(key).id ?? 'new'}`);
    continue;
  }
  const sameName = existingNames.get(normalize(candidate.name));
  if (sameName) {
    console.warn(`warning: ${label} has the same name as id ${sameName.id} (${sameName.brewery}) — check it is not a duplicate`);
  }

  const beer = { ...candidate, id: nextId++, discontinued: candidate.discontinued ?? false, confirmed: [] };
  const ordered = Object.fromEntries(KEY_ORDER.map((key) => [key, beer[key]]));
  seen.set(key, ordered);
  added.push(ordered);
}

for (const line of invalid) console.error(`invalid: ${line}`);
for (const line of duplicates) console.log(`duplicate: ${line}`);
for (const beer of added) console.log(`add: ${beer.id} ${beer.name} — ${beer.brewery} (${beer.country})`);
console.log(`\n${added.length} added, ${duplicates.length} duplicates skipped, ${invalid.length} invalid`);

if (invalid.length > 0) {
  console.error('Nothing written — fix the invalid candidates and run again.');
  process.exit(1);
}
if (dryRun) {
  console.log('Dry run — nothing written.');
} else if (added.length > 0) {
  writeFileSync(BEERS_PATH, serialize([...beers, ...added]));
  console.log(`Wrote ${beers.length + added.length} beers to data/beers.json`);
  console.log(`Stamped data/beers-version.json: ${stampData().updatedAt}`);
}
