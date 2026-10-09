/**
 * Unified item catalog generation.
 *
 * Default: unique-stats, relics, and runewords from Median XL docs HTML.
 * Charms need the TSW API (in-game IP within 24h) and are opt-in.
 *
 * Usage:
 *   npm run generate:items
 *   npm run generate:items -- --check
 *   npm run generate:items -- charms
 *   npm run generate:items -- all
 *   npm run generate:items -- uniques relics runewords 2.14 --check
 *   npm run generate:items -- uniques --secrets-only
 *   npm run generate:items -- runewords --from-html path/to/page.html
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { main as generateUniques } from './generate-unique-stats-db.mjs';
import { main as generateRelics } from './generate-relics-from-wiki.mjs';
import { main as generateRunewords } from './generate-runewords-from-wiki.mjs';
import { main as generateCharms } from './generate-relics-charms-from-tsw.mjs';

const TASKS = Object.freeze({
  uniques: generateUniques,
  relics: generateRelics,
  runewords: generateRunewords,
  charms: generateCharms,
});
const TASK_NAMES = new Set([...Object.keys(TASKS), 'all']);
const WIKI_DEFAULT = Object.freeze(['uniques', 'relics', 'runewords']);

/**
 * @param {string[]} argv
 * @returns {{ selected: string[], rest: string[] }}
 */
function parseArgv(argv) {
  const names = [];
  const rest = [];
  for (const arg of argv) {
    if (TASK_NAMES.has(arg)) names.push(arg);
    else rest.push(arg);
  }
  const selected = names.includes('all')
    ? Object.keys(TASKS)
    : names.length
      ? names.filter((name) => name !== 'all')
      : [...WIKI_DEFAULT];
  return { selected, rest };
}

/**
 * @param {string} task
 * @param {string[]} rest
 * @returns {string[]}
 */
function argsFor(task, rest) {
  if (task === 'runewords') return rest;
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--from-html') {
      i += 1;
      continue;
    }
    out.push(rest[i]);
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const { selected, rest } = parseArgv(argv);
  for (const name of selected) {
    console.log(`\n=== ${name} ===`);
    await TASKS[name](argsFor(name, rest));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
