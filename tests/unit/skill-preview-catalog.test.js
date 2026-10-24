/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSkillPreviewManifest,
  hasSkillPreview,
  resetSkillPreviewCatalogForTests,
  setSkillPreviewIdsForTests,
} from '@/skills/skill-preview-catalog.js';

describe('skill-preview-catalog', () => {
  afterEach(() => {
    resetSkillPreviewCatalogForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports ids set for tests', () => {
    expect(hasSkillPreview('frozen_crown')).toBe(false);
    setSkillPreviewIdsForTests(['frozen_crown']);
    expect(hasSkillPreview('frozen_crown')).toBe(true);
    expect(hasSkillPreview('other')).toBe(false);
  });

  it('loads ids from the preview manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ids: ['frozen_crown', 'blizzard'] }),
      }))
    );
    await ensureSkillPreviewManifest();
    expect(hasSkillPreview('frozen_crown')).toBe(true);
    expect(hasSkillPreview('blizzard')).toBe(true);
    expect(hasSkillPreview('missing')).toBe(false);
  });
});
