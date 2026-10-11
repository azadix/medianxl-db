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
  it('includes Funeral Pyre, Pagan Rites, Wychwind, and the other class-skill relics', () => {
    const byId = Object.fromEntries(classSkillRelics.map((row) => [row.def.id, row]));
    expect(byId['relic:funeral-pyre']).toMatchObject({
      className: 'Necromancer',
      amount: 1,
    });
    expect(byId['relic:pagan-rites']).toMatchObject({ className: 'Druid', amount: 1 });
    expect(byId['relic:wychwind']).toMatchObject({ className: 'Assassin', amount: 1 });
    expect(byId['relic:retaliate']).toMatchObject({ className: 'Paladin', amount: 1 });
    expect(byId['relic:takedown']).toMatchObject({ className: 'Amazon', amount: 1 });
    expect(byId['relic:war-cry']).toMatchObject({ className: 'Barbarian', amount: 1 });
    expect(classSkillRelics).toHaveLength(6);
  });

  it('treats unconditional +All Skills relics as live all-skills (not conditional Apple line)', () => {
    const ids = allSkillRelics.map((row) => row.def.id).sort();
    expect(ids).toEqual(['relic:dream-eater', 'relic:orb-of-annihilation']);
    expect(allSkillRelics.every((row) => row.amount === 1)).toBe(true);
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
