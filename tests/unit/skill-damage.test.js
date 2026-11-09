import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
} from '@/shared/skill-data-store.js';
import { createCharacterInstance } from '@/character/planner-instance.js';
import { collectPlannerDamageSkills } from '@/character/planner-damage.js';
import {
  applyDamageMitigation,
  collectSkillDamage,
  physicalCritMultiplier,
} from '@/skills/domain/skill-damage.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const CHARACTER_STATE = { blvl: {}, lvl: {}, stats: {} };
const LEVEL = 20;
const CHAR_LEVEL = 150;

/** @param {object} store @param {string} id */
function skillRow(store, id) {
  const row = store.catalogByInternalId.get(id);
  if (!row) throw new Error(`missing skill ${id}`);
  return row;
}

/** @param {object} store @param {string} id */
function damageFor(store, id, level = LEVEL, stats = {}) {
  return collectSkillDamage({
    row: skillRow(store, id),
    level,
    characterState: { ...CHARACTER_STATE, stats },
    characterLevel: CHAR_LEVEL,
  });
}

describe('skill damage', () => {
  let restoreFetch;
  let store;

  beforeAll(async () => {
    setActivePinia(createPinia());
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
    store = getFileSkillStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('collects elemental damage as a min-max band', () => {
    const damage = damageFor(store, 'annihilation');
    const fire = damage.components.find((c) => c.key === 'fire_damage');
    expect(fire).toBeTruthy();
    expect(fire.min).toBeGreaterThan(0);
    expect(fire.min).toBeLessThanOrEqual(fire.max);
    expect(damage.totalMin).toBe(fire.min);
    expect(damage.totalMax).toBe(fire.max);
  });

  it('scales damage with skill level', () => {
    const low = damageFor(store, 'annihilation', 10);
    const high = damageFor(store, 'annihilation', 30);
    expect(high.totalMax).toBeGreaterThan(low.totalMax);
  });

  it('reports weapon damage percent for attack skills', () => {
    expect(damageFor(store, 'carnage').weaponDamagePercent).toBe(145);
  });

  it('sums multiple damage types into the per-hit total', () => {
    const damage = damageFor(store, 'beacon');
    const types = damage.components.map((c) => c.key);
    expect(types).toContain('physical_damage');
    expect(types).toContain('fire_damage');
    const expectedMax = damage.components
      .filter((c) => !c.dot)
      .reduce((sum, c) => sum + c.max, 0);
    expect(damage.totalMax).toBe(expectedMax);
  });

  it('keeps damage-over-time out of the per-hit total', () => {
    const row = store.catalog.find(
      (entry) =>
        (entry.scalingConstants || []).some((sc) => sc.statKey === 'poison_dot') &&
        !(entry.scalingConstants || []).some((sc) => sc.statKey === 'physical_damage')
    );
    expect(row).toBeTruthy();
    const damage = collectSkillDamage({
      row,
      level: LEVEL,
      characterState: CHARACTER_STATE,
      characterLevel: CHAR_LEVEL,
    });
    const poison = damage.components.find((c) => c.dot);
    expect(poison).toBeTruthy();
    expect(damage.totalMax).toBe(0);
  });

  it('applies spell damage % from character stats', () => {
    const base = damageFor(store, 'annihilation', LEVEL, {});
    const boosted = damageFor(store, 'annihilation', LEVEL, { fire_spell_damage: 100 });
    expect(boosted.totalMax).toBeGreaterThan(base.totalMax * 1.5);
  });

  it('summarises the allocated damage skills of a character', () => {
    const row = skillRow(store, 'annihilation');
    const character = createCharacterInstance(row.class || 'Paladin', 150);
    character.setAllSkillPoints({ annihilation: 20 });
    // Annihilation is a toggleable buff: it only contributes while enabled.
    character.setEnabledSkillIds(['annihilation']);
    const rows = collectPlannerDamageSkills({ character, store, effectiveLevel: 150 });
    const summary = rows.find((entry) => entry.id === 'annihilation');
    expect(summary).toBeTruthy();
    expect(summary.level).toBe(20);
    expect(summary.totalMax).toBeGreaterThan(0);
    expect(summary.components.some((c) => c.key === 'fire_damage')).toBe(true);
    expect(rows.every((entry) => entry.level > 0)).toBe(true);
  });
});

describe('damage mitigation', () => {
  const fire = {
    key: 'fire_damage',
    label: 'Fire',
    type: 'fire',
    dot: false,
    min: 1000,
    max: 1000,
    durationFrames: null,
  };
  const physical = {
    key: 'physical_damage',
    label: 'Physical',
    type: 'physical',
    dot: false,
    min: 1000,
    max: 1000,
    durationFrames: null,
  };

  it('crit and deadly strike are independent rolls', () => {
    expect(physicalCritMultiplier({})).toBe(1);
    expect(physicalCritMultiplier({ critical_strike: 50, deadly_strike: 50 })).toBeCloseTo(1.75);
    expect(physicalCritMultiplier({ deadly_strike: 100 })).toBeCloseTo(2);
    // Over-100% inputs are clamped, not compounded.
    expect(physicalCritMultiplier({ deadly_strike: 400 })).toBeCloseTo(2);
    // Barbarians use a separate crit stat; it is an independent roll too.
    expect(physicalCritMultiplier({ critical_strike_for_barbarian: 100 })).toBeCloseTo(2);
  });

  it('subtracts our pierce from the enemy resistance', () => {
    const [row] = applyDamageMitigation([fire], {
      stats: { enemy_fire_resistance: 25 },
      baseEnemyResistPct: 50,
    });
    expect(row.resistPct).toBe(25);
    expect(row.effectiveMax).toBeCloseTo(750);
  });

  it('applies critical strikes to physical damage only', () => {
    const [phys, elem] = applyDamageMitigation([physical, fire], {
      stats: { critical_strike: 50, deadly_strike: 50 },
      baseEnemyResistPct: 0,
    });
    expect(phys.effectiveMax).toBeCloseTo(1750);
    expect(elem.effectiveMax).toBeCloseTo(1000);
  });

  it('never produces negative damage at 100% resistance', () => {
    const [row] = applyDamageMitigation([fire], { baseEnemyResistPct: 120 });
    expect(row.effectiveMax).toBe(0);
  });
});
