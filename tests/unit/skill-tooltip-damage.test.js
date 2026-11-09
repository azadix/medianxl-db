/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import {
  buildFixedLevelSkillTooltipHtml,
  resetFixedLevelSkillTooltipCacheForTests,
} from '@/skills/fixed-level-skill-tooltip.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('skill tooltip damage', () => {
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

  it('adds the damage summary to a damaging skill tooltip', async () => {
    resetFixedLevelSkillTooltipCacheForTests();
    const html = await buildFixedLevelSkillTooltipHtml('annihilation', 20);
    expect(html).toContain('tooltip-damage');
    expect(html).toContain('tooltip-damage-type is-fire');
    expect(html).toContain('tooltip-damage-value');
  });

  it('omits the block for a non-damaging skill', async () => {
    resetFixedLevelSkillTooltipCacheForTests();
    const html = await buildFixedLevelSkillTooltipHtml('teleport', 1);
    expect(html).not.toContain('tooltip-damage-row');
  });
});
