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

  getPlannerStatItemModifiers,

} from '@/items/item-character-stat-bonuses.js';

import {

  createCharacterInstance,

  getCharacterInstance,

  setCharacterInstance,

} from '@/character/planner-instance.js';

import { initSkillDataStore } from '@/shared/skill-data-store.js';

import { useItemsStore } from '@/stores/items.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { setPlannerAutoMatchHighestStatRequirements } from '@/planner/planner-options.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadMysticOrbsCatalog(
  JSON.parse(readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8'))
);

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

    const allEnemy = parseCharacterStatBonusesFromModifierLine('-5% to All Enemy Resistances');
    expect(allEnemy.map((r) => r.key).sort()).toEqual([
      'enemy_cold_resistance',
      'enemy_fire_resistance',
      'enemy_lightning_resistance',
      'enemy_poison_resistance',
    ]);
    expect(allEnemy.every((r) => r.amount === 5)).toBe(true);

    const attrs = parseCharacterStatBonusesFromModifierLine('+35 to all Attributes');
    expect(attrs.map((r) => r.key).sort()).toEqual(['dexterity', 'energy', 'strength', 'vitality']);
    expect(attrs.every((r) => r.amount === 35)).toBe(true);

    const attrsNoTo = parseCharacterStatBonusesFromModifierLine('+20 All Attributes');
    expect(attrsNoTo.map((r) => r.key).sort()).toEqual(['dexterity', 'energy', 'strength', 'vitality']);
    expect(attrsNoTo.every((r) => r.amount === 20)).toBe(true);
  });

  it('stores enemy pierce as a positive magnitude', () => {
    expect(parseCharacterStatBonusFromModifierLine('-5% to Enemy Fire Resistance')).toEqual({
      key: 'enemy_fire_resistance',
      amount: 5,
    });
    expect(parseCharacterStatBonusFromModifierLine('-5% to Enemy Lightning Resistance')).toEqual({
      key: 'enemy_lightning_resistance',
      amount: 5,
    });
  });

  it('maps vendor prices onto the misc planner stat', () => {
    expect(parseCharacterStatBonusFromModifierLine('-5% to All Vendor Prices')).toEqual({
      key: 'all_vendor_prices',
      amount: -5,
    });
    expect(parseCharacterStatBonusFromModifierLine('10% to All Vendor Prices')).toEqual({
      key: 'all_vendor_prices',
      amount: 10,
    });
    expect(classifyCharacterStatModifierLine('-5% to All Vendor Prices').kind).toBe('parsed');
  });

  it('scales Paragon Hammer mods per character level above a threshold', () => {
    const opts = { characterLevel: 150 };
    const attrs = classifyCharacterStatModifierLine(
      '+2 to All Attributes per Character Level above 130',
      opts
    );
    expect(attrs.kind).toBe('parsed');
    expect(attrs.bonuses.find((b) => b.key === 'dexterity')?.amount).toBe(40);

    expect(
      classifyCharacterStatModifierLine('+3% to Magic Find per Character Level above 130', opts)
        .bonuses
    ).toEqual([{ key: 'magic_find', amount: 60 }]);

    const minion = classifyCharacterStatModifierLine(
      '+2% to Summoned Minion Resistances per Character Level above 130',
      opts
    );
    expect(minion.bonuses).toEqual([{ key: 'summoned_minion_resistances', amount: 40 }]);

    const resists = classifyCharacterStatModifierLine(
      '+3% to Elemental Resists per Character Level above 130',
      opts
    );
    expect(resists.bonuses.find((b) => b.key === 'fire_resistance')?.amount).toBe(60);

    expect(
      classifyCharacterStatModifierLine('+1% Maximum Mana per Character Level above 130', opts)
        .bonuses
    ).toEqual([{ key: 'maximum_mana', amount: 20 }]);

    expect(
      classifyCharacterStatModifierLine('Regenerate mana +2% per Character Level above 130', opts)
        .bonuses
    ).toEqual([{ key: 'regenerate_mana', amount: 40 }]);

    expect(
      classifyCharacterStatModifierLine('Maximum Elemental Resists +1%').bonuses.find(
        (b) => b.key === 'maximum_fire_resistance'
      )?.amount
    ).toBe(1);

    const below = classifyCharacterStatModifierLine(
      '+2 to All Attributes per Character Level above 130',
      { characterLevel: 120 }
    );
    expect(below.kind).toBe('parsed');
    expect(below.bonuses).toEqual([]);
  });

  it('expands combat speeds, spell damage, life/mana, and related charm aliases', () => {
    const speeds = parseCharacterStatBonusesFromModifierLine('10% Combat Speeds');
    expect(speeds.map((r) => r.key).sort()).toEqual([
      'attack_speed',
      'block_speed',
      'cast_speed',
      'hit_recovery',
    ]);
    expect(speeds.every((r) => r.amount === 10)).toBe(true);

    expect(parseCharacterStatBonusFromModifierLine('Maximum Block Chance +10%')).toEqual({
      key: 'max_block_chance',
      amount: 10,
    });

    expect(parseCharacterStatBonusFromModifierLine('-5 Physical damage taken')).toEqual({
      key: 'physical_damage_taken_reduced',
      amount: 5,
    });

    const spell = parseCharacterStatBonusesFromModifierLine('+14% to Spell Damage');
    expect(spell.map((r) => r.key).sort()).toEqual([
      'cold_spell_damage',
      'fire_spell_damage',
      'lightning_spell_damage',
      'physical_magic_spell_damage',
      'poison_spell_damage',
    ]);
    expect(spell.every((r) => r.amount === 14)).toBe(true);

    const pctAttrs = parseCharacterStatBonusesFromModifierLine('10% All Attributes');
    expect(pctAttrs.map((r) => r.key).sort()).toEqual([
      'percent_dexterity',
      'percent_energy',
      'percent_strength',
      'percent_vitality',
    ]);
    expect(pctAttrs.every((r) => r.amount === 10)).toBe(true);

    const lifeMana = parseCharacterStatBonusesFromModifierLine('Maximum Life and Mana +2%');
    expect(lifeMana.map((r) => r.key).sort()).toEqual(['maximum_life', 'maximum_mana']);
    expect(lifeMana.every((r) => r.amount === 2)).toBe(true);
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

  it('applies mystic orb and socket bonuses from equipped gear', () => {
    createCharacterInstance('Amazon', 150);
    const ch = getCharacterInstance();
    const beforeIas = ch.getStat('attack_speed');
    const store = useItemsStore();
    const saber = {
      id: 'u:alnair:su',
      name: 'Alnair',
      type: 'swor',
      category: 'weapons',
      slot: 'arms',
      rarity: 'unique',
      uniqueKind: 'su',
      reqLevel: 100,
      modifiers: ['+200% Enhanced Damage'],
    };
    store.catalog = [saber];
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(saber.id)).toBe(true);
    const id = store.equipment.rarm;
    expect(store.updateInstanceMysticOrbs(id, [[1, 'MO - Attack Speed']])).toBe(true);
    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('attack_speed')).toBe(beforeIas + 6);
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

  it('merges duplicate enemy pierce from the same item and treats sunstone-style lines as pierce', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    const store = useItemsStore();
    const vial = {
      id: 'ebx',
      name: 'Vial of Elder Blood',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['-5% to Enemy Elemental Resistances'],
      upgrades: [
        {
          label: 'Champion of Sanctuary',
          affixes: ['-5% to Enemy Elemental Resistances'],
        },
      ],
    };
    const sunstone = {
      id: 'twi',
      name: 'Sunstone of the Twin Seas',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['-5% to Enemy Fire Resistance'],
    };
    store.catalog = [vial, sunstone];
    expect(store.toggleCharm(vial.id, true, { charmUpgrade0: 1 })).toBe(true);
    expect(store.toggleCharm(sunstone.id, true)).toBe(true);

    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('enemy_fire_resistance')).toBe(15);
    const fireMods = getPlannerStatItemModifiers('enemy_fire_resistance');
    expect(fireMods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceLabel: 'Vial of Elder Blood', value: 10 }),
        expect.objectContaining({ sourceLabel: 'Sunstone of the Twin Seas', value: 5 }),
      ])
    );
    expect(fireMods.filter((m) => m.sourceLabel === 'Vial of Elder Blood')).toHaveLength(1);
  });

  it('applies percent to Strength on getStat and inverts setStat', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    ch.setRawStat('strength', 100);
    const store = useItemsStore();
    const helm = {
      id: 'u:pct-str:tu',
      name: 'Pct Helm',
      category: 'armor',
      slot: 'head',
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['+10% to Strength'],
    };
    store.catalog = [helm];
    store.equipment.head = store.createInstance(helm.id);
    recomputePlannerStatsFromItems(ch);
    expect(ch.getStat('strength')).toBe(110);
    expect(ch.getRawStat('strength')).toBe(100);
    ch.setStat('strength', 110);
    expect(ch.getRawStat('strength')).toBe(100);
    expect(ch.getStat('strength')).toBe(110);
  });

  it('meets TSW gear reqs after applying item flats and percent', () => {
    setPlannerAutoMatchHighestStatRequirements(false);
    createCharacterInstance('Assassin', 150);
    const ch = getCharacterInstance();
    const store = useItemsStore();
    const armor = {
      id: 'u:nat-pct:sssu',
      name: "Natalya's Deception",
      category: 'armor',
      slot: 'tors',
      rarity: 'unique',
      reqLevel: 1,
      reqStr: 1400,
      modifiers: ['+50% to Strength', '+100 to Strength'],
    };
    store.catalog = [armor];
    store.catalogLoaded = true;
    store.fromSnapshot({ equipment: { tors: { defId: armor.id } } });
    ch.parseStatsFromText('{{strength}}=1000');
    recomputePlannerStatsFromItems(ch);
    expect(ch.getRawStat('strength')).toBe(1000);
    expect(ch.getStat('strength')).toBe(1650);
    expect(store.equipmentSlotMeetsRequirements('tors')).toBe(true);
    expect(store.listUnmetEquippedItems()).toEqual([]);
    setPlannerAutoMatchHighestStatRequirements(true);
  });

});

