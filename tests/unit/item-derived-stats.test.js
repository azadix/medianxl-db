import { describe, expect, it } from 'vitest';
import {
  createCharacterBucket,
  createContribution,
  createSource,
  createStatRegistry,
} from '@/character/bucket/index.js';
import { applyItemDerivedSources } from '@/character/bucket/sources/item-derived.js';
import {
  applyItemSources,
  resolveDerivedRuleConditions,
} from '@/character/bucket/sources/items.js';

/**
 * @param {string[]} keys
 */
function registryFor(keys) {
  return createStatRegistry(keys.map((key) => ({ key })));
}

/**
 * @param {ReturnType<typeof createStatRegistry>} registry
 * @param {Record<string, number>} values
 */
function bucketWith(registry, values) {
  const bucket = createCharacterBucket({ registry });
  const source = createSource({ kind: 'item', id: 'item', label: 'Item' });
  bucket.setSource('items', 'item', {
    contributions: Object.entries(values).map(([stat, value]) =>
      createContribution({ stat, op: 'base', stage: 'pre', value, source })
    ),
    reports: [],
  });
  bucket.commit();
  return bucket;
}

describe('item derived stat conversions', () => {
  it('grants a share of the source stat', () => {
    const registry = registryFor(['lightning_resistance', 'lightning_spell_damage']);
    const bucket = bucketWith(registry, { lightning_resistance: 100 });
    applyItemDerivedSources(bucket, {
      rules: [
        {
          key: 'lightning_spell_damage',
          sourceKey: 'lightning_resistance',
          ratio: 0.2,
          text: '20% of Lightning Resistance Added as Lightning Spell Damage',
          sourceId: 'griffons',
          label: "Griffon's Eye",
        },
      ],
    });
    const snapshot = bucket.commit();
    expect(snapshot.getValue('lightning_spell_damage')).toBe(20);
  });

  it('only contributes when the source stat is present', () => {
    const registry = registryFor(['summoned_minion_damage', 'deadly_strike']);
    const bucket = bucketWith(registry, {});
    const result = applyItemDerivedSources(bucket, {
      rules: [
        {
          key: 'deadly_strike',
          sourceKey: 'summoned_minion_damage',
          ratio: 0.1,
          sourceId: 'crown',
          label: 'Undead Crown',
        },
      ],
    });
    bucket.commit();
    expect(result.applied).toBe(0);
    expect(bucket.getSnapshot().getValue('deadly_strike')).toBe(0);
  });

  it('needs a second pass for chained conversions', () => {
    const registry = registryFor([
      'summoned_minion_life',
      'enhanced_defense',
      'vitality',
    ]);
    const bucket = bucketWith(registry, { summoned_minion_life: 1000 });
    const rules = [
      {
        key: 'enhanced_defense',
        sourceKey: 'summoned_minion_life',
        ratio: 0.65,
        sourceId: 'crown',
        label: 'Undead Crown',
      },
      {
        key: 'vitality',
        sourceKey: 'enhanced_defense',
        ratio: 0.5,
        sourceId: 'arkaines',
        label: "Arkaine's Valor",
      },
    ];
    applyItemDerivedSources(bucket, { rules });
    let snapshot = bucket.commit();
    expect(snapshot.getValue('enhanced_defense')).toBe(650);
    expect(snapshot.getValue('vitality')).toBe(0);

    // The engine re-runs the pass until source stats stop moving.
    applyItemDerivedSources(bucket, { rules });
    snapshot = bucket.commit();
    expect(snapshot.getValue('vitality')).toBe(325);
  });

  it('sums several conversions of the same source', () => {
    const registry = registryFor(['enhanced_defense', 'vitality']);
    const bucket = bucketWith(registry, { enhanced_defense: 300 });
    applyItemDerivedSources(bucket, {
      rules: [
        {
          key: 'vitality',
          sourceKey: 'enhanced_defense',
          ratio: 0.5,
          sourceId: 'arkaines',
          label: "Arkaine's Valor",
        },
      ],
    });
    const snapshot = bucket.commit();
    expect(snapshot.getValue('vitality')).toBe(150);
  });
});
describe('derived rule equipment conditions', () => {
  /** @param {{ shield?: boolean, jewels?: number }} [state] */
  function storeWith({ shield = false, jewels = 0 } = {}) {
    const socketables = Array.from({ length: jewels }, () => ({
      name: 'Jewel',
      type: 'Jewel',
      code: 'jew',
    }));
    return {
      equipment: { head: 'h1', ...(shield ? { larm: 's1' } : {}) },
      instances: { h1: { socketables }, ...(shield ? { s1: {} } : {}) },
      getDefForInstance: (id) => (id === 's1' ? { group: 'Shields' } : { group: 'Helms' }),
      equipmentSlotContributesBonuses: () => true,
    };
  }

  it('drops a shield-only rule without a shield', () => {
    const rules = [
      {
        key: 'damage',
        sourceKey: 'life',
        ratio: 0.02,
        requires: 'shield',
      },
    ];
    expect(resolveDerivedRuleConditions(rules, storeWith())).toEqual([]);
  });

  it('keeps a shield-only rule while a shield is equipped', () => {
    const rules = [
      { key: 'damage', sourceKey: 'life', ratio: 0.02, requires: 'shield' },
    ];
    const out = resolveDerivedRuleConditions(rules, storeWith({ shield: true }));
    expect(out).toHaveLength(1);
    expect(out[0].ratio).toBe(0.02);
  });

  it('multiplies per-jewel rules by the socketed jewel count', () => {
    const rules = [
      {
        key: 'energy',
        sourceKey: 'vitality',
        ratio: 0.01,
        count: 'jewels',
      },
    ];
    expect(resolveDerivedRuleConditions(rules, storeWith({ jewels: 4 }))[0].ratio).toBeCloseTo(
      0.04
    );
    expect(resolveDerivedRuleConditions(rules, storeWith({ jewels: 0 }))).toEqual([]);
  });

  it("counts a doubling item's own jewels twice through the item source", () => {
    const jewel = { name: 'Jewel', type: 'Jewel', code: 'jew' };
    const crown = {
      id: 'jeweled-crown',
      name: 'Jeweled Crown',
      rarity: 'unique',
      category: 'armor',
      type: 'helm',
      group: 'Helms',
      modifiers: [
        '{orange}1% of total Vitality added as Energy for each Jewel in your gear',
        '{grey}(Doubled for Jewels socketed in the Crown itself)',
      ],
    };
    const store = {
      equipment: { head: 'h1' },
      instances: { h1: { socketables: [jewel, jewel] } },
      getDefForInstance: (id) => (id === 'h1' ? crown : null),
      equipmentSlotContributesBonuses: () => true,
      getItemBonusOptionsForInstance: () => ({}),
      getRollsForInstance: () => null,
      catalog: [crown],
      sets: [],
      enabledCharms: {},
      enabledRelics: {},
      activeEquippedDefs: [crown],
    };
    const registry = createStatRegistry([{ key: 'energy' }, { key: 'vitality' }]);
    const bucket = createCharacterBucket({ registry });
    const result = applyItemSources(bucket, {
      itemsStore: store,
      character: { className: 'Amazon', level: 150 },
    });
    expect(result.derived).toHaveLength(1);
    // Two jewels in gear, both socketed in the crown: 2 + 2 = 4.
    expect(result.derived[0]).toMatchObject({ key: 'energy', sourceKey: 'vitality' });
    expect(result.derived[0].ratio).toBeCloseTo(0.04);
  });

  it("adds the item's own jewels when it doubles them", () => {
    const rules = [
      {
        key: 'energy',
        sourceKey: 'vitality',
        ratio: 0.01,
        count: 'jewels',
        ownJewels: 2,
      },
    ];
    // 3 jewels total, 2 of them in the doubling item: 3 + 2 = 5.
    expect(resolveDerivedRuleConditions(rules, storeWith({ jewels: 3 }))[0].ratio).toBeCloseTo(
      0.05
    );
  });
});

  it('sums several sources and caps the converted amount', () => {
    const registry = registryFor(['innate_elemental_damage', 'damage_to_demons', 'damage_to_undead']);
    const bucket = bucketWith(registry, { damage_to_demons: 29, damage_to_undead: 0 });
    applyItemDerivedSources(bucket, {
      rules: [
        {
          key: 'innate_elemental_damage',
          sourceKey: 'damage_to_demons',
          sourceKeys: ['damage_to_demons', 'damage_to_undead'],
          ratio: 0.08,
          cap: 25,
        },
      ],
    });
    bucket.commit();
    expect(bucket.getSnapshot().getValue('innate_elemental_damage')).toBeCloseTo(2.32, 2);

    const capped = registryFor(['innate_elemental_damage', 'damage_to_demons', 'damage_to_undead']);
    const cappedBucket = bucketWith(capped, { damage_to_demons: 1000, damage_to_undead: 1000 });
    applyItemDerivedSources(cappedBucket, {
      rules: [
        {
          key: 'innate_elemental_damage',
          sourceKey: 'damage_to_demons',
          sourceKeys: ['damage_to_demons', 'damage_to_undead'],
          ratio: 0.08,
          cap: 25,
        },
      ],
    });
    cappedBucket.commit();
    expect(cappedBucket.getSnapshot().getValue('innate_elemental_damage')).toBe(25);
  });
