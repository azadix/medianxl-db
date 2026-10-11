/**

 * @file Tests for item/relic modifier → character-stat bonuses.

 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPinia, setActivePinia } from 'pinia';

import {

  clearItemCharacterStatBonusCaches,

  parseCharacterStatBonusFromModifierLine,

  parseCharacterStatBonusesFromModifierLine,

  recomputePlannerStatsFromItems,

} from '@/items/item-character-stat-bonuses.js';

import {

  createCharacterInstance,

  getCharacterInstance,

  setCharacterInstance,

} from '@/character/planner-instance.js';

import { initSkillDataStore } from '@/shared/skill-data-store.js';

import { useItemsStore } from '@/stores/items.js';

import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/** @type {(() => void) | null} */

let restoreFetch = null;

beforeEach(async () => {

  restoreFetch = installTreeDataFetchMock();

  await initSkillDataStore();

  clearItemCharacterStatBonusCaches();

  setActivePinia(createPinia());

});

afterEach(() => {

  setCharacterInstance(null);

  restoreFetch?.();

  restoreFetch = null;

  clearItemCharacterStatBonusCaches();

});

describe('parseCharacterStatBonusFromModifierLine', () => {

  it('maps common relic flats via labels and aliases', () => {

    expect(parseCharacterStatBonusFromModifierLine('+5% to Cold Spell Damage')).toEqual({

      key: 'cold_spell_damage',

      amount: 5,

    });

    expect(parseCharacterStatBonusFromModifierLine('+100 to Life')).toEqual({

      key: 'life',

      amount: 100,

    });

    expect(parseCharacterStatBonusFromModifierLine('+16 Spell Focus')).toEqual({

      key: 'spell_focus',

      amount: 16,

    });

    expect(parseCharacterStatBonusFromModifierLine('Maximum Mana +8%')).toEqual({

      key: 'maximum_mana',

      amount: 8,

    });

    expect(parseCharacterStatBonusFromModifierLine('4% to Strength')).toEqual({

      key: 'percent_strength',

      amount: 4,

    });

    expect(parseCharacterStatBonusFromModifierLine('+15% to Summon Elemental Resistances')).toEqual({

      key: 'summoned_minion_resistances',

      amount: 15,

    });

  });

  it('expands Elemental Resists onto all elemental resist keys', () => {

    const list = parseCharacterStatBonusesFromModifierLine('Elemental Resists +12%');

    expect(list.map((r) => r.key).sort()).toEqual([

      'cold_resistance',

      'fire_resistance',

      'lightning_resistance',

      'poison_resistance',

    ]);

    expect(list.every((r) => r.amount === 12)).toBe(true);

  });

  it('skips skill grants and procs', () => {

    expect(parseCharacterStatBonusFromModifierLine('+(9 to 19) to Abyss Knight')).toBeNull();

    expect(parseCharacterStatBonusFromModifierLine('+1 to All Skills')).toBeNull();

    expect(

      parseCharacterStatBonusFromModifierLine('2% Chance to cast level 50 Abyss on Death Blow')

    ).toBeNull();

  });

});

describe('recomputePlannerStatsFromItems', () => {

  it('applies enabled relic flats to character.getStat', () => {

    createCharacterInstance('Amazon', 99);

    const ch = getCharacterInstance();

    const before = ch.getStat('cold_spell_damage');

    const store = useItemsStore();

    const relic = {

      id: 'relic:abyss',

      name: 'Relic (Abyss)',

      category: 'relics',

      rarity: 'relic',

      keepInInventory: true,

      reqLevel: 1,

      modifiers: ['+5% to Cold Spell Damage', '+(19 to 29) to Abyss'],

    };

    store.catalog = [relic];

    const ok = store.toggleRelic(relic.id, true);

    expect(ok).toBe(true);

    recomputePlannerStatsFromItems(ch);

    expect(ch.getStat('cold_spell_damage')).toBe(before + 5);

  });

});

