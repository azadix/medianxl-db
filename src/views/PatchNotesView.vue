<script>
export default {
  name: 'PatchNotesView',
};
</script>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { marked } from 'marked';
import { expandPlaceholdersWithScaling, escapeHtmlText, getSkillIconHTML } from '../shared/utils.js';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '../../tree/skill-data-store.js';

const CONTEXT_RADIUS = 2;
const MAX_RESULTS = 200;
const SKILL_HIGHLIGHT_CLASS = 'patch-skill-highlight';
// Patch-note authors can mark explicit skills as {{Exact Skill Display Name}}.
const SKILL_MARKER_REGEX = /\{\{([^{}]+)\}\}/g;
const TOOLTIP_OFFSET = 18;
const TOOLTIP_VIEWPORT_MARGIN = 12;
const TOOLTIP_CACHE_LEVEL = 1;

const skillMatchersByFolder = new Map();
const tooltipHtmlBySkillKey = new Map();

let activeStoreFolderKey = '';
let storeInitPromise = null;

const query = ref('');
const isLoading = ref(true);
const loadError = ref('');
const patchSections = ref([]);

const patchNotesRoot = ref(null);
const tooltipElement = ref(null);
const tooltipVisible = ref(false);
const tooltipHtml = ref('');
const tooltipStyle = ref({ left: '-9999px', top: '-9999px' });
let tooltipTokenCounter = 0;

function parseVersionParts(version) {
  const parts = String(version).split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function sortVersionsDesc(a, b) {
  const ap = parseVersionParts(a.version);
  const bp = parseVersionParts(b.version);
  if (ap[0] !== bp[0]) return bp[0] - ap[0];
  if (ap[1] !== bp[1]) return bp[1] - ap[1];
  return bp[2] - ap[2];
}

function versionToFolderKey(version) {
  const [major, minor] = parseVersionParts(version);
  return `${major}_${minor}`;
}

function getAssetUrl(relativePath) {
  return new URL(relativePath, window.location.origin + import.meta.env.BASE_URL).href;
}

function normalizeSkillName(value) {
  const normalized = String(value || '').trim();
  return normalized;
}

function parseFolderVersion(folderKey) {
  const [majorRaw, minorRaw] = String(folderKey || '').split('_');
  const major = Number.parseInt(majorRaw, 10);
  const minor = Number.parseInt(minorRaw, 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
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
      // Switch active store so scaling placeholders resolve for the hovered patch version.
      resetSkillDataStoreForTests();
      await initSkillDataStore({ major: parsed.major, minor: parsed.minor });
      return getFileSkillStore();
    } catch {
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

function getSkillRecordFromElement(target) {
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
    sourceLines,
    skillRecord.id,
    characterState,
    false,
    null
  );
  return String(expanded || '');
}

function toTooltipLineHtml(expandedBlock, className) {
  const lines = String(expandedBlock || '').split('\n');
  const rendered = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<div class="${className}">${line}</div>`)
    .join('');
  return rendered;
}

async function buildTooltipHtmlForSkill(skillRecord) {
  if (!skillRecord) return '';
  const tooltipKey = buildTooltipKey(skillRecord);
  if (tooltipHtmlBySkillKey.has(tooltipKey)) {
    return tooltipHtmlBySkillKey.get(tooltipKey) || '';
  }

  await ensureSkillStoreForFolder(skillRecord.folderKey);

  const iconHtml = getSkillIconHTML(
    skillRecord.image || '',
    skillRecord.class || 'Other',
    'is-64x64',
    skillRecord.folderKey
  );

  const descriptionExpanded = await expandTooltipLines(skillRecord, skillRecord.description || []);
  const effectExpanded = await expandTooltipLines(skillRecord, skillRecord.skillEffect || []);
  const restrictionExpanded = await expandTooltipLines(skillRecord, skillRecord.restriction || []);

  const tagsLine = [skillRecord.class, skillRecord.tabName].filter(Boolean).join(' / ');
  const headerHtml = `
    <div class="tooltip-header">
      <div class="tooltip-icon">${iconHtml}</div>
      <div class="tooltip-name-container">
        <div class="tooltip-name-section">
          <div class="is-size-4 has-text-weight-bold">${escapeHtmlText(skillRecord.displayName || 'Unknown skill')}</div>
          ${tagsLine ? `<p class="is-size-7 has-text-grey-lighter">${escapeHtmlText(tagsLine)}</p>` : ''}
        </div>
        <div class="tooltip-level-section">
          <div class="is-size-6 has-text-weight-bold has-text-info">Level 1</div>
          <div class="is-size-7 has-text-grey">1 from points</div>
        </div>
      </div>
    </div>
  `;

  const tooltipParts = [`<div class="tooltip-content">${headerHtml}`];
  if (restrictionExpanded.trim()) {
    tooltipParts.push(`<div class="tooltip-warning">${toTooltipLineHtml(restrictionExpanded, 'has-text-warning')}</div>`);
  }
  if (descriptionExpanded.trim() || effectExpanded.trim()) {
    tooltipParts.push('<div class="tooltip-description">');
    if (descriptionExpanded.trim()) {
      tooltipParts.push(`<div class="tooltip-main-desc has-text-centered mb-2">${descriptionExpanded}</div>`);
    }
    if (effectExpanded.trim()) {
      tooltipParts.push('<div class="tooltip-level-indicator is-italic">Level 1 values:</div>');
      tooltipParts.push(toTooltipLineHtml(effectExpanded, 'tooltip-effect has-text-centered'));
    }
    tooltipParts.push('</div>');
  }
  tooltipParts.push('</div>');

  const html = tooltipParts.join('');
  tooltipHtmlBySkillKey.set(tooltipKey, html);
  return html;
}

function highlightSkillNamesInRenderedHtml(renderedHtml, folderKey) {
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
      !parentElement?.closest(`.${SKILL_HIGHLIGHT_CLASS}`)
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
        // Keep unresolved markers literal so authors can spot typos.
        fragment.appendChild(doc.createTextNode(markerText));
        cursor = markerEnd;
        continue;
      }

      const spanEl = doc.createElement('span');
      spanEl.className = `${SKILL_HIGHLIGHT_CLASS} has-text-warning has-text-weight-bold`;
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

async function loadPatchData() {
  isLoading.value = true;
  loadError.value = '';

  try {
    const manifestUrl = getAssetUrl('patch_notes/index.json');
    const manifestResponse = await fetch(manifestUrl);
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
        const folderKey = versionToFolderKey(version);

        return { version, lines, folderKey };
      })
    );

    const uniqueFolders = [...new Set(loadedSections.map((section) => section.folderKey))];
    await Promise.all(uniqueFolders.map((folderKey) => loadSkillMatcherForFolder(folderKey)));

    patchSections.value = loadedSections.sort(sortVersionsDesc);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Could not load patch notes.';
    patchSections.value = [];
  } finally {
    isLoading.value = false;
  }
}

const queryText = computed(() => query.value.trim());
const loweredQuery = computed(() => queryText.value.toLowerCase());
const hasQuery = computed(() => queryText.value.length > 0);

watch(queryText, (value) => {
  if (!value) return;
  window.scrollTo(0, 0);
});

const searchableSections = computed(() =>
  patchSections.value.map((section) => ({
    version: section.version,
    folderKey: section.folderKey,
    lines: section.lines.map((line, idx) => ({
      lineNumber: idx + 1,
      text: line,
      localIdx: idx,
    })),
  }))
);

function getRangeKey(version, start, end) {
  return `${version}:${start}:${end}`;
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
      last.baseKeys = [...new Set([...last.baseKeys, ...current.baseKeys])];
      continue;
    }
    merged.push(current);
  }

  return merged;
}

const searchResults = computed(() => {
  if (!hasQuery.value) return { total: 0, shown: 0, cards: [] };

  const cards = [];

  for (const section of searchableSections.value) {
    const hits = section.lines.filter((line) => line.text.toLowerCase().includes(loweredQuery.value));
    if (!hits.length) continue;

    const baseRanges = mergeRanges(
      hits.map((hit) => {
        const start = Math.max(0, hit.localIdx - CONTEXT_RADIUS);
        const end = Math.min(section.lines.length - 1, hit.localIdx + CONTEXT_RADIUS);
        const key = getRangeKey(section.version, start, end);
        return { start, end, baseKeys: [key] };
      })
    );

    for (const range of baseRanges) {
      const slice = section.lines.slice(range.start, range.end + 1);
      cards.push({
        key: getRangeKey(section.version, range.start, range.end),
        version: section.version,
        folderKey: section.folderKey,
        start: range.start,
        end: range.end,
        totalLines: section.lines.length,
        lines: slice,
        matchCount: slice.filter((line) => line.text.toLowerCase().includes(loweredQuery.value)).length,
      });
    }
  }

  const total = cards.length;
  return {
    total,
    shown: Math.min(total, MAX_RESULTS),
    cards: cards.slice(0, MAX_RESULTS),
  };
});

function renderMarkdown(markdownText) {
  return marked.parse(markdownText, { breaks: true, gfm: true });
}

function renderSectionMarkdown(lines, folderKey) {
  const rendered = renderMarkdown(lines.join('\n'));
  return highlightSkillNamesInRenderedHtml(rendered, folderKey);
}

function renderSearchMarkdown(lines, needle, folderKey) {
  const source = lines.map((line) => line.text).join('\n');
  const rendered = highlightSkillNamesInRenderedHtml(renderMarkdown(source), folderKey);
  if (!needle) return rendered;
  return highlightRenderedHtml(rendered, needle);
}

function highlightRenderedHtml(renderedHtml, needle) {
  const loweredNeedle = String(needle).toLowerCase();
  if (!loweredNeedle) return renderedHtml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="patch-markdown-root">${renderedHtml}</div>`, 'text/html');
  const root = doc.getElementById('patch-markdown-root');
  if (!root) return renderedHtml;

  const textNodes = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentTag = node.parentElement?.tagName;
    const raw = node.nodeValue || '';
    if (
      raw &&
      parentTag !== 'SCRIPT' &&
      parentTag !== 'STYLE' &&
      parentTag !== 'MARK'
    ) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.nodeValue || '';
    const loweredRaw = raw.toLowerCase();
    if (!loweredRaw.includes(loweredNeedle)) continue;

    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    let matchIndex = loweredRaw.indexOf(loweredNeedle, cursor);
    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        fragment.appendChild(doc.createTextNode(raw.slice(cursor, matchIndex)));
      }
      const markEl = doc.createElement('mark');
      markEl.textContent = raw.slice(matchIndex, matchIndex + loweredNeedle.length);
      fragment.appendChild(markEl);
      cursor = matchIndex + loweredNeedle.length;
      matchIndex = loweredRaw.indexOf(loweredNeedle, cursor);
    }
    if (cursor < raw.length) {
      fragment.appendChild(doc.createTextNode(raw.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return root.innerHTML;
}

function updateTooltipPosition(clientX, clientY) {
  const baseLeft = clientX + TOOLTIP_OFFSET;
  const baseTop = clientY + TOOLTIP_OFFSET;
  tooltipStyle.value = {
    left: `${baseLeft}px`,
    top: `${baseTop}px`,
  };

  requestAnimationFrame(() => {
    const node = tooltipElement.value;
    if (!node || !tooltipVisible.value) return;
    const rect = node.getBoundingClientRect();
    let nextLeft = baseLeft;
    let nextTop = baseTop;
    const maxLeft = window.innerWidth - rect.width - TOOLTIP_VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - rect.height - TOOLTIP_VIEWPORT_MARGIN;
    if (nextLeft > maxLeft) nextLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxLeft);
    if (nextTop > maxTop) nextTop = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxTop);
    tooltipStyle.value = {
      left: `${nextLeft}px`,
      top: `${nextTop}px`,
    };
  });
}

function hideSkillTooltip() {
  tooltipVisible.value = false;
  tooltipHtml.value = '';
}

async function showSkillTooltip(target, clientX, clientY) {
  const skillRecord = getSkillRecordFromElement(target);
  if (!skillRecord) {
    hideSkillTooltip();
    return;
  }

  const token = ++tooltipTokenCounter;
  const html = await buildTooltipHtmlForSkill(skillRecord);
  if (token !== tooltipTokenCounter) return;
  if (!html) {
    hideSkillTooltip();
    return;
  }

  tooltipHtml.value = html;
  tooltipVisible.value = true;
  updateTooltipPosition(clientX, clientY);
}

function closestSkillTarget(eventTarget) {
  if (eventTarget instanceof Element) {
    return eventTarget.closest(`.${SKILL_HIGHLIGHT_CLASS}`);
  }
  // Mouse/focus events can originate from text nodes inside the highlighted span.
  if (eventTarget instanceof Node && eventTarget.nodeType === Node.TEXT_NODE) {
    return eventTarget.parentElement?.closest(`.${SKILL_HIGHLIGHT_CLASS}`) || null;
  }
  return null;
}

function onPatchMouseOver(event) {
  const target = closestSkillTarget(event.target);
  if (!target) return;
  const x = event.clientX || 0;
  const y = event.clientY || 0;
  showSkillTooltip(target, x, y);
}

function onPatchMouseMove(event) {
  if (!tooltipVisible.value) return;
  const target = closestSkillTarget(event.target);
  if (!target) return;
  updateTooltipPosition(event.clientX || 0, event.clientY || 0);
}

function onPatchMouseOut(event) {
  const leavingFrom = closestSkillTarget(event.target);
  if (!leavingFrom) return;
  const stillInside = closestSkillTarget(event.relatedTarget);
  if (stillInside === leavingFrom) return;
  hideSkillTooltip();
}

function onPatchFocusIn(event) {
  const target = closestSkillTarget(event.target);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  showSkillTooltip(target, rect.left + rect.width / 2, rect.bottom);
}

function onPatchFocusOut(event) {
  const from = closestSkillTarget(event.target);
  if (!from) return;
  const to = closestSkillTarget(event.relatedTarget);
  if (to === from) return;
  hideSkillTooltip();
}

function onPatchKeyDown(event) {
  if (event.key === 'Escape') {
    hideSkillTooltip();
  }
}

onMounted(async () => {
  await loadPatchData();
  const root = patchNotesRoot.value;
  if (!root) return;
  root.addEventListener('mouseover', onPatchMouseOver);
  root.addEventListener('mousemove', onPatchMouseMove);
  root.addEventListener('mouseout', onPatchMouseOut);
  root.addEventListener('focusin', onPatchFocusIn);
  root.addEventListener('focusout', onPatchFocusOut);
  root.addEventListener('keydown', onPatchKeyDown);
});

onUnmounted(() => {
  const root = patchNotesRoot.value;
  if (!root) return;
  root.removeEventListener('mouseover', onPatchMouseOver);
  root.removeEventListener('mousemove', onPatchMouseMove);
  root.removeEventListener('mouseout', onPatchMouseOut);
  root.removeEventListener('focusin', onPatchFocusIn);
  root.removeEventListener('focusout', onPatchFocusOut);
  root.removeEventListener('keydown', onPatchKeyDown);
});
</script>

<template>
  <section class="section px-3">
    <div ref="patchNotesRoot" class="container patch-notes-container">
      <h1 class="title mb-2">Patch notes</h1>
      <p class="subtitle mb-4">Search or browse Median XL patch notes by version.</p>

      <div class="patch-search-sticky mb-4">
        <div class="field mb-0">
          <label class="label" for="patch-search">Search</label>
          <div class="control">
            <input
              id="patch-search"
              v-model="query"
              class="input"
              type="text"
              placeholder="Type to search patch notes..."
              :disabled="isLoading || Boolean(loadError)"
            />
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="notification">Loading patch notes...</div>
      <div v-else-if="loadError" class="notification is-danger">{{ loadError }}</div>

      <template v-else-if="hasQuery">
        <div class="mb-3 has-text-grey">
          Found {{ searchResults.total }} section{{ searchResults.total === 1 ? '' : 's' }}
          <span v-if="searchResults.total > searchResults.shown">
            (showing first {{ searchResults.shown }})
          </span>
        </div>

        <div v-if="searchResults.cards.length" class="results">
          <article
            v-for="card in searchResults.cards"
            :key="card.key"
            class="result-card p-0"
          >
            <header class="result-header p-3">
              <p class="result-title has-text-info mb-0">Patch {{ card.version }} ({{ card.matchCount }} match{{ card.matchCount === 1 ? '' : 'es' }})</p>
            </header>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="context content markdown-content p-3" v-html="renderSearchMarkdown(card.lines, queryText, card.folderKey)" />
          </article>
        </div>
        <div v-else class="notification">No matching patch notes found.</div>
      </template>

      <div v-else class="results">
        <article
          v-for="section in patchSections"
          :key="section.version"
          class="patch-section mb-1 p-0"
        >
          <details class="patch-details">
            <summary class="patch-summary p-3">
              <span class="patch-title has-text-info">Patch {{ section.version }}</span>
              <span class="patch-meta">{{ section.lines.length }} lines</span>
            </summary>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="context content markdown-content p-3" v-html="renderSectionMarkdown(section.lines, section.folderKey)" />
          </details>
        </article>
      </div>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      v-show="tooltipVisible"
      ref="tooltipElement"
      class="skill-tooltip patch-note-skill-tooltip"
      :style="tooltipStyle"
      v-html="tooltipHtml"
    />
  </section>
</template>

<style scoped>
.patch-notes-container {
  max-width: 1100px;
}

.patch-search-sticky {
  position: sticky;
  top: calc(3.25rem + 0.5rem);
  z-index: 10;
  padding: 0.6rem 0.8rem;
  margin: 0 -0.2rem;
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 0.75rem;
  background: rgba(22, 22, 22, 0.95);
  backdrop-filter: blur(2px);
}

.results {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.875rem;
}

.result-card,
.patch-section {
  min-width: 0;
  border: none;
  box-shadow: none;
  border-radius: 1rem;
  border: 1px solid rgba(127, 127, 127, 0.2);
}

.patch-summary,
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.patch-summary {
  cursor: pointer;
  user-select: none;
}

.patch-summary::-webkit-details-marker {
  display: none;
}

.patch-title,
.result-title {
  font-weight: 700;
}

.patch-meta {
  color: var(--bulma-text-weak, #9f9f9f);
  font-size: 0.9rem;
}

.context {
  margin: 0;
  overflow-x: hidden;
  line-height: 1;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
  min-width: 0;
}

.patch-note-skill-tooltip {
  position: fixed;
  z-index: 10000;
  max-width: 50vw;
  min-width: 300px;
  padding: 12px;
  border: 2px solid #8a8a8a;
  border-radius: 6px;
  background: #1a1a1a;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  font-size: 1rem;
  line-height: 1.4;
}

.patch-note-skill-tooltip .tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patch-note-skill-tooltip .tooltip-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #444;
}

.patch-note-skill-tooltip .tooltip-name-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex: 1;
  gap: 12px;
}

.patch-note-skill-tooltip .tooltip-name-section {
  flex: 1;
}

.patch-note-skill-tooltip .tooltip-level-section {
  text-align: right;
  flex-shrink: 0;
}

.patch-note-skill-tooltip :deep(.tooltip-icon .image) {
  width: 64px;
  height: 64px;
}

.patch-note-skill-tooltip .tooltip-warning {
  padding: 6px 8px;
  background: rgba(255, 193, 0, 0.1);
  border-left: 3px solid #ffdd57;
  border-radius: 3px;
}

.patch-note-skill-tooltip .tooltip-description {
  padding: 6px 0;
  color: #eee;
}

.patch-note-skill-tooltip .tooltip-level-indicator {
  font-size: 0.9rem;
  color: #aaa;
  margin-bottom: 4px;
}

:deep(.patch-skill-highlight) {
  cursor: help;
}

:deep(.patch-skill-highlight:focus-visible) {
  outline: 1px dashed rgba(255, 221, 87, 0.85);
  outline-offset: 2px;
}

mark {
  background: rgba(255, 221, 87, 0.5);
  color: inherit;
}

.result-header {
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}

.markdown-content:deep(ul),
.markdown-content:deep(ol) {
  margin-left: 1.2rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.markdown-content:deep(ul li),
.markdown-content:deep(ol li) {
  line-height: 1.2;
  margin: 0.2rem 0;
}

.markdown-content:deep(p),
.markdown-content:deep(li),
.markdown-content:deep(blockquote),
.markdown-content:deep(pre),
.markdown-content:deep(code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
}

@media screen and (max-width: 768px) {
  .patch-note-skill-tooltip {
    max-width: 90vw;
    min-width: 250px;
  }
}
</style>
