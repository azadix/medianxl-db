/**

 * @file Tests for item/relic modifier → character-stat bonuses.

 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPinia, setActivePinia } from 'pinia';

import {

  clearItemCharacterStatBonusCaches,

  classifyCharacterStatModifierLine,

  getPlannerUnknownItemStatModifiers,

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

  it('maps common item-text aliases that diverge from character_stats labels', () => {
    expect(parseCharacterStatBonusFromModifierLine('Activation Frequency +6%')).toEqual({
      key: 'activation_frequency',
      amount: 6,
    });
    expect(parseCharacterStatBonusFromModifierLine('Activation Frequency 20%')).toEqual({
      key: 'activation_frequency',
      amount: 20,
    });
    expect(parseCharacterStatBonusFromModifierLine('+103 Life Regenerated per Second')).toEqual({
      key: 'life_regenerated_per_second',
      amount: 103,
    });
    expect(parseCharacterStatBonusFromModifierLine('+69% Enhanced Defense')).toEqual({
      key: 'enhanced_defense',
      amount: 69,
    });
    expect(parseCharacterStatBonusFromModifierLine('Physical Resist 5%')).toEqual({
      key: 'physical_resistance',
      amount: 5,
    });
    expect(parseCharacterStatBonusFromModifierLine('Weapon Physical Damage +13%')).toEqual({
      key: 'enhanced_weapon_damage',
      amount: 13,
    });
    expect(parseCharacterStatBonusFromModifierLine('Slow Target 21%')).toEqual({
      key: 'slows_target_by',
      amount: 21,
    });
    expect(parseCharacterStatBonusFromModifierLine('15% Innate Elemental Damage')).toEqual({
      key: 'innate_elemental_damage',
      amount: 15,
    });
    expect(parseCharacterStatBonusFromModifierLine('Poison Length Reduction 50%')).toEqual({
      key: 'poison_length_reduction',
      amount: 50,
    });
    expect(parseCharacterStatBonusFromModifierLine('Maximum Mana -50%')).toEqual({
      key: 'maximum_mana',
      amount: -50,
    });
  });

  it('expands enemy elemental and all-attribute lines', () => {
    const enemy = parseCharacterStatBonusesFromModifierLine('-14% to Enemy Elemental Resistances');
    expect(enemy.map((r) => r.key).sort()).toEqual([
      'enemy_cold_resistance',
      'enemy_fire_resistance',
      'enemy_lightning_resistance',
      'enemy_poison_resistance',
    ]);
    expect(enemy.every((r) => r.amount === 14)).toBe(true);

    const attrs = parseCharacterStatBonusesFromModifierLine('+35 to all Attributes');
    expect(attrs.map((r) => r.key).sort()).toEqual(['dexterity', 'energy', 'strength', 'vitality']);
    expect(attrs.every((r) => r.amount === 35)).toBe(true);
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

  it('classifies unmapped numeric affixes as unknown (labels do not gate counting)', () => {
    expect(classifyCharacterStatModifierLine('Activation Frequency +6%')).toMatchObject({
      kind: 'parsed',
      bonuses: [{ key: 'activation_frequency', amount: 6 }],
    });
    expect(classifyCharacterStatModifierLine('Some Made Up Affix +12%')).toMatchObject({
      kind: 'unknown',
      text: 'Some Made Up Affix +12%',
      bonuses: [],
    });
    expect(classifyCharacterStatModifierLine('+1 to All Skills').kind).toBe('skill');
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

  it('applies only the active weapon set gear flats', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    const before = ch.getStat('life');
    const store = useItemsStore();

    const set1 = {
      id: 'u:wep:set1',
      name: 'Set I Blade',
      category: 'weapons',
      slot: 'arms',
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['+100 to Life'],
    };
    const set2 = {
      id: 'u:wep:set2',
      name: 'Set II Blade',
      category: 'weapons',
      slot: 'arms',
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['+50 to Life'],
    };
    store.catalog = [set1, set2];
    store.equipment.rarm = store.createInstance(set1.id);
    store.equipment.rarm2 = store.createInstance(set2.id);

    store.setWeaponSet(0);
    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('life')).toBe(before + 100);

    store.setWeaponSet(1);
    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('life')).toBe(before + 50);
  });

  it('lists unmapped item affixes under unknown modifiers', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    const store = useItemsStore();
    const ring = {
      id: 'rin',
      name: 'Ring',
      category: 'jewelry',
      slot: 'ring',
      rarity: 'normal',
      reqLevel: 1,
    };
    store.catalog = [ring];
    store.equipment.rrin = store.createInstance(ring.id, null, null, {
      quality: 'rare',
      name: 'Test Ring',
      modifiers: ['Activation Frequency +6%', 'Weird Unknown Affix +9%'],
    });

    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('activation_frequency')).toBe(6);
    const unknown = getPlannerUnknownItemStatModifiers();
    expect(unknown.some((u) => u.text === 'Weird Unknown Affix +9%')).toBe(true);
    expect(unknown.some((u) => /Activation Frequency/i.test(u.text))).toBe(false);
  });

});

