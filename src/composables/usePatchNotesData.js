/**
 * @file Patch notes manifest load, skill matchers, and section markdown rendering.
 * @module src/composables/usePatchNotesData
 */
import { ref } from 'vue';
import { marked } from 'marked';
import {
  expandPlaceholdersWithScaling,
  escapeHtmlText,
  getAssetUrl,
  getSkillIconHTML,
} from '@/shared/utils.js';
import {
  buildSkillTooltipDescriptionBlock,
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipRestrictionBlock,
  wrapSkillTooltipContent,
} from '@/shared/tooltip-html.js';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/tree/skill-data-store.js';
import {
  parsePatchVersionString,
  patchVersionToFolderKey,
  setBuildVersionOverride,
} from '@/shared/version-config.js';
import { parseFolderVersion } from '@/shared/version-resolver.js';

const SKILL_MARKER_REGEX = /\{\{([^{}]+)\}\}/g;
const TOOLTIP_CACHE_LEVEL = 1;

const skillMatchersByFolder = new Map();
const tooltipHtmlBySkillKey = new Map();

let activeStoreFolderKey = '';
let storeInitPromise = null;

function sortVersionsDesc(a, b) {
  const ap = parsePatchVersionString(a.version);
  const bp = parsePatchVersionString(b.version);
  if (ap.major !== bp.major) return bp.major - ap.major;
  if (ap.minor !== bp.minor) return bp.minor - ap.minor;
  return bp.patch - ap.patch;
}

async function loadAvailableTreeDataFolders() {
  try {
    const response = await fetch(getAssetUrl('tree_data/versions.json'));
    if (!response.ok) return new Set();
    const versions = await response.json();
    if (!Array.isArray(versions)) return new Set();

    const folderKeys = new Set();
    for (const row of versions) {
      const major = Number(row?.major);
      const minor = Number(row?.minor);
      if (!Number.isFinite(major) || !Number.isFinite(minor)) continue;
      folderKeys.add(`${major}_${minor}`);
    }
    return folderKeys;
  } catch {
    return new Set();
  }
}

function normalizeSkillName(value) {
  return String(value || '').trim();
}

function toArrayText(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [String(value)];
}

function buildSkillMatcher(skills) {
  if (!Array.isArray(skills) || !skills.length) return null;

  const dedupedByLowered = new Map();
  for (const row of skills) {
    const displayName = normalizeSkillName(row?.displayName);
    if (!displayName) continue;
    const lowered = displayName.toLowerCase();
    if (!dedupedByLowered.has(lowered)) {
      dedupedByLowered.set(lowered, {
        id: row?.id ? String(row.id) : '',
        numericId: Number.isFinite(Number(row?.numericId)) ? Number(row.numericId) : null,
        displayName,
        class: row?.class ? String(row.class) : '',
        tabName: row?.tabName ? String(row.tabName) : '',
        image: row?.image ? String(row.image) : '',
        description: toArrayText(row?.description),
        skillEffect: toArrayText(row?.skillEffect),
        restriction: toArrayText(row?.restriction),
        variants: Array.isArray(row?.variants) ? row.variants : [],
      });
    }
  }

  const normalized = [...dedupedByLowered.keys()];
  if (!normalized.length) return null;

  const entriesByFirstChar = new Map();
  for (const lowered of normalized) {
    const firstChar = lowered[0];
    if (!firstChar) continue;
    if (!entriesByFirstChar.has(firstChar)) {
      entriesByFirstChar.set(firstChar, []);
    }
    entriesByFirstChar.get(firstChar).push({ lowered, length: lowered.length });
  }

  for (const bucket of entriesByFirstChar.values()) {
    bucket.sort((a, b) => b.length - a.length);
  }

  return {
    entriesByFirstChar,
    skillByLoweredName: dedupedByLowered,
  };
}

async function loadSkillMatcherForFolder(folderKey) {
  if (!folderKey || skillMatchersByFolder.has(folderKey)) return;

  try {
    const response = await fetch(getAssetUrl(`tree_data/${folderKey}/skills.json`));
    if (!response.ok) {
      skillMatchersByFolder.set(folderKey, null);
      return;
    }
    const skills = await response.json();
    if (!Array.isArray(skills)) {
      skillMatchersByFolder.set(folderKey, null);
      return;
    }
    skillMatchersByFolder.set(folderKey, buildSkillMatcher(skills));
  } catch {
    skillMatchersByFolder.set(folderKey, null);
  }
}

async function ensureSkillStoreForFolder(folderKey) {
  if (!folderKey) return null;
  const parsed = parseFolderVersion(folderKey);
  if (!parsed) return null;

  if (activeStoreFolderKey === folderKey && getFileSkillStore()) {
    return getFileSkillStore();
  }
  if (storeInitPromise && activeStoreFolderKey === folderKey) {
    return storeInitPromise;
  }

  activeStoreFolderKey = folderKey;
  storeInitPromise = (async () => {
    try {
      setBuildVersionOverride(parsed);
      resetSkillDataStoreForTests();
      const store = await initSkillDataStore({ major: parsed.major, minor: parsed.minor });
      if (!store || store.folderSeg !== folderKey) {
        throw new Error(`Loaded wrong tree-data folder (expected ${folderKey}, got ${store?.folderSeg || 'none'})`);
      }
      return store;
    } catch (error) {
      console.warn('Patch-note tooltip store init failed:', error);
      return null;
    } finally {
      storeInitPromise = null;
    }
  })();

  return storeInitPromise;
}

function getMatcherForFolder(folderKey) {
  return skillMatchersByFolder.get(folderKey) || null;
}

function getSkillRecordByLoweredName(folderKey, loweredName) {
  const matcher = getMatcherForFolder(folderKey);
  return matcher?.skillByLoweredName?.get(loweredName) || null;
}

export function getSkillRecordFromElement(target) {
  if (!target) return null;
  const folderKey = target.dataset.skillFolder || '';
  const loweredName = normalizeSkillName(target.dataset.skillLoweredName).toLowerCase();
  const record = getSkillRecordByLoweredName(folderKey, loweredName);
  if (!record) return null;
  return { ...record, folderKey };
}

function buildTooltipKey(skillRecord) {
  if (!skillRecord) return '';
  const skillId = skillRecord.id || skillRecord.numericId || skillRecord.displayName || 'unknown';
  return `${skillRecord.folderKey}:${skillId}:lvl${TOOLTIP_CACHE_LEVEL}`;
}

async function expandTooltipLines(skillRecord, sourceLines) {
  if (!sourceLines.length) return '';
  if (!skillRecord?.id || skillRecord?.numericId == null) {
    return sourceLines.map((line) => escapeHtmlText(line)).join('\n');
  }
  const sourceText = sourceLines.map((line) => String(line)).join('\n');
  const characterState = {
    level: 1,
    className: skillRecord.class || null,
    blvl: { [skillRecord.id]: TOOLTIP_CACHE_LEVEL },
    lvl: { [skillRecord.id]: 0 },
    treeSkillsCache: {},
    stats: {},
  };
  const expanded = await expandPlaceholdersWithScaling(
    skillRecord.numericId,
    TOOLTIP_CACHE_LEVEL,
    sourceText,
    skillRecord.id,
    characterState,
    false,
    null
  );
  return String(expanded || '');
}

/**
 * Build cached HTML tooltip for a patch-note skill highlight.
 * @param {object} skillRecord
 * @returns {Promise<string>}
 */
export async function buildTooltipHtmlForSkill(skillRecord) {
  if (!skillRecord) return '';
  const tooltipKey = buildTooltipKey(skillRecord);
  if (tooltipHtmlBySkillKey.has(tooltipKey)) {
    return tooltipHtmlBySkillKey.get(tooltipKey) || '';
  }

  let expandedBlocks;
  const iconHtml = getSkillIconHTML(
    skillRecord.image || '',
    skillRecord.class || 'Other',
    'is-64x64',
    skillRecord.folderKey
  );

  try {
    const store = await ensureSkillStoreForFolder(skillRecord.folderKey);
    if (!store) {
      throw new Error(`Skill store unavailable for ${skillRecord.folderKey}`);
    }
    expandedBlocks = {
      descriptionExpanded: await expandTooltipLines(skillRecord, skillRecord.description || []),
      effectExpanded: await expandTooltipLines(skillRecord, skillRecord.skillEffect || []),
      restrictionExpanded: await expandTooltipLines(skillRecord, skillRecord.restriction || []),
    };
  } catch (error) {
    console.warn('Patch-note tooltip fallback (expansion failed):', error);
    expandedBlocks = {
      descriptionExpanded: (skillRecord.description || []).map((line) => escapeHtmlText(line)).join('\n'),
      effectExpanded: (skillRecord.skillEffect || []).map((line) => escapeHtmlText(line)).join('\n'),
      restrictionExpanded: (skillRecord.restriction || []).map((line) => escapeHtmlText(line)).join('\n'),
    };
  }
  const { descriptionExpanded, effectExpanded, restrictionExpanded } = expandedBlocks;

  const tagsLine = [skillRecord.class, skillRecord.tabName].filter(Boolean).join(' / ');
  const tagsHtml = tagsLine
    ? `<p class="is-size-7 has-text-grey-lighter">${escapeHtmlText(tagsLine)}</p>`
    : '';
  const headerHtml = buildSkillTooltipHeaderHtml({
    iconHtml,
    nameInnerHtml: escapeHtmlText(skillRecord.displayName || 'Unknown skill'),
    tagsHtml,
    levelSectionHtml: `<div class="is-size-6 has-text-weight-bold has-text-info">Level 1</div>
          <div class="is-size-7 has-text-grey">1 from points</div>`,
  });

  const bodyParts = [
    buildSkillTooltipRestrictionBlock(restrictionExpanded),
    buildSkillTooltipDescriptionBlock({
      mainDescHtml: descriptionExpanded,
      levelIndicatorHtml: effectExpanded.trim()
        ? '<div class="tooltip-level-indicator is-italic">Level 1 values:</div>'
        : '',
      effectExpanded,
    }),
  ].filter(Boolean);

  const html = wrapSkillTooltipContent(headerHtml + bodyParts.join(''));
  tooltipHtmlBySkillKey.set(tooltipKey, html);
  return html;
}

export function highlightSkillNamesInRenderedHtml(renderedHtml, folderKey) {
  const matcher = getMatcherForFolder(folderKey);
  if (!matcher) return renderedHtml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="patch-markdown-root">${renderedHtml}</div>`, 'text/html');
  const root = doc.getElementById('patch-markdown-root');
  if (!root) return renderedHtml;

  const textNodes = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentElement = node.parentElement;
    const parentTag = parentElement?.tagName;
    const raw = node.nodeValue || '';
    if (
      raw &&
      parentTag !== 'SCRIPT' &&
      parentTag !== 'STYLE' &&
      !parentElement?.closest('.patch-skill-highlight')
    ) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.nodeValue || '';
    SKILL_MARKER_REGEX.lastIndex = 0;
    const matches = [...raw.matchAll(SKILL_MARKER_REGEX)];
    if (!matches.length) continue;

    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const markerMatch of matches) {
      const markerText = markerMatch[0];
      const markerInner = normalizeSkillName(markerMatch[1]);
      const markerStart = markerMatch.index ?? -1;
      const markerEnd = markerStart + markerText.length;

      if (markerStart < 0 || markerStart < cursor) continue;
      if (markerStart > cursor) {
        fragment.appendChild(doc.createTextNode(raw.slice(cursor, markerStart)));
      }

      const loweredMarker = markerInner.toLowerCase();
      const skillRecord = getSkillRecordByLoweredName(folderKey, loweredMarker);
      if (!skillRecord) {
        fragment.appendChild(doc.createTextNode(markerText));
        cursor = markerEnd;
        continue;
      }

      const spanEl = doc.createElement('span');
      spanEl.className = 'patch-skill-highlight has-text-warning has-text-weight-bold';
      spanEl.textContent = skillRecord.displayName || markerInner;
      spanEl.setAttribute('tabindex', '0');
      spanEl.setAttribute('role', 'button');
      spanEl.dataset.skillFolder = folderKey;
      spanEl.dataset.skillLoweredName = loweredMarker;
      spanEl.dataset.skillName = skillRecord.displayName || markerInner;
      if (skillRecord.id) spanEl.dataset.skillId = skillRecord.id;
      if (skillRecord.numericId != null) spanEl.dataset.skillNumericId = String(skillRecord.numericId);
      fragment.appendChild(spanEl);
      cursor = markerEnd;
    }

    if (cursor < raw.length) {
      fragment.appendChild(doc.createTextNode(raw.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return root.innerHTML;
}

/**
 * @returns {{
 *   patchSections: import('vue').Ref<Array<{ version: string, lines: string[], folderKey: string }>>,
 *   isLoading: import('vue').Ref<boolean>,
 *   loadError: import('vue').Ref<string>,
 *   loadPatchData: () => Promise<void>,
 *   renderSectionMarkdown: (lines: string[], folderKey: string) => string,
 * }}
 */
export function usePatchNotesData() {
  const isLoading = ref(true);
  const loadError = ref('');
  const patchSections = ref([]);

  async function loadPatchData() {
    isLoading.value = true;
    loadError.value = '';

    try {
      const availableFolderKeys = await loadAvailableTreeDataFolders();
      const manifestResponse = await fetch(getAssetUrl('patch_notes/index.json'));
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load patch list (${manifestResponse.status})`);
      }

      const filenames = await manifestResponse.json();
      if (!Array.isArray(filenames)) {
        throw new Error('Patch list is invalid.');
      }

      const loadedSections = await Promise.all(
        filenames.map(async (filename) => {
          const response = await fetch(getAssetUrl(`patch_notes/${filename}`));
          if (!response.ok) {
            throw new Error(`Failed to load ${filename} (${response.status})`);
          }

          const version = filename.replace(/\.md$/i, '');
          const text = await response.text();
          const lines = text.replace(/\r\n/g, '\n').split('\n');
          const folderKey = patchVersionToFolderKey(version);

          return { version, lines, folderKey };
        })
      );

      const uniqueFolders = [...new Set(loadedSections.map((section) => section.folderKey))].filter(
        (folderKey) => availableFolderKeys.has(folderKey)
      );
      if (uniqueFolders.length) {
        await Promise.all(uniqueFolders.map((folderKey) => loadSkillMatcherForFolder(folderKey)));
      }

      patchSections.value = loadedSections.sort(sortVersionsDesc);
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'Could not load patch notes.';
      patchSections.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  function renderMarkdown(markdownText) {
    return marked.parse(markdownText, { breaks: true, gfm: true });
  }

  function renderSectionMarkdown(lines, folderKey) {
    const rendered = renderMarkdown(lines.join('\n'));
    return highlightSkillNamesInRenderedHtml(rendered, folderKey);
  }

  return {
    patchSections,
    isLoading,
    loadError,
    loadPatchData,
    renderSectionMarkdown,
  };
}
