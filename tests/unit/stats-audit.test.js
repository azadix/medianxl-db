import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import {
  detectCompleteItemText,
  isCompleteItemText,
  setCompleteItemText,
} from '@/items/item-text-completeness.js';
import { setImportedStatsSource, invalidateCharacterStats } from '@/character/stats-provider.js';
import { refreshCharacterStatsSnapshot } from '@/character/stats-provider.js';
import { parseImportedStatsText } from '@/character/bucket/sources/imports.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { hasBuildFixtures, loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const FIXTURES = new URL('../fixtures/tsw-builds/', import.meta.url);
const SKIP = new Set(['current_life', 'current_mana', 'strength', 'dexterity', 'vitality', 'energy']);
// The full dump corpus is large and each build rebuilds items+skills. Keep the default
// audit bounded; set STATS_AUDIT_ALL=1 to walk every fixture.
const AUDIT_FILES = [
  'METST_Kriek_28_10_2026_17_22.json',
  'Gabriella_30_10_2026_19_01.json',
  'Chickpea_27_10_2026_14_38.json',
  'Arwen.json',
  'Azalea.json',
  'Darkbladez-SSF_28_10_2026_10_28.json',
  'PETUH-XSF.json',
  'Xiaochou.json',
];

describe.skipIf(!hasBuildFixtures())('stats audit (all TSW builds)', () => {
  let restoreFetch;
  let planner;
  let files;

  beforeAll(async () => {
    planner = loadPlannerCatalog();
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
    files = readdirSync(FIXTURES)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort();
    if (process.env.STATS_AUDIT_ALL !== '1') {
      files = files.filter((name) => AUDIT_FILES.includes(name));
    }
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('serves every build without throwing and matches imported totals', () => {
    const errors = [];
    for (const file of files) {
      try {
        const raw = loadBuildFixture(file);
        const { build, tswItems } = unwrapTswOrNativeBuild(raw);
        setActivePinia(createPinia());
        const store = useItemsStore();
        store.catalog = planner.catalog;
        store.sets = planner.sets;
        store.catalogLoaded = true;
        store.catalogVersionFolder = '2_14';
        const character = createCharacterInstance(build.class, Number(build.level) || 150);
        character.setAllSkillPoints(build.skillPoints || {});
        character.setAllOSkills(build.oSkills || []);
        store.syncViewerClassName(build.class);
        setCompleteItemText(detectCompleteItemText(tswItems || []));
        const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
        store.fromSnapshot(snapshot);
        applyClassBaselineStatsToCharacter(build.class);
        setImportedStatsSource(build.stats || '', isCompleteItemText() ? 'base' : 'totals');
        invalidateCharacterStats();
        const stats = refreshCharacterStatsSnapshot();
        if (!stats) throw new Error('no snapshot');

        for (const { key, value } of parseImportedStatsText(build.stats)) {
          if (SKIP.has(key)) continue;
          const actual = Number(stats.imported[key]);
          if (!Number.isFinite(actual) || Math.abs(actual - value) > 1e-9) {
            errors.push(`${file}: ${key} expected import ${value} got ${actual}`);
          }
        }
      } catch (error) {
        errors.push(`${file}: ${error?.message || error}`);
      }
    }
    expect(errors.slice(0, 40)).toEqual([]);
  }, 180000);
});
