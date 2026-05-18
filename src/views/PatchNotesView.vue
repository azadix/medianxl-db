<script>
export default {
  name: 'PatchNotesView',
};
</script>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';

const CONTEXT_RADIUS = 2;
const MAX_RESULTS = 200;

const query = ref('');
const isLoading = ref(true);
const loadError = ref('');
const patchSections = ref([]);

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

function getAssetUrl(relativePath) {
  return new URL(relativePath, window.location.origin + import.meta.env.BASE_URL).href;
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

        return { version, lines };
      })
    );

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

function renderSectionMarkdown(lines) {
  return renderMarkdown(lines.join('\n'));
}

function renderSearchMarkdown(lines, needle) {
  const source = lines.map((line) => line.text).join('\n');
  if (!needle) return renderMarkdown(source);
  return highlightRenderedHtml(renderMarkdown(source), needle);
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

onMounted(async () => {
  await loadPatchData();
});
</script>

<template>
  <section class="section px-3">
    <div class="container patch-notes-container">
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
            <div class="context content markdown-content p-3" v-html="renderSearchMarkdown(card.lines, queryText)" />
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
            <div class="context content markdown-content p-3" v-html="renderSectionMarkdown(section.lines)" />
          </details>
        </article>
      </div>
    </div>
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
</style>
