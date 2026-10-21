import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canUseOilOnItem,
  getOilBonusLines,
  itemUpgradeSlotType,
  listOilsForItem,
  loadOilsCatalog,
  oilIcon,
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

  it('lists weapon oils and unique-only oils', () => {
    const weaponOils = listOilsForItem(sword, 'rarm').map((row) => row.id);
    expect(weaponOils).toContain('oil_weapon_ed');
    const uniqueIds = listOilsForItem(uniqueSword, 'rarm').map((row) => row.id);
    expect(uniqueIds.some((id) => listOilsForItem(sword, 'rarm').every((row) => row.id !== id))).toBe(
      true
    );
  });

  it('uses Oil of Luck and Oil of Enhancement inventory art', () => {
    expect(oilIcon('oil_weapon_ed')).toBe('oil_luck');
    expect(oilIcon('oil_weapon_spelldmg')).toBe('oil_enhancement');
    expect(oilIcon('oil_unique_wep_ar_lvl')).toBe('oil_luck');
    expect(oilIcon('nothing')).toBe('oil_disjunction');
  });

  it('returns formatted bonus lines', () => {
    expect(getOilBonusLines('oil_weapon_ed')).toEqual(['+20% Enhanced Damage']);
    expect(getOilBonusLines('oil_armor_dr')).toEqual(['Damage Reduced by 1%']);
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
