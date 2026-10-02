/**
 * @file Tests for item chance-to-cast proc parsing and indexing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';
import {
  parseProcFromModifierLine,
  flattenModifierLines,
  formatProcItemSourceLabel,
  formatProcSetBonusSourceLabel,
  collectItemProcs,
  getItemProcRows,
  getProcSourcesForSkill,
  groupItemProcRows,
} from '@/items/item-procs.js';

describe('item procs', () => {
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

  it('parses chance, level, skill, and trigger', () => {
    expect(parseProcFromModifierLine('2% Chance to cast level 50 Abyss on Death Blow')).toEqual({
      chance: 2,
      chanceMax: 2,
      chanceLabel: '2',
      level: 50,
      skillName: 'Abyss',
      condition: 'on Death Blow',
    });
  });

  it('prefers when Struck by a Missile over when Struck', () => {
    const parsed = parseProcFromModifierLine(
      '10% Chance to cast level 25 Flametail Shot when Struck by a Missile'
    );
    expect(parsed?.condition).toBe('when Struck by a Missile');
    expect(parsed?.skillName).toBe('Flametail Shot');
  });

  it('strips charm upgrade prefixes', () => {
    const parsed = parseProcFromModifierLine(
      '[Upgrade] 1% Chance to cast level 10 Time Strike on Striking'
    );
    expect(parsed).toMatchObject({
      chance: 1,
      level: 10,
      skillName: 'Time Strike',
      condition: 'on Striking',
    });
  });

  it('skips non-standard chance-to-cast lines', () => {
    expect(parseProcFromModifierLine('Conductivity: Chance to Cast Doubled')).toBeNull();
    expect(parseProcFromModifierLine('+5% to Cold Spell Damage')).toBeNull();
    expect(parseProcFromModifierLine('+(19 to 29) to Abyss')).toBeNull();
  });

  it('flattens oneOf modifier pools', () => {
    expect(
      flattenModifierLines([
        '2% Chance to cast level 50 Abyss on Death Blow',
        { oneOf: ['1% Chance to cast level 7 Time Strike on Striking', '+5 to Strength'] },
      ])
    ).toHaveLength(3);
  });

  it('formats unique, relic, and set-bonus source labels', () => {
    expect(
      formatProcItemSourceLabel({
        name: 'Starkiller',
        uniqueKind: 'tiered',
        baseName: 'Stinger Crossbow',
      })
    ).toBe('TU: Starkiller (Stinger Crossbow)');
    expect(
      formatProcItemSourceLabel({
        name: 'Relic (Abyss)',
        rarity: 'relic',
        category: 'relics',
        id: 'relic:abyss',
      })
    ).toBe('Relic (Abyss)');
    expect(formatProcSetBonusSourceLabel({ name: 'Tundra Walker' }, 'complete')).toBe(
      'Set bonus: Tundra Walker (complete)'
    );
  });

  it('indexes relic, unique, and set-bonus procs by resolved skill id', () => {
    const rows = collectItemProcs(
      [
        {
          id: 'relic:abyss',
          name: 'Relic (Abyss)',
          rarity: 'relic',
          category: 'relics',
          modifiers: [
            '2% Chance to cast level 50 Abyss on Death Blow',
            '+(19 to 29) to Abyss',
          ],
        },
        {
          id: 'u:pantheras-bite:su',
          name: "Panthera's Bite",
          rarity: 'unique',
          uniqueKind: 'su',
          baseType: 'Amazon Spears',
          modifiers: ['5% Chance to cast level 15 Amplify Damage on Striking'],
        },
      ],
      [
        {
          id: 'set:tundra-walker',
          name: 'Tundra Walker',
          bonuses: [
            {
              required: 'complete',
              modifiers: ['4% Chance to cast level 15 Ancients\' Hand on Melee Attack'],
            },
          ],
        },
      ]
    );

    expect(rows.map((r) => r.skillId).sort()).toEqual([
      'abyss',
      'amplify_damage',
      'ancients_hand',
    ].sort());

    const abyss = rows.find((r) => r.skillId === 'abyss');
    expect(abyss).toMatchObject({
      chance: 2,
      level: 50,
      condition: 'on Death Blow',
      sourceKind: 'item',
      itemDefId: 'relic:abyss',
      sourceLabel: 'Relic (Abyss)',
      sourceRarity: 'relic',
    });

    const setRow = rows.find((r) => r.sourceKind === 'setBonus');
    expect(setRow).toMatchObject({
      skillId: 'ancients_hand',
      setId: 'set:tundra-walker',
      setRequired: 'complete',
      sourceLabel: 'Set bonus: Tundra Walker (complete)',
      sourceRarity: 'set',
    });
  });

  it('filters sources for one skill', () => {
    const catalog = [
      {
        id: 'relic:abyss',
        name: 'Relic (Abyss)',
        rarity: 'relic',
        category: 'relics',
        modifiers: ['2% Chance to cast level 50 Abyss on Death Blow'],
      },
      {
        id: 'u:other',
        name: 'Other',
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['5% Chance to cast level 15 Amplify Damage on Striking'],
      },
    ];
    const abyssOnly = getProcSourcesForSkill('abyss', catalog, []);
    expect(abyssOnly).toHaveLength(1);
    expect(abyssOnly[0].skillName).toBe('Abyss');
  });

  it('indexes the 2.14 relic catalog Abyss proc', () => {
    const relics = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../public/items/2_14/relics.json'), 'utf8')
    );
    const rows = collectItemProcs(relics, []);
    const abyss = rows.find((r) => r.skillId === 'abyss');
    expect(abyss).toMatchObject({
      chance: 2,
      level: 50,
      condition: 'on Death Blow',
      sourceKind: 'item',
    });
    expect(rows.length).toBeGreaterThan(10);
  });

  it('groups sources that share skill, chance, level, and condition', () => {
    const catalog = [
      {
        id: 'u:asgardsreia:su',
        name: 'Asgardsreia',
        rarity: 'unique',
        uniqueKind: 'su',
        baseName: 'Spangenhelm (Sacred)',
        modifiers: ['5% Chance to cast level 1 Arrow on Striking'],
      },
      {
        id: 'u:athulua:su',
        name: "Athulua's Blessing",
        rarity: 'unique',
        uniqueKind: 'su',
        baseName: 'Heavy Gloves (Sacred)',
        modifiers: ['3% Chance to cast level 1 Arrow on Striking'],
      },
      {
        id: 'u:bag-of-tricks:su',
        name: 'Bag of Tricks',
        rarity: 'unique',
        uniqueKind: 'su',
        baseName: 'Bolt Quiver',
        modifiers: ['3% Chance to cast level 1 Arrow on Striking'],
      },
    ];
    const grouped = getItemProcRows(catalog, []);
    const threePct = grouped.find((r) => r.skillId === 'arrow' && r.chanceLabel === '3');
    const fivePct = grouped.find((r) => r.skillId === 'arrow' && r.chanceLabel === '5');
    expect(grouped.filter((r) => r.skillId === 'arrow')).toHaveLength(2);
    expect(threePct?.sources.map((s) => s.sourceLabel)).toEqual([
      "SU: Athulua's Blessing (Heavy Gloves (Sacred))",
      'SU: Bag of Tricks (Bolt Quiver)',
    ]);
    expect(fivePct?.sources).toHaveLength(1);
    expect(groupItemProcRows(collectItemProcs(catalog, [])).length).toBe(2);
  });
});
