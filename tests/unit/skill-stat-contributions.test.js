import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { createStatRegistry } from '@/character/bucket/index.js';
import { buildSkillContributions } from '@/skills/stat-contributions.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('skill stat contributions', () => {
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

  function registry() {
    return createStatRegistry(getPlannerCharacterStatDefs());
  }

  function row(skillId) {
    return getFileSkillStore().catalogByInternalId.get(skillId);
  }

  it('emits a constant skill stat with skill provenance', () => {
    const catalogRow = row('ancestral_endurance');
    expect(catalogRow).toBeTruthy();
    const result = buildSkillContributions({
      row: catalogRow,
      level: 1,
      characterState: { blvl: { ancestral_endurance: 1 }, lvl: {}, stats: {} },
      ulvl: 150,
      registry: registry(),
    });
    const grit = result.contributions.find((entry) => entry.stat === 'grit');
    expect(grit).toBeTruthy();
    expect(grit.value).toBe(20);
    expect(grit.source).toMatchObject({ kind: 'skill', id: 'ancestral_endurance' });
    expect(grit.source.label).toBeTruthy();
  });

  it('evaluates a level-scaling formula', () => {
    const catalogRow = row('baneblade');
    expect(catalogRow).toBeTruthy();
    const result = buildSkillContributions({
      row: catalogRow,
      level: 5,
      characterState: { blvl: { baneblade: 5 }, lvl: {}, stats: {} },
      ulvl: 150,
      registry: registry(),
    });
    const life = result.contributions.find((entry) => entry.stat === 'maximum_life');
    expect(life).toBeTruthy();
    expect(life.value).toBe(5);
  });

  it('keeps known damage stats skill-scoped instead of inventing character stats', () => {
    const catalogRow = row('absolution');
    expect(catalogRow).toBeTruthy();
    const result = buildSkillContributions({
      row: catalogRow,
      level: 20,
      characterState: { blvl: { absolution: 20 }, lvl: {}, stats: {} },
      ulvl: 150,
      registry: registry(),
    });
    expect(result.contributions.some((entry) => entry.stat === 'magic_damage')).toBe(false);
    const scoped = result.reports.find((report) => report.reason === 'skill-scoped');
    expect(scoped).toBeTruthy();
  });

  it('keeps Summon-tagged minion life out of the character pool', () => {
    for (const skillId of ['overlord', 'summon_edyrem']) {
      const catalogRow = row(skillId);
      expect(catalogRow).toBeTruthy();
      const result = buildSkillContributions({
        row: catalogRow,
        level: 20,
        characterState: { blvl: { [skillId]: 20 }, lvl: {}, stats: {} },
        ulvl: 150,
        registry: registry(),
      });
      expect(result.contributions.some((entry) => entry.stat === 'life')).toBe(false);
      expect(result.reports.some((report) => report.reason === 'minion-stat')).toBe(true);
    }
  });

  it('marks an unknown numeric stat as unsupported', () => {
    const catalogRow = {
      id: 'synthetic_skill',
      displayName: 'Synthetic',
      scalingConstants: [{ statKey: 'definitely_not_a_stat', value0: '7' }],
    };
    const skill = {
      id: 'synthetic_skill',
      getScalingValues: () => ({ value0: 7 }),
    };
    const result = buildSkillContributions({
      row: catalogRow,
      level: 1,
      characterState: { blvl: {}, lvl: {}, stats: {} },
      ulvl: 150,
      registry: registry(),
      skill,
    });
    expect(result.contributions).toHaveLength(0);
    expect(result.reports.some((report) => report.reason === 'unknown-stat')).toBe(true);
  });
});
