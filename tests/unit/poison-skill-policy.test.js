/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { buildSkillContributions } from '@/skills/stat-contributions.js';
import { collectSkillDamage } from '@/skills/domain/skill-damage.js';
import { createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import {
  buildFixedLevelSkillTooltipHtml,
  resetFixedLevelSkillTooltipCacheForTests,
} from '@/skills/fixed-level-skill-tooltip.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * Poison damage scaling is hidden for now because stacking/duration is not modelled;
 * Amatoxin is the only skill whose poison damage is kept.
 */
describe('poison damage policy', () => {
  let restoreFetch;
  let registry;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
    registry = createStatRegistry(getPlannerCharacterStatDefs());
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  /**
   * @param {string} id
   * @param {number} level
   */
  function contributionsFor(id, level) {
    const row = getFileSkillStore().catalogByInternalId.get(id);
    return buildSkillContributions({
      row,
      level,
      characterState: { blvl: {}, lvl: {}, stats: {} },
      ulvl: 150,
      registry,
      sourceId: row.id,
      label: row.displayName,
    });
  }

  it('drops poison damage scaling for regular skills', () => {
    const result = contributionsFor('black_lotus_strike', 20);
    expect(result.contributions.some((c) => c.stat === 'poison_dot')).toBe(false);
    expect(result.reports.some((r) => r.stat === 'poison_dot')).toBe(true);
  });

  it('keeps Amatoxin poison damage scaling', () => {
    // poison_dot is not a character stat, so it never becomes a bucket contribution;
    // the policy must simply not drop it as unmodelled.
    const result = contributionsFor('amatoxin', 20);
    expect(
      result.reports.some(
        (r) => r.stat === 'poison_dot' && r.reason === 'poison-damage-not-modelled'
      )
    ).toBe(false);

    const row = getFileSkillStore().catalogByInternalId.get('amatoxin');
    const damage = collectSkillDamage({
      row,
      level: 20,
      characterState: { blvl: {}, lvl: {}, stats: {} },
      characterLevel: 150,
    });
    expect(damage.components.some((c) => c.key === 'poison_dot')).toBe(true);
  });

  it('does not emit a poison damage component for regular skills', () => {
    const row = getFileSkillStore().catalogByInternalId.get('black_lotus_strike');
    const damage = collectSkillDamage({
      row,
      level: 20,
      characterState: { blvl: {}, lvl: {}, stats: {} },
      characterLevel: 150,
    });
    expect(damage.components.some((c) => c.key === 'poison_dot')).toBe(false);
  });

  it('hides the poison tooltip line except for Amatoxin', async () => {
    resetFixedLevelSkillTooltipCacheForTests();
    const blackLotus = await buildFixedLevelSkillTooltipHtml('black_lotus_strike', 20);
    expect(blackLotus.replace(/<[^>]+>/g, ' ')).not.toContain('Poison Damage:');

    resetFixedLevelSkillTooltipCacheForTests();
    const amatoxin = await buildFixedLevelSkillTooltipHtml('amatoxin', 20);
    expect(amatoxin.replace(/<[^>]+>/g, ' ')).toContain('Poison Damage:');
  });
});
