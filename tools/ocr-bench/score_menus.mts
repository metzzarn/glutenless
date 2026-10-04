/**
 * Scores menu readings the way the app would use them: each reader's text
 * through lib/match.ts's menu matcher, against the beers the menu's file name
 * lists (see expected.mts; "none - …" lists only beers with gluten).
 *
 * Readings come from the phone's menu bench (glutenless://bench?set=menus),
 * whose logcat lines are added to results-menus.json:
 *
 *   adb logcat -d | grep -o 'MENU .*' > tools/ocr-bench/menus-phone.log
 *   node tools/ocr-bench/score_menus.mts tools/ocr-bench/menus-phone.log
 *   node tools/ocr-bench/score_menus.mts      # re-score after a matcher change
 *
 * "found" counts expected beers matched; "wrong" counts beers matched that
 * the menu doesn't list, the error that must stay at 0: a menu shown as
 * offering a gluten-free beer it doesn't have.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchBeersInMenuText } from '../../lib/match.ts';
import { beers, expectedBeers, here } from './expected.mts';

type Readings = Record<string, Record<string, { text: string; ms: number }>>;
const RESULTS = join(here, 'results-menus.json');
const results: Readings = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};

const log = process.argv[2];
if (log) {
  // Each reading's text (JSON) comes in numbered parts, since logcat cuts long lines.
  const parts: Record<string, { ms: number; total: number; parts: string[] }> = {};
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    const m = line.match(/^MENU (.+?) :: (\S+) :: (\d+) :: (\d+)\/(\d+) :: (.*)$/);
    if (!m) continue;
    const [, file, reader, ms, part, total, chunk] = m;
    const key = `${file}\t${reader}`;
    (parts[key] ??= { ms: Number(ms), total: Number(total), parts: [] }).parts[Number(part) - 1] = chunk;
  }
  for (const [key, { ms, total, parts: chunks }] of Object.entries(parts)) {
    const [file, reader] = key.split('\t');
    if (chunks.filter((c) => c !== undefined).length !== total) {
      console.error(`Incomplete reading, skipped: ${file} [${reader}]`);
      continue;
    }
    (results[file] ??= {})[reader] = { text: JSON.parse(chunks.join('')), ms };
  }
  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n');
}

const readers = [...new Set(Object.values(results).flatMap((r) => Object.keys(r)))];
const score: Record<string, { found: number; expected: number; wrong: number; ms: number; menus: number }> = {};

for (const [file, byReader] of Object.entries(results)) {
  const expected = expectedBeers(file);
  console.log(`\n${file}  →  expected: ${expected.map((b) => b.name).join(', ') || 'none'}`);
  for (const reader of readers) {
    const reading = byReader[reader];
    if (!reading) continue;
    const s = (score[reader] ??= { found: 0, expected: 0, wrong: 0, ms: 0, menus: 0 });
    const matches = matchBeersInMenuText(reading.text, beers as never);
    const found = expected.filter((e) => matches.some((b) => b.id === e.id));
    const missed = expected.filter((e) => !found.includes(e));
    const wrong = matches.filter((b) => !expected.some((e) => e.id === b.id));
    s.found += found.length;
    s.expected += expected.length;
    s.wrong += wrong.length;
    s.ms += reading.ms;
    s.menus++;
    console.log(
      `  ${reader.padEnd(12)} found ${found.length}/${expected.length}` +
        (missed.length ? `  missed: ${missed.map((b) => b.name).join(', ')}` : '') +
        (wrong.length ? `  WRONG: ${wrong.map((b) => `${b.name} | ${b.brewery}`).join(', ')}` : '') +
        `  (${reading.ms} ms)`,
    );
  }
}

console.log(`\n${'reader'.padEnd(12)} found  wrong   avg ms`);
for (const reader of readers) {
  const s = score[reader];
  console.log(`${reader.padEnd(12)} ${`${s.found}/${s.expected}`.padStart(5)}  ${String(s.wrong).padStart(5)}  ${String(Math.round(s.ms / s.menus)).padStart(7)}`);
}
