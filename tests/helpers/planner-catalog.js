/**
 * Shared planner catalog loader for integration tests.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import {
  loadSocketablesCatalog,
  mergeJewelItemsIntoSocketablesCatalog,
} from '@/items/socketables.js';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
/** Local, git-ignored drop zone for TSW dumps. */
const BUILD_FIXTURE_DIR = resolve(REPO_ROOT, 'tests/fixtures/tsw-builds');
/** Small set of builds committed to git so CI can run the fixture tests. */
const COMMITTED_BUILD_FIXTURE_DIR = resolve(REPO_ROOT, 'tests/fixtures/tsw-builds-committed');

/**
 * Directories that may contain build fixtures, local first (it wins on name clashes).
 * @returns {string[]}
 */
export function buildFixtureDirs() {
  return [BUILD_FIXTURE_DIR, COMMITTED_BUILD_FIXTURE_DIR];
}

/**
 * Build fixture file names across the local and committed directories.
 * @returns {string[]}
 */
export function listBuildFixtures() {
  /** @type {Set<string>} */
  const names = new Set();
  for (const dir of buildFixtureDirs()) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.toLowerCase().endsWith('.json')) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * @param {string} file
 * @returns {string|null}
 */
export function resolveBuildFixturePath(file) {
  for (const dir of buildFixtureDirs()) {
    const path = resolve(dir, file);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * @param {string} [version]
 * @returns {{ catalog: object[], sets: object[] }}
 */
export function loadPlannerCatalog(version = '2_14') {
  const dir = resolve(REPO_ROOT, 'public/items', version);
  const read = (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
  const baseItems = read('baseitems.json');
  const other = read('other.json');
  const charms = read('charms.json').map((charm) => ({
    ...charm,
    type: charm.type || 'charm',
    category: charm.category || 'charms',
    keepInInventory: true,
  }));
  const relics = read('relics.json').map((relic) => ({
    ...relic,
    type: relic.type || 'jewl',
    category: relic.category || 'relics',
    rarity: relic.rarity || 'relic',
    keepInInventory: true,
  }));
  const { items: overlays, sets } = buildCatalogFromUniqueStats(
    read('unique-stats-db.json'),
    [...baseItems, ...other],
    existsSync(resolve(dir, 'set-bonuses.json')) ? read('set-bonuses.json') : null
  );
  const runewordsData = read('runewords.json');
  const entries = Array.isArray(runewordsData) ? runewordsData : runewordsData.entries || [];
  const runewords = entries.map(runewordEntryToItemDef).filter(Boolean);
  loadSocketablesCatalog(read('socketables.json'));
  loadMysticOrbsCatalog(read('mystic-orbs.json'));
  const catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics, ...runewords];
  mergeJewelItemsIntoSocketablesCatalog(catalog);
  return { catalog, sets };
}

/**
 * @param {string} file
 * @returns {boolean}
 */
export function hasBuildFixture(file) {
  return resolveBuildFixturePath(file) != null;
}

/**
 * @returns {boolean}
 */
export function hasBuildFixtures() {
  return listBuildFixtures().length > 0;
}

/**
 * @param {string} file
 * @returns {object}
 */
export function loadBuildFixture(file) {
  const path = resolveBuildFixturePath(file);
  if (!path) throw new Error(`Missing build fixture: ${file}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
