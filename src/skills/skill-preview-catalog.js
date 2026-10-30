/**
 * @file Catalog of skill ids that have a WebP under public/skill-previews.
 * @module skills/skill-preview-catalog
 */

import { getAssetUrl } from '@/shared/utils.js';

/** @type {Set<string>} */
let skillPreviewIds = new Set();
/** @type {Promise<Set<string>>|null} */
let loadPromise = null;

/**
 * @param {string|null|undefined} skillId
 * @returns {boolean}
 */
export function hasSkillPreview(skillId) {
  const id = (skillId && String(skillId).trim()) || '';
  return Boolean(id && skillPreviewIds.has(id));
}

/**
 * Load `skill-previews/manifest.json` once.
 * @returns {Promise<Set<string>>}
 */
export function ensureSkillPreviewManifest() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch(getAssetUrl('skill-previews/manifest.json'));
      if (!res.ok) {
        skillPreviewIds = new Set();
        return skillPreviewIds;
      }
      const data = await res.json();
      const ids = Array.isArray(data?.ids) ? data.ids : [];
      skillPreviewIds = new Set(ids.map((id) => String(id)));
    } catch {
      skillPreviewIds = new Set();
    }
    return skillPreviewIds;
  })();
  return loadPromise;
}

/**
 * @param {Iterable<string>|null|undefined} ids
 */
export function setSkillPreviewIdsForTests(ids) {
  skillPreviewIds = new Set(Array.from(ids || []).map((id) => String(id)));
  loadPromise = Promise.resolve(skillPreviewIds);
}

export function resetSkillPreviewCatalogForTests() {
  skillPreviewIds = new Set();
  loadPromise = null;
}
