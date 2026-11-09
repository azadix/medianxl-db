import { describe, expect, it } from 'vitest';
import {
  UNARMED_WEAPON_PROFILE,
  computeWeaponDamage,
  computeWeaponDamageRange,
  getEquippedWeaponProfile,
  getWeaponProfileForDamage,
  parseInnateWeaponDamage,
  parseWeaponDamageDisplay,
} from '@/items/equipped-weapon.js';

/**
 * @param {{ def?: object, instance?: object, catalog?: object[] }} [options]
 */
function storeWith({ def, instance = {}, catalog = [] } = {}) {
  return {
    equipment: { rarm: 'w1' },
    instances: { w1: instance },
    getDefForInstance: (id) => (id === 'w1' ? def : null),
    equipmentSlotContributesBonuses: () => true,
    catalogById: Object.fromEntries(catalog.map((row) => [row.id, row])),
    catalog,
  };
}

describe('equipped weapon profile', () => {
  it('parses simple and ranged damage displays', () => {
    expect(parseWeaponDamageDisplay('41 to 43')).toEqual({ min: 41, max: 43 });
    expect(parseWeaponDamageDisplay('(156 - 206) to (266 - 293)')).toEqual({
      min: 156,
      max: 293,
    });
    expect(parseWeaponDamageDisplay('')).toBeNull();
    expect(parseWeaponDamageDisplay('no numbers here')).toBeNull();
  });

  it('reads a unique weapon display and its attribute bonus', () => {
    const profile = getEquippedWeaponProfile(
      storeWith({
        def: {
          id: 'kv',
          name: 'Killing Vector',
          group: 'Assassin Claws',
          damage1hDisplay: '41 to 43',
          dexDamageBonus: 0.13,
        },
      })
    );
    expect(profile).toMatchObject({
      name: 'Killing Vector',
      twoHanded: false,
      min: 41,
      max: 43,
      dexDamageBonus: 0.13,
    });
  });

  it('falls back to the base item range', () => {
    const base = { id: '14@', damage1h: { min: 12, max: 24 }, strDamageBonus: 0.1 };
    const profile = getEquippedWeaponProfile(
      storeWith({
        def: { id: 'u', name: 'Azurewrath', group: 'Crystal Swords', baseId: '14@' },
        catalog: [base],
      })
    );
    expect(profile).toMatchObject({ min: 12, max: 24, strDamageBonus: 0.1 });
  });

  it('applies the ethereal bonus', () => {
    const profile = getEquippedWeaponProfile(
      storeWith({
        def: { id: 'x', name: 'X', group: 'Swords', damage1hDisplay: '10 to 20' },
        instance: { ethereal: true },
      })
    );
    expect(profile.ethereal).toBe(true);
    expect(profile.min).toBe(12);
    expect(profile.max).toBe(25);
  });

  it('detects two-handed weapons', () => {
    const profile = getEquippedWeaponProfile(
      storeWith({
        def: { id: 'x', name: 'Staff', group: 'Staves', damage2hDisplay: '30 to 60' },
      })
    );
    expect(profile.twoHanded).toBe(true);
    expect(profile).toMatchObject({ min: 30, max: 60 });
  });

  it('returns null without an equipped weapon', () => {
    expect(getEquippedWeaponProfile(null)).toBeNull();
    expect(getEquippedWeaponProfile({ equipment: {}, instances: {} })).toBeNull();
  });

  it('falls back to the unarmed profile for damage', () => {
    expect(getWeaponProfileForDamage({ equipment: {}, instances: {} })).toBe(
      UNARMED_WEAPON_PROFILE
    );
    expect(UNARMED_WEAPON_PROFILE).toMatchObject({ unarmed: true, min: 1, max: 2 });
  });

  it('keeps a zero-base profile for an equipped weapon with no damage data', () => {
    const store = storeWith({
      def: { id: 'mystery', name: 'Mystery Blade', group: 'Swords', category: 'weapons' },
    });
    const profile = getEquippedWeaponProfile(store);
    expect(profile).toMatchObject({ name: 'Mystery Blade', min: 0, max: 0 });
    expect(getWeaponProfileForDamage(store)).toMatchObject({ name: 'Mystery Blade' });
  });

  it('parses innate elemental weapon damage', () => {
    expect(
      parseInnateWeaponDamage('Innate Lightning Damage: (62.0% of Dexterity)')
    ).toEqual([{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }]);
    expect(
      parseInnateWeaponDamage('Innate Lightning Damage: 719 (62.0% of Dexterity)')
    ).toEqual([{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }]);
    expect(parseInnateWeaponDamage('')).toEqual([]);
  });

  it('adds innate elemental damage based on the attribute', () => {
    const hit = computeWeaponDamage(
      {
        min: 0,
        max: 0,
        twoHanded: false,
        strDamageBonus: 0,
        dexDamageBonus: 0,
        innate: [{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }],
      },
      { dexterity: 1160, minimum_lightning_damage: 160, maximum_lightning_damage: 250 }
    );
    // 62% of 1160 dexterity = 719 lightning, added to the 160-250 gear flats.
    expect(hit.elements.lightning).toEqual({ min: 879, max: 969 });
  });

  it('increases the innate conversion by the innate damage bonus', () => {
    const hit = computeWeaponDamage(
      {
        min: 0,
        max: 0,
        innate: [{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }],
      },
      { dexterity: 1160, innate_elemental_damage: 54 },
      { dexterity: 1160 }
    );
    // 62% base × 1.54 = 95.48% of 1,160 → 1,108.
    expect(hit.elements.lightning).toEqual({ min: 1108, max: 1108 });
  });

  it('uses the total attribute for innate damage', () => {
    const hit = computeWeaponDamage(
      {
        min: 0,
        max: 0,
        innate: [{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }],
      },
      { dexterity: 4734 }
    );
    // 62% of the sheet total 4,734 = 2,935.
    expect(hit.elements.lightning).toEqual({ min: 2935, max: 2935 });
  });

  it('deals 0-0 when nothing adds physical damage', () => {
    const hit = computeWeaponDamage({ min: 0, max: 0 }, {});
    expect(hit.physical).toEqual({ min: 0, max: 0 });
    const withFlat = computeWeaponDamage({ min: 0, max: 0 }, { minimum_damage: 6, maximum_damage: 8 });
    expect(withFlat.physical).toEqual({ min: 6, max: 8 });
  });
});

describe('weapon damage range', () => {
  it('applies flats, enhanced damage and attribute bonuses', () => {
    const range = computeWeaponDamageRange(
      { min: 10, max: 20, twoHanded: false, strDamageBonus: 0.14, dexDamageBonus: 0 },
      {
        strength: 100,
        enhanced_damage: 50,
        minimum_1_handed_damage: 5,
        maximum_1_handed_damage: 10,
        damage: 2,
      }
    );
    // (10+5+2) * 1.5 * 1.14 = 29.07 ; (20+10+2) * 1.5 * 1.14 = 54.72
    expect(range.min).toBeCloseTo(29.07);
    expect(range.max).toBeCloseTo(54.72);
  });

  it('splits added elemental damage from the physical range', () => {
    const hit = computeWeaponDamage(
      { min: 41, max: 43, twoHanded: false, strDamageBonus: 0.14, dexDamageBonus: 0 },
      {
        strength: 100,
        enhanced_damage: 100,
        minimum_damage: 5,
        maximum_damage: 10,
        minimum_cold_damage: 160,
        maximum_cold_damage: 250,
        minimum_fire_damage: 3,
        maximum_fire_damage: 4,
      }
    );
    expect(hit.baseMin).toBe(41);
    expect(hit.baseMax).toBe(43);
    expect(hit.flatMin).toBe(5);
    expect(hit.flatMax).toBe(10);
    // (1 + 100% ED) × (1 + 100 × 0.14%) = 2 × 1.14
    expect(hit.factor).toBeCloseTo(2.28);
    expect(hit.physical.min).toBeCloseTo(46 * 2.28);
    expect(hit.physical.max).toBeCloseTo(53 * 2.28);
    expect(hit.elements.cold).toEqual({ min: 160, max: 250 });
    expect(hit.elements.fire).toEqual({ min: 3, max: 4 });
  });

  it('adds Bonus <element> Damage to Weapons to that element', () => {
    const hit = computeWeaponDamage(
      UNARMED_WEAPON_PROFILE,
      {
        bonus_cold_damage_to_weapons: 38,
        minimum_cold_damage: 2,
        maximum_cold_damage: 5,
      }
    );
    expect(hit.elements.cold).toEqual({ min: 40, max: 43 });
  });

  it('uses two-handed flats for two-handed weapons', () => {
    const range = computeWeaponDamageRange(
      { min: 30, max: 60, twoHanded: true, strDamageBonus: 0, dexDamageBonus: 0 },
      { minimum_2_handed_damage: 10, maximum_2_handed_damage: 10, minimum_1_handed_damage: 99 }
    );
    expect(range).toEqual({ min: 40, max: 70 });
  });
});
