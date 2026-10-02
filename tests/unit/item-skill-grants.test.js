/**
 * @file Tests for item "+X to Skill" grant parsing and indexing.
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
  parseSkillGrantFromModifierLine,
  collectItemSkillGrants,
  getSkillGrantSourcesForSkill,
} from '@/items/item-skill-grants.js';

describe('item skill grants', () => {
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

  it('parses fixed and ranged named skill grants', () => {
    expect(parseSkillGrantFromModifierLine('+1 to ATMG Sentry')).toEqual({
      amount: 1,
      amountMax: 1,
      amountLabel: '+1',
      skillName: 'ATMG Sentry',
      classOnly: false,
      className: '',
    });
    expect(parseSkillGrantFromModifierLine('+(19 to 29) to Abyss')).toMatchObject({
      amount: 19,
      amountMax: 29,
      amountLabel: '+(19 to 29)',
      skillName: 'Abyss',
      classOnly: false,
    });
  });

  it('parses class-only grants', () => {
    expect(parseSkillGrantFromModifierLine('+10 to Flamefront (Sorceress Only)')).toEqual({
      amount: 10,
      amountMax: 10,
      amountLabel: '+10',
      skillName: 'Flamefront',
      classOnly: true,
      className: 'Sorceress',
    });
  });

  it('strips charm prefixes', () => {
    expect(parseSkillGrantFromModifierLine('[Upgrade] +1 to Time Warp')).toMatchObject({
      amount: 1,
      skillName: 'Time Warp',
    });
  });

  it('skips all-skills and class skill levels', () => {
    expect(parseSkillGrantFromModifierLine('+1 to All Skills')).toBeNull();
    expect(parseSkillGrantFromModifierLine('+2 to Paladin Skill Levels')).toBeNull();
  });

  it('indexes relic grants and skips unresolved names', () => {
    const rows = collectItemSkillGrants(
      [
        {
          id: 'relic:abyss',
          name: 'Relic (Abyss)',
          rarity: 'relic',
          category: 'relics',
          modifiers: ['+(19 to 29) to Abyss', '+100 to Life'],
        },
        {
          id: 'relic:flamefront',
          name: 'Relic (Flamefront)',
          rarity: 'relic',
          category: 'relics',
          modifiers: ['+10 to Flamefront (Sorceress Only)'],
        },
      ],
      [
        {
          id: 'set:example',
          name: 'Example Set',
          bonuses: [
            {
              required: 'complete',
              modifiers: ['+3 to Teleport'],
            },
          ],
        },
      ]
    );

    const abyss = rows.find((r) => r.skillId === 'abyss');
    expect(abyss).toMatchObject({
      amountLabel: '+(19 to 29)',
      sourceKind: 'item',
      itemDefId: 'relic:abyss',
      restrictionLabel: '',
    });

    const flame = rows.find((r) => r.skillId === 'flamefront');
    expect(flame).toMatchObject({
      amount: 10,
      classOnly: true,
      restrictionLabel: 'Sorceress Only',
    });

    const teleport = rows.find((r) => r.skillId === 'teleport');
    expect(teleport).toMatchObject({
      sourceKind: 'setBonus',
      setId: 'set:example',
      amount: 3,
    });

    expect(rows.some((r) => /life/i.test(r.skillName))).toBe(false);
  });

  it('groups sources that share skill, amount, and restriction', () => {
    const catalog = [
      {
        id: 'u:one:su',
        name: 'First',
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['+3 to Teleport'],
      },
      {
        id: 'u:two:su',
        name: 'Second',
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['+3 to Teleport'],
      },
      {
        id: 'u:three:su',
        name: 'Third',
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['+5 to Teleport'],
      },
    ];
    const grouped = getSkillGrantSourcesForSkill('teleport', catalog, []);
    expect(grouped).toHaveLength(2);
    const three = grouped.find((r) => r.amountLabel === '+3');
    expect(three?.sources.map((s) => s.sourceLabel)).toEqual(['First', 'Second']);
  });

  it('indexes the 2.14 relic catalog Abyss grant', () => {
    const relics = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../public/items/2_14/relics.json'), 'utf8')
    );
    const rows = getSkillGrantSourcesForSkill('abyss', relics, []);
    expect(rows.some((r) => r.amountLabel === '+(19 to 29)')).toBe(true);
  });
});
