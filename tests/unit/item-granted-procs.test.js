/**
 * @file Tests for planner proc chance grouping.
 */
import { describe, expect, it } from 'vitest';
import { groupPlannerProcRows } from '@/items/item-granted-procs.js';

describe('groupPlannerProcRows', () => {
  it('sums chance for the same skill, level, and condition', () => {
    const grouped = groupPlannerProcRows([
      {
        skillId: 'arrow',
        skillName: 'arrow',
        displayName: 'Arrow',
        skillImage: null,
        skillClass: '',
        level: 1,
        condition: 'on Striking',
        chance: 5,
        chanceMax: 5,
        chanceLabel: '5',
        sources: [
          {
            sourceLabel: 'Athulua',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 5,
            chanceMax: 5,
          },
        ],
      },
      {
        skillId: 'arrow',
        skillName: 'arrow',
        displayName: 'Arrow',
        skillImage: null,
        skillClass: '',
        level: 1,
        condition: 'on Striking',
        chance: 3,
        chanceMax: 3,
        chanceLabel: '3',
        sources: [
          {
            sourceLabel: 'Bag of Tricks',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 3,
            chanceMax: 3,
          },
        ],
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].chance).toBe(8);
    expect(grouped[0].chanceMax).toBe(8);
    expect(grouped[0].chanceLabel).toBe('8');
    expect(grouped[0].sources).toHaveLength(2);
  });

  it('keeps different levels or triggers as separate rows', () => {
    const grouped = groupPlannerProcRows([
      {
        skillId: 'arrow',
        skillName: 'arrow',
        displayName: 'Arrow',
        skillImage: null,
        skillClass: '',
        level: 1,
        condition: 'on Striking',
        chance: 5,
        chanceMax: 5,
        chanceLabel: '5',
        sources: [
          {
            sourceLabel: 'A',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 5,
            chanceMax: 5,
          },
        ],
      },
      {
        skillId: 'arrow',
        skillName: 'arrow',
        displayName: 'Arrow',
        skillImage: null,
        skillClass: '',
        level: 6,
        condition: 'on Striking',
        chance: 17,
        chanceMax: 17,
        chanceLabel: '17',
        sources: [
          {
            sourceLabel: 'B',
            sourceKind: 'item',
            sourceRarity: 'set',
            chance: 17,
            chanceMax: 17,
          },
        ],
      },
      {
        skillId: 'arrow',
        skillName: 'arrow',
        displayName: 'Arrow',
        skillImage: null,
        skillClass: '',
        level: 1,
        condition: 'on Kill',
        chance: 4,
        chanceMax: 4,
        chanceLabel: '4',
        sources: [
          {
            sourceLabel: 'C',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 4,
            chanceMax: 4,
          },
        ],
      },
    ]);

    expect(grouped).toHaveLength(3);
    expect(grouped.map((r) => `${r.level}|${r.condition}|${r.chance}`).sort()).toEqual([
      '1|on Kill|4',
      '1|on Striking|5',
      '6|on Striking|17',
    ]);
  });

  it('sums chance ranges independently for min and max', () => {
    const grouped = groupPlannerProcRows([
      {
        skillId: 'bloodlust',
        skillName: 'bloodlust',
        displayName: 'Bloodlust',
        skillImage: null,
        skillClass: '',
        level: 9,
        condition: 'on Kill',
        chance: 3,
        chanceMax: 5,
        chanceLabel: '3-5',
        sources: [
          {
            sourceLabel: 'A',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 3,
            chanceMax: 5,
          },
        ],
      },
      {
        skillId: 'bloodlust',
        skillName: 'bloodlust',
        displayName: 'Bloodlust',
        skillImage: null,
        skillClass: '',
        level: 9,
        condition: 'on Kill',
        chance: 2,
        chanceMax: 4,
        chanceLabel: '2-4',
        sources: [
          {
            sourceLabel: 'B',
            sourceKind: 'item',
            sourceRarity: 'unique',
            chance: 2,
            chanceMax: 4,
          },
        ],
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].chance).toBe(5);
    expect(grouped[0].chanceMax).toBe(9);
    expect(grouped[0].chanceLabel).toBe('5-9');
  });
});
