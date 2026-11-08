import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('item unsupported badges', () => {
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

  it('labels unique and unknown item lines without touching supported ones', () => {
    const def = {
      id: 'badge-test',
      name: 'Badge Test',
      rarity: 'unique',
      type: 'torso',
      category: 'armor',
      baseName: 'Ancient Armor',
      sockets: 0,
      modifiers: [
        '+40 to Vitality',
        '{orange}Miasma: Haunt Duration Increased by 4 seconds',
        'Nonsense 123',
      ],
    };
    const html = buildItemTooltipHtml(def, null, null, {});
    expect(html).toContain('+40 to Vitality');
    expect(html).toContain('Miasma: Haunt Duration Increased by 4 seconds');
    expect(html).toContain('Not supported');
    expect(html).toContain('mod-support-badge');
    expect(html).toContain('title="unique-mechanic"');
    expect(html).toContain('title="unknown-stat"');
  });
});
