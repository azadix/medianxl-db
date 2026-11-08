/**
 * Unified item catalog generation.
 *
 * Default: unique-stats, relics, runewords, upgrades, and affixes from wiki/docs.
 * Charms need the TSW API (in-game IP within 24h) and are opt-in.
 *
 * Usage:
 *   npm run generate:items
 *   npm run generate:items -- --check
 *   npm run generate:items -- charms
 *   npm run generate:items -- all
 *   npm run generate:items -- upgrades
 *   npm run generate:items -- uniques relics runewords upgrades 2.14 --check
 *   npm run generate:items -- uniques --secrets-only
 *   npm run generate:items -- runewords --from-html path/to/page.html
 *   npm run generate:items -- affixes --from-html path/to/page.html
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main as generateUniques } from './generate-unique-stats-db.mjs';
import { main as generateRelics } from './generate-relics-from-wiki.mjs';
import { main as generateRunewords } from './generate-runewords-from-wiki.mjs';
import { main as generateCharms } from './generate-relics-charms-from-tsw.mjs';
import { main as generateUpgrades } from './generate-upgrade-catalogs.mjs';
import { main as generateAffixes } from './generate-affixes-from-wiki.mjs';
import { applyManualOverrides } from './apply-manual-overrides.mjs';

const TASKS = Object.freeze({
  uniques: generateUniques,
  relics: generateRelics,
  runewords: generateRunewords,
  charms: generateCharms,
  upgrades: generateUpgrades,
  affixes: generateAffixes,
});
const TASK_NAMES = new Set([...Object.keys(TASKS), 'all']);
const WIKI_DEFAULT = Object.freeze(['uniques', 'relics', 'runewords', 'upgrades', 'affixes']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  if (task === 'runewords' || task === 'affixes') return rest;
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
  const withIcons = rest.includes('--with-icons');
  const taskRest = rest.filter((arg) => arg !== '--with-icons');
  for (const name of selected) {
    console.log(`\n=== ${name} ===`);
    await TASKS[name](argsFor(name, taskRest));
  }
  if (withIcons && !rest.includes('--check')) {
    console.log('\n=== item icons ===');
    const iconResult = spawnSync('python', ['tools/item_icons/sync_catalog_icons.py'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (iconResult.status !== 0) {
      console.warn('WARNING: item icon sync failed; continuing without icon refresh.');
    }
  }
  if (!rest.includes('--check')) {
    const version = rest.find((arg) => /^\d+\.\d+$/.test(arg)) || '2.14';
    console.log('\n=== manual overrides ===');
    applyManualOverrides({ version, log: (message) => console.log(message) });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
