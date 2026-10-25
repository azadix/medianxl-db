/**
 * Dump first unique Unknown-section item modifiers from TSW build fixtures.
 *
 *   npx vite-node tools/dump-unknown-item-stats.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { loadSocketablesCatalog, mergeJewelItemsIntoSocketablesCatalog } from '@/items/socketables.js';
import {
  recomputePlannerStatsFromItems,
  getPlannerUnknownItemStatModifiers,
} from '@/items/item-character-stat-bonuses.js';
import { unwrapTswOrNativeBuild, mapTswItemsToSnapshot } from '@/planner/tsw-build-import.js';
import { useItemsStore } from '@/stores/items.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../tests/helpers/mock-fetch-tree-data.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDS_DIR = process.env.TSW_BUILDS_DIR || resolve(ROOT, 'tests/fixtures/tsw-builds');
const OUT_PATH = resolve(ROOT, 'unkstats.md');

function loadPlannerCatalog() {
  const dir = resolve(ROOT, 'public/items/2_14');
  const baseItems = JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8'));
  const other = JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8'));
  const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8')).map((c) => ({
    ...c,
    type: c.type || 'charm',
    category: c.category || 'charms',
    keepInInventory: true,
  }));
  const relics = JSON.parse(readFileSync(resolve(dir, 'relics.json'), 'utf8')).map((r) => ({
    ...r,
    type: r.type || 'jewl',
    category: r.category || 'relics',
    rarity: r.rarity || 'relic',
    keepInInventory: true,
  }));
  const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
  const { items: overlays, sets } = buildCatalogFromUniqueStats(db, [...baseItems, ...other]);
  const runewordsData = JSON.parse(readFileSync(resolve(dir, 'runewords.json'), 'utf8'));
  const entries = Array.isArray(runewordsData) ? runewordsData : runewordsData.entries || [];
  const runewords = entries.map(runewordEntryToItemDef).filter(Boolean);
  loadSocketablesCatalog(JSON.parse(readFileSync(resolve(dir, 'socketables.json'), 'utf8')));
  loadMysticOrbsCatalog(JSON.parse(readFileSync(resolve(dir, 'mystic-orbs.json'), 'utf8')));
  const catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics, ...runewords];
  mergeJewelItemsIntoSocketablesCatalog(catalog);
  return { catalog, sets };
}

/**
 * @param {object[]} catalog
 * @param {object[]} sets
 * @param {string} file
 * @returns {{ character: string, unknown: { text: string, sourceLabel: string }[] }}
 */
function unknownFromBuild(catalog, sets, file) {
  const raw = JSON.parse(readFileSync(resolve(BUILDS_DIR, file), 'utf8'));
  const { build, tswItems } = unwrapTswOrNativeBuild(raw);
  setActivePinia(createPinia());
  const store = useItemsStore();
  store.catalog = catalog;
  store.sets = Array.isArray(sets) ? sets : [];
  store.catalogLoaded = true;
  store.catalogVersionFolder = '2_14';
  const characterName = String(build?.name || file.replace(/\.json$/i, '')).trim();
  const ch = createCharacterInstance(build.class || 'Amazon', Number(build.level) || 150);
  store.syncViewerClassName(build.class);
  const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
  store.fromSnapshot(snapshot);
  if (build.stats) ch.parseStatsFromText(String(build.stats));
  recomputePlannerStatsFromItems(ch);
  const unknown = getPlannerUnknownItemStatModifiers();
  setCharacterInstance(null);
  return { character: characterName, unknown };
}

function mdEscapeCell(text) {
  return String(text || '').replace(/\|/g, '\\|');
}

async function main() {
  const restoreFetch = installTreeDataFetchMock();
  try {
    await initSkillDataStore();
    const { catalog, sets } = loadPlannerCatalog();
    const files = existsSync(BUILDS_DIR)
      ? readdirSync(BUILDS_DIR)
          .filter((name) => name.toLowerCase().endsWith('.json'))
          .sort()
      : [];

    /** @type {Map<string, { character: string, stat: string, source: string }>} */
    const firstByStat = new Map();
    for (const file of files) {
      const { character, unknown } = unknownFromBuild(catalog, sets, file);
      for (const row of unknown) {
        const stat = String(row?.text || '').trim();
        if (!stat || firstByStat.has(stat)) continue;
        firstByStat.set(stat, {
          character,
          stat,
          source: String(row?.sourceLabel || '').trim(),
        });
      }
    }

    const rows = [...firstByStat.values()];
    const lines = [
      '# Unknown item stats',
      '',
      'First unique encounter of each Unknown-section modifier across TSW build dumps.',
      '',
      '| Character | Stat | Source |',
      '| --- | --- | --- |',
    ];
    for (const row of rows) {
      lines.push(
        `| ${mdEscapeCell(row.character)} | ${mdEscapeCell(row.stat)} | ${mdEscapeCell(row.source)} |`
      );
    }
    lines.push('');
    writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
    console.log(`Wrote ${rows.length} unknown stats to ${OUT_PATH}`);
  } finally {
    restoreFetch?.();
  }
}

await main();
