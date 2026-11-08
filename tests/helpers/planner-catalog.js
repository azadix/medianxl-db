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
const BUILD_FIXTURE_DIR = resolve(REPO_ROOT, 'tests/fixtures/tsw-builds');

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
  const { items: overlays, sets } = buildCatalogFromUniqueStats(read('unique-stats-db.json'), [
    ...baseItems,
    ...other,
  ]);
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
  return existsSync(resolve(BUILD_FIXTURE_DIR, file));
}

/**
 * @returns {boolean}
 */
export function hasBuildFixtures() {
  if (!existsSync(BUILD_FIXTURE_DIR)) return false;
  return readdirSync(BUILD_FIXTURE_DIR).some((name) => name.endsWith('.json'));
}

/**
 * @param {string} file
 * @returns {object}
 */
export function loadBuildFixture(file) {
  return JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'tests/fixtures/tsw-builds', file), 'utf8')
  );
}
