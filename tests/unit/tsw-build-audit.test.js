/**
 * Audit TSW dumps under tests/fixtures/tsw-builds (or TSW_BUILDS_DIR).
 * Compares in-game requirement lines to planner reqs and flags import warnings.
 *
 *   npm run audit
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { loadSocketablesCatalog, mergeJewelItemsIntoSocketablesCatalog } from '@/items/socketables.js';
import { tswDescriptionTexts } from '@/items/custom-items.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { formatItemRequirementsLine } from '@/items/item-requirements.js';
import { recomputePlannerStatsFromItems } from '@/items/item-character-stat-bonuses.js';
import {
  unwrapTswOrNativeBuild,
  mapTswItemsToSnapshot,
  TSW_SLOT_TO_EQUIPMENT,
  isMindflayerMayhemRow,
} from '@/planner/tsw-build-import.js';
import { useItemsStore } from '@/stores/items.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const BUILDS_DIR = process.env.TSW_BUILDS_DIR || resolve(ROOT, 'tests/fixtures/tsw-builds');

const REQ_LEVEL_RE = /^Required Level:\s*(\d+)\s*$/i;
const REQ_STR_RE = /^Required Strength:\s*(\d+)\s*$/i;
const REQ_DEX_RE = /^Required Dexterity:\s*(\d+)\s*$/i;
const SKIP_WARNING_REASONS = new Set(['uncatalogued', 'unknown-slot', 'relic-cap']);

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
 * @param {object} row
 * @returns {{ reqLevel: number|null, reqStr: number|null, reqDex: number|null }}
 */
function tswRequiredStats(row) {
  /** @type {{ reqLevel: number|null, reqStr: number|null, reqDex: number|null }} */
  const out = { reqLevel: null, reqStr: null, reqDex: null };
  for (const line of tswDescriptionTexts(row?.description_lines)) {
    const lvl = REQ_LEVEL_RE.exec(line);
    if (lvl) out.reqLevel = Number(lvl[1]);
    const str = REQ_STR_RE.exec(line);
    if (str) out.reqStr = Number(str[1]);
    const dex = REQ_DEX_RE.exec(line);
    if (dex) out.reqDex = Number(dex[1]);
  }
  return out;
}

/**
 * @param {object[]} catalog
 * @param {string} file
 * @returns {string[]}
 */
function auditBuildFile(catalog, file, sets = []) {
  const raw = JSON.parse(readFileSync(resolve(BUILDS_DIR, file), 'utf8'));
  const { build, tswItems } = unwrapTswOrNativeBuild(raw);
  setActivePinia(createPinia());
  const store = useItemsStore();
  store.catalog = catalog;
  store.sets = Array.isArray(sets) ? sets : [];
  store.catalogLoaded = true;
  store.catalogVersionFolder = '2_14';
  const ch = createCharacterInstance(build.class || 'Amazon', Number(build.level) || 150);
  store.syncViewerClassName(build.class);
  const { snapshot, skipped } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
  const report = store.fromSnapshot(snapshot);
  if (build.stats) ch.parseStatsFromText(String(build.stats));
  recomputePlannerStatsFromItems(ch);

  /** @type {string[]} */
  const problems = [];

  for (const row of skipped || []) {
    if (!SKIP_WARNING_REASONS.has(String(row.reason || ''))) continue;
    problems.push(`skip ${row.reason}: ${row.name || '(unnamed)'}`);
  }
  for (const row of report.disabledCharms || []) {
    problems.push(`charm disabled: ${row.name} (req ${row.reqLevel})`);
  }
  for (const row of report.disabledRelics || []) {
    problems.push(`relic disabled: ${row.name} (req ${row.reqLevel})`);
  }
  for (const row of store.listUnmetEquippedItems()) {
    problems.push(`unmet: ${row.name} (${row.requirementsLine})`);
  }

  /** @type {Map<string, object>} */
  const bySlot = new Map();
  for (const row of tswItems || []) {
    if (String(row?.location || '') !== 'Gear') continue;
    const slot = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
    if (slot) bySlot.set(slot, row);
  }

  for (const slot of EQUIPMENT_SLOTS) {
    const id = store.equipment[slot];
    if (id == null) continue;
    const row = bySlot.get(slot);
    if (!row) continue;
    const tsw = tswRequiredStats(row);
    const got = store.getRequirementsForInstance(id);
    if (!got) continue;
    const name = store.getDefForInstance(id)?.name || slot;
    if (isMindflayerMayhemRow(row)) {
      if (got.reqLevel !== 140) {
        problems.push(`${slot} ${name}: planner level ${got.reqLevel} expected 140`);
      }
      continue;
    }
    if (tsw.reqLevel != null && got.reqLevel !== tsw.reqLevel) {
      problems.push(
        `${slot} ${name}: level planner=${got.reqLevel} tsw=${tsw.reqLevel} (${formatItemRequirementsLine(got)})`
      );
    }
    if (tsw.reqStr != null && got.reqStr !== tsw.reqStr) {
      problems.push(`${slot} ${name}: str planner=${got.reqStr} tsw=${tsw.reqStr}`);
    }
    if (tsw.reqDex != null && got.reqDex !== tsw.reqDex) {
      problems.push(`${slot} ${name}: dex planner=${got.reqDex} tsw=${tsw.reqDex}`);
    }
  }
  setCharacterInstance(null);
  return problems;
}

const files = existsSync(BUILDS_DIR)
  ? readdirSync(BUILDS_DIR)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort()
  : [];

describe('TSW build audit', () => {
  it('runs dump audits when at least one local json dump exists', () => {
    if (files.length === 0) return;
    expect(files.length).toBeGreaterThan(0);
  });
});

describe.skipIf(files.length === 0)('TSW build audit dumps', () => {
  /** @type {{ catalog: object[], sets: object[] }} */
  let planner;
  /** @type {(() => void) | null} */
  let restoreFetch = null;

  beforeAll(async () => {
    planner = loadPlannerCatalog();
    restoreFetch = installTreeDataFetchMock();
    await initSkillDataStore();
  });

  afterAll(() => {
    restoreFetch?.();
    restoreFetch = null;
  });

  for (const file of files) {
    it(file, () => {
      const problems = auditBuildFile(planner.catalog, file, planner.sets);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
