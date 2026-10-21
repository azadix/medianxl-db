import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canUseOilOnItem,
  getOilBonusLines,
  itemHasInnateElemental,
  itemUpgradeSlotType,
  listOilsForItem,
  loadOilsCatalog,
  lookupOil,
  oilIcon,
  oilKindLabel,
  oilSearchText,
} from '@/items/oils.js';

loadOilsCatalog(JSON.parse(readFileSync(resolve('public/items/2_14/oils.json'), 'utf8')));

describe('oils', () => {
  const sword = { name: 'Crystal Sword', category: 'weapons', slot: 'rarm' };
  const uniqueSword = { ...sword, rarity: 'unique' };
  const ring = { name: 'Ring', category: 'jewelry', slot: 'rrin' };

  it('maps slot types', () => {
    expect(itemUpgradeSlotType(sword, 'rarm')).toBe('weapon');
    expect(itemUpgradeSlotType(ring, 'rrin')).toBe('ring');
  });

  it('lists Oil of Luck on magic/unique weapons and hides it on whites', () => {
    const white = { ...sword, rarity: 'normal' };
    const uniqueIds = listOilsForItem(uniqueSword, 'rarm').map((row) => row.id);
    expect(uniqueIds).toContain('oil_weapon_ed');
    expect(listOilsForItem({ ...sword, rarity: 'magic' }, 'rarm').map((row) => row.id)).toContain(
      'oil_weapon_ed'
    );
    expect(listOilsForItem(white, 'rarm').map((row) => row.id)).not.toContain('oil_weapon_ed');
    expect(uniqueIds.some((id) => listOilsForItem(white, 'rarm').every((row) => row.id !== id))).toBe(
      true
    );
  });

  it('does not treat non-elemental innate text as an elemental weapon', () => {
    const uniqueClaw = {
      ...uniqueSword,
      innate: '+1 Lightning Damage per 1% Bonus to Defense',
    };
    expect(itemHasInnateElemental(uniqueClaw)).toBe(false);
    expect(itemUpgradeSlotType(uniqueClaw, 'rarm')).toBe('weapon');
    expect(listOilsForItem(uniqueClaw, 'rarm').map((row) => row.id)).toContain('oil_weapon_ed');
    expect(itemHasInnateElemental({ innate: 'Innate Fire Damage: (80.0% of Strength)' })).toBe(true);
  });

  it('matches Oil of Luck in picker search text', () => {
    const luck = listOilsForItem(uniqueSword, 'rarm').find((row) => row.id === 'oil_weapon_ed');
    expect(oilKindLabel(luck)).toBe('Oil of Luck');
    expect(oilSearchText(luck)).toContain('oil of luck');
  });

  it('uses Oil of Luck and Oil of Conjuration inventory art', () => {
    expect(oilIcon('oil_weapon_ed')).toBe('oil_luck');
    expect(oilIcon('oil_weapon_spelldmg')).toBe('oil_enhancement');
    expect(oilIcon('oil_unique_wep_ar_lvl')).toBe('oil_luck');
    expect(oilIcon('nothing')).toBe('oil_disjunction');
  });

  it('labels conjuration and lottery groups; lottery allows set weapons/armor', () => {
    const spell = listOilsForItem(uniqueSword, 'rarm').find((row) => row.id === 'oil_weapon_spelldmg');
    const lottery = listOilsForItem(uniqueSword, 'rarm').find((row) => row.id === 'oil_unique_wep_ar_lvl');
    const setSword = { ...sword, rarity: 'set' };
    const uniqueArmor = { name: 'Gothic Plate', category: 'armor', slot: 'tors', rarity: 'unique' };
    const setArmor = { ...uniqueArmor, rarity: 'set' };
    const uniqueAmulet = { name: 'Amulet', category: 'jewelry', slot: 'neck', rarity: 'unique' };
    const setAmulet = { ...uniqueAmulet, rarity: 'set' };
    expect(oilKindLabel(spell)).toBe('Oil of Conjuration');
    expect(oilKindLabel(lottery)).toBe('Lottery bonus');
    expect(lookupOil('nothing')?.label).toBe('Nothing');
    expect(listOilsForItem(uniqueSword, 'rarm').map((row) => row.id)).toContain('oil_unique_wep_ar_lvl');
    expect(listOilsForItem(setSword, 'rarm').map((row) => row.id)).toContain('oil_unique_wep_ar_lvl');
    expect(listOilsForItem(uniqueArmor, 'tors').map((row) => row.id)).toContain('oil_unique_armor_life');
    expect(listOilsForItem(setArmor, 'tors').map((row) => row.id)).toContain('oil_unique_armor_life');
    expect(listOilsForItem(uniqueAmulet, 'neck').map((row) => row.id)).toContain('oil_unique_amulet_mr');
    expect(listOilsForItem(setAmulet, 'neck').map((row) => row.id)).toContain('oil_unique_amulet_mr');
    expect(listOilsForItem({ ...ring, rarity: 'set' }, 'rrin').map((row) => row.id)).not.toContain(
      'oil_unique_ring_skills'
    );
  });

  it('returns formatted bonus lines', () => {
    expect(getOilBonusLines('oil_weapon_ed')).toEqual(['+20% Enhanced Damage']);
    expect(getOilBonusLines('oil_armor_dr')).toEqual(['Physical Resist +1%']);
    expect(getOilBonusLines('nothing')).toEqual([]);
  });

  it('rejects honorifics when flagged', () => {
    const oil = listOilsForItem(sword, 'rarm').find((row) => row.notOnHonorifics);
    expect(oil).toBeTruthy();
    expect(
      canUseOilOnItem(oil, { ...sword, rarity: 'honorific', customQuality: 'honorific' }, 'rarm')
    ).toBe(false);
  });
});
