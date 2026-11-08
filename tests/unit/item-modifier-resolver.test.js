import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearItemModifierCache,
  getItemModifierCacheStats,
  itemModifierSignature,
  resolveItemModifiers,
  resolveModifierLines,
} from '@/items/item-modifier-resolver.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const DEF = Object.freeze({
  id: 'test-unique',
  name: 'Test Item',
  rarity: 'unique',
  category: 'armor',
  type: 'torso',
  baseName: 'Ancient Armor',
  sockets: 0,
  modifiers: [
    '+40 to Vitality',
    '{orange}Miasma: Haunt Duration Increased by 4 seconds',
    'Nonsense 123',
    'Requirements -20%',
  ],
});

describe('item modifier resolver', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  beforeEach(() => {
    clearItemModifierCache();
  });

  it('stacks socketable attribute lines instead of deduping them', () => {
    const resolved = resolveItemModifiers(
      {
        id: 'sock-test',
        name: 'Sock Test',
        rarity: 'unique',
        category: 'armor',
        type: 'torso',
        modifiers: ['+10 to all Attributes'],
      },
      null,
      {
        socketables: [
          { name: 'Jewel', type: 'Jewel', quality: 'Crafted', modifiers: ['+5 to all Attributes'] },
          { name: 'Jewel', type: 'Jewel', quality: 'Crafted', modifiers: ['+5 to all Attributes'] },
        ],
      },
      { sourceId: 'sock-test', label: 'Sock Test', characterLevel: 150 }
    );
    const strengthRows = resolved.contributions.filter((row) => row.stat === 'strength');
    expect(strengthRows.map((row) => row.value)).toEqual([20]);
  });

  it('treats orange prose as flavor and Ethereal as supported', () => {
    const resolved = resolveModifierLines(
      [
        '{orange}He who fights with monsters',
        '{orange}might take care lest he',
        '{orange}thereby become a monster',
        '{orange}And if you gaze for long into an abyss',
        '{orange}the abyss gazes also into you',
        '{orange}- I can afford this because I am wealthy and powerful.',
        '{grey}Ethereal',
      ],
      { sourceId: 'essence', label: 'Essence of Time', characterLevel: 150 }
    );
    expect(resolved.reports.filter((r) => r.status === 'flavor')).toHaveLength(6);
    expect(resolved.reports.filter((r) => r.status === 'supported')).toHaveLength(1);
    expect(resolved.reports.filter((r) => r.status === 'unsupported')).toHaveLength(0);
    expect(resolved.uniqueMods).toHaveLength(0);
  });

  it('classifies supported, unique, unknown and ignored lines', () => {
    const resolved = resolveItemModifiers(DEF, null, {}, {
      sourceId: 'test',
      label: 'Test Item',
      slot: 'tors',
      characterLevel: 150,
    });

    expect(resolved.contributions).toHaveLength(1);
    expect(resolved.contributions[0]).toMatchObject({
      stat: 'vitality',
      value: 40,
      op: 'base',
      stage: 'pre',
    });
    expect(resolved.contributions[0].source).toMatchObject({
      kind: 'item',
      id: 'test',
      label: 'Test Item',
      slot: 'tors',
    });

    expect(resolved.uniqueMods).toHaveLength(1);
    expect(resolved.uniqueMods[0]).toMatchObject({
      status: 'unsupported',
      reason: 'unique-mechanic',
      unique: true,
    });

    const reasons = resolved.reports.map((report) => report.reason);
    expect(reasons).toContain('unknown-stat');
    expect(reasons).toContain('non-stat');
  });

  it('caches by def, rolls, options and context', () => {
    const context = { sourceId: 'test', label: 'Test Item', slot: 'tors' };
    const first = resolveItemModifiers(DEF, null, {}, context);
    const second = resolveItemModifiers(DEF, null, {}, context);
    expect(second.signature).toBe(first.signature);
    expect(getItemModifierCacheStats().size).toBe(1);

    const rolled = resolveItemModifiers(DEF, { sockets: 2 }, {}, context);
    expect(rolled.signature).not.toBe(first.signature);
    expect(getItemModifierCacheStats().size).toBe(2);
  });

  it('includes the source context in the signature', () => {
    const a = itemModifierSignature(DEF, null, {}, { sourceId: 'a', label: 'A' });
    const b = itemModifierSignature(DEF, null, {}, { sourceId: 'b', label: 'B' });
    expect(a).not.toBe(b);
  });

  it('resolves set-bonus lines with a set source', () => {
    const resolved = resolveModifierLines(['+15 to Strength', '{orange}Set secret'], {
      sourceKind: 'set',
      sourceId: 'set:1:2',
      label: 'Test Set (2 Items)',
      characterLevel: 150,
    });
    expect(resolved.contributions).toHaveLength(1);
    expect(resolved.contributions[0]).toMatchObject({ stat: 'strength', value: 15 });
    expect(resolved.contributions[0].source.kind).toBe('set');
    expect(resolved.uniqueMods).toHaveLength(1);
  });

  it('marks lore and crafting instructions as flavor text', () => {
    const resolved = resolveModifierLines(
      [
        'Cube after Killing Imperius and Malthael',
        'Level 133',
        'Transmute: Paragon\u0027s Hammer + Heavenly Soul = Library of Fate scroll',
        'This item was forged in the fires of Kehjistan.',
      ],
      { sourceId: 'lore', label: 'Lore Item', characterLevel: 150 }
    );
    expect(resolved.contributions).toHaveLength(0);
    expect(resolved.uniqueMods).toHaveLength(0);
    expect(resolved.reports.filter((report) => report.status === 'flavor')).toHaveLength(4);
  });
});
