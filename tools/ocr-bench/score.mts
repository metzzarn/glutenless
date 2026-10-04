/**
 * Scores each reader's text from results.json the way the app would use it:
 * through lib/match.ts, against the real beer list.
 *
 *   node tools/ocr-bench/score.mts
 *   ONLY_WITH=mlkit node tools/ocr-bench/score.mts   # only photos that reader has
 *
 * A photo's expected beer comes from its file name, before any " - "
 * ("Stone Delicious IPA - bottle.jpg" → a beer whose brewery and name are in
 * "Stone Delicious IPA"). Look-alikes that contain gluten have no such beer,
 * so the only right answer for them is no match. A photo of several beers
 * lists each, joined by " + "; matching any of them counts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCanCandidates, matchBeerByText, suggestByBrewery } from '../../lib/match.ts';
import { beers, expectedBeers, here } from './expected.mts';

const allResults: Record<string, Record<string, { text: string; ms: number }>> = JSON.parse(
  readFileSync(join(here, 'results.json'), 'utf8'),
);
// Readings from the phone (ML Kit, Nano) cover fewer photos; compare every reader on just those.
const onlyWith = process.env.ONLY_WITH;
const results = Object.fromEntries(Object.entries(allResults).filter(([, byReader]) => !onlyWith || onlyWith in byReader));

const readers = [...new Set(Object.values(results).flatMap((r) => Object.keys(r)))];
const score: Record<string, { right: number; suggested: number; wrong: number; ms: number }> = {};

for (const [file, byReader] of Object.entries(results)) {
  const expected = expectedBeers(file);
  console.log(`\n${file}  →  expected: ${expected.length ? expected.map((b) => b.name).join(' or ') : 'no match (contains gluten or not in our list)'}`);
  for (const reader of readers) {
    const reading = byReader[reader];
    if (!reading) continue;
    const s = (score[reader] ??= { right: 0, suggested: 0, wrong: 0, ms: 0 });
    s.ms += reading.ms;
    const match = matchBeerByText(reading.text, beers as never);
    const suggestions = match ? [] : suggestByBrewery(findCanCandidates(reading.text, beers as never), beers as never);
    let verdict: string;
    if (match) {
      const ok = expected.some((b) => b.id === match.id);
      if (ok) s.right++;
      else s.wrong++;
      verdict = `${ok ? 'RIGHT ' : 'WRONG!'} matched ${match.name}`;
    } else if (expected.some((e) => suggestions.some((b) => b.id === e.id))) {
      s.suggested++;
      verdict = `ok     suggested ${expected.find((e) => suggestions.some((b) => b.id === e.id))!.name} among ${suggestions.length}`;
    } else if (!expected.length) {
      s.right++;
      verdict = 'RIGHT  no match';
    } else {
      verdict = 'miss   no match';
    }
    console.log(`  ${reader.padEnd(18)} ${verdict.padEnd(52)} ${JSON.stringify(reading.text.replace(/\n/g, ' / ')).slice(0, 90)}`);
  }
}

const photos = Object.keys(results).length;
console.log(`\n${'reader'.padEnd(18)} right  suggested  wrong  (of ${photos})   avg ms`);
for (const reader of readers) {
  const s = score[reader];
  console.log(
    `${reader.padEnd(18)} ${String(s.right).padStart(5)}  ${String(s.suggested).padStart(9)}  ${String(s.wrong).padStart(5)}  ${''.padEnd(10)} ${Math.round(s.ms / photos)}`,
  );
}
