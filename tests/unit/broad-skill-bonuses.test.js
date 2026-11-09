/**
 * @file Live all/class skill bonuses from enabled relics.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { useItemsStore } from '@/stores/items.js';
import { collectLiveBroadSkillBonuses } from '@/items/broad-skill-bonuses.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const relicsCatalog = JSON.parse(
  readFileSync(resolve(ROOT, 'public/items/2_14/relics.json'), 'utf8')
);

/** @type {{ def: object, className: string, amount: number }[]} */
const classSkillRelics = [];
/** @type {{ def: object, amount: number }[]} */
const allSkillRelics = [];

for (const def of relicsCatalog) {
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    const parsed = parseSkillBonusFromModifierLine(mod);
    if (!parsed) continue;
    if (parsed.kind === 'class') {
      classSkillRelics.push({
        def,
        className: String(parsed.className),
        amount: Number(parsed.amount),
      });
    }
    if (parsed.kind === 'all') {
      allSkillRelics.push({ def, amount: Number(parsed.amount) });
    }
  }
}

/** @type {(() => void) | null} */
let restoreFetch = null;

beforeEach(async () => {
  restoreFetch = installTreeDataFetchMock();
  await initSkillDataStore();
  setActivePinia(createPinia());
});

afterEach(() => {
  setCharacterInstance(null);
  restoreFetch?.();
  restoreFetch = null;
});

describe('catalog class/all skill relics', () => {
  it('finds class and all-skills relics in the catalog', () => {
    // Smoke gate: the dynamic it.each cases below are generated from these lists, so an
    // empty catalog would silently remove coverage instead of failing.
    expect(classSkillRelics.length).toBeGreaterThan(0);
    expect(allSkillRelics.length).toBeGreaterThan(0);
  });
});

describe('collectLiveBroadSkillBonuses', () => {
  it.each(classSkillRelics.map((row) => [row.def.id, row.amount, row.className]))(
    '%s adds +%i to %s Skills when enabled',
    (defId, amount, className) => {
      const row = classSkillRelics.find((r) => r.def.id === defId);
      createCharacterInstance(className, 120);
      const store = useItemsStore();
      store.catalog = [row.def];
      store.catalogLoaded = true;
      store.syncViewerClassName(className);
      expect(store.toggleRelic(defId, true)).toBe(true);

      expect(collectLiveBroadSkillBonuses(className, 120)).toEqual({
        all: 0,
        class: amount,
      });
      expect(collectLiveBroadSkillBonuses('Other', 120)).toEqual({ all: 0, class: 0 });
      expect(collectLiveBroadSkillBonuses(className, 50)).toEqual({ all: 0, class: 0 });
    }
  );

  it('uses the item fixed roll for +All Skills, not the catalog template', () => {
    createCharacterInstance('Assassin', 120);
    const store = useItemsStore();
    const def = {
      id: 'u:test:all-skills-armor',
      name: 'Test Armor',
      category: 'armor',
      slot: 'torso',
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['+1 to All Skills'],
    };
    store.catalog = [def];
    store.catalogLoaded = true;
    store.syncViewerClassName('Assassin');
    const instanceId = store.createInstance(def.id);
    store.equipment.tors = instanceId;
    // The game item rolled +2 while the catalog template says +1 (Silks of the Victor).
    store.instances[instanceId].rolls = { 'modFixed:base:m0': 2 };

    expect(collectLiveBroadSkillBonuses('Assassin', 120)).toEqual({ all: 2, class: 0 });
  });

  it.each(allSkillRelics.map((row) => [row.def.id, row.amount]))(
    '%s adds +%i to All Skills when enabled',
    (defId, amount) => {
      const row = allSkillRelics.find((r) => r.def.id === defId);
      createCharacterInstance('Assassin', 120);
      const store = useItemsStore();
      store.catalog = [row.def];
      store.catalogLoaded = true;
      store.syncViewerClassName('Assassin');
      expect(store.toggleRelic(defId, true)).toBe(true);

      expect(collectLiveBroadSkillBonuses('Assassin', 120)).toEqual({
        all: amount,
        class: 0,
      });
    }
  );
});
