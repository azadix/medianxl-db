<script>
export default {
  name: 'PatchNotesView',
};
</script>

<script setup>
import { ref } from 'vue';
import { usePatchNotesData } from '@/composables/usePatchNotesData.js';
import { usePatchNotesSearch } from '@/composables/usePatchNotesSearch.js';
import { usePatchSkillTooltip } from '@/composables/usePatchSkillTooltip.js';
import { usePatchItemTooltip } from '@/composables/usePatchItemTooltip.js';

const patchNotesRoot = ref(null);
const patchSearchSticky = ref(null);
const itemTooltipApi = { hide: () => {} };

const { patchSections, isLoading, isBackfillLoading, loadError, loadPatchData, renderSectionMarkdown, formatPatchReleaseDate } =
  usePatchNotesData();

const { tooltipElement, hideSkillTooltip } =
  usePatchSkillTooltip({
    patchNotesRoot,
    loadPatchData,
    hideItemTooltip: () => itemTooltipApi.hide(),
  });

const { itemTooltipElement, hideItemTooltip } =
  usePatchItemTooltip({ patchNotesRoot, hideSkillTooltip });
itemTooltipApi.hide = hideItemTooltip;

const {
  query,
  queryText,
  hasQuery,
  isSearchDisabled,
  searchResults,
  jumpToCurrentSectionTop,
  jumpToFullPatchSection,
  renderSearchMarkdown,
} = usePatchNotesSearch({
  patchSections,
  isLoading,
  loadError,
  patchNotesRoot,
  patchSearchSticky,
  hideSkillTooltip,
  hideItemTooltip,
});
</script>

<template>
  <section class="section py-1 patch-notes-view">
    <div ref="patchSearchSticky" class="patch-search-sticky mb-4">
      <div class="container patch-search-container">
        <div class="field mb-0">
          <label class="label" for="patch-search">Search</label>
          <div class="field is-grouped mb-0 patch-search-controls">
            <div class="control is-expanded patch-search-input-control">
              <input
                id="patch-search"
                v-model="query"
                class="input"
                type="text"
                placeholder="Type to search patch notes..."
                :disabled="isSearchDisabled"
              />
            </div>
            <div class="control">
              <button
                type="button"
                class="button patch-jump-top-button"
                title="Jump to top of current patch section"
                aria-label="Jump to top of current patch section"
                :disabled="isSearchDisabled"
                @click="jumpToCurrentSectionTop"
              >
                Jump to Top
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div ref="patchNotesRoot" class="container patch-notes-container">
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
            :data-version="card.version"
          >
            <header class="result-header p-3">
              <p class="result-title has-text-info mb-0">
                Patch {{ card.version }}
                <span v-if="card.releaseDate" class="patch-release">{{ formatPatchReleaseDate(card.releaseDate) }}</span>
                <span class="patch-meta"> ({{ card.matchCount }} match{{ card.matchCount === 1 ? '' : 'es' }})</span>
              </p>
              <button
                type="button"
                class="button is-small is-ghost patch-open-full-button"
                @click="jumpToFullPatchSection(card.version, card.lines[0]?.text || '')"
              >
                View full patch
              </button>
            </header>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="context content markdown-content p-3" v-html="renderSearchMarkdown(card.lines, queryText, card.folderKey)" />
          </article>
          <div v-if="isBackfillLoading" class="notification is-light mt-2 mb-0">
            Loading older patch notes...
          </div>
        </div>
        <div v-else class="notification">
          {{ isBackfillLoading ? 'Loading older patch notes...' : 'No matching patch notes found.' }}
        </div>
      </template>

      <div v-else class="results">
        <article
          v-for="section in patchSections"
          :key="section.version"
          class="patch-section mb-1 p-0"
          :data-version="section.version"
        >
          <details class="patch-details">
            <summary class="patch-summary p-3">
              <span class="patch-title has-text-info">
                Patch {{ section.version }}
                <span v-if="section.releaseDate" class="patch-release">{{ formatPatchReleaseDate(section.releaseDate) }}</span>
              </span>
              <span class="patch-meta">{{ section.lines.length }} lines</span>
            </summary>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="context content markdown-content p-3" v-html="renderSectionMarkdown(section.lines, section.folderKey)" />
          </details>
        </article>
        <div v-if="isBackfillLoading" class="notification is-light mt-2 mb-0">
          Loading older patch notes...
        </div>
      </div>
    </div>
    <div
      id="patch-note-skill-tooltip-portal"
      ref="tooltipElement"
      class="skill-tooltip patch-note-skill-tooltip"
      style="display: none"
      aria-hidden="true"
    />
    <div
      id="patch-note-item-tooltip-portal"
      ref="itemTooltipElement"
      class="skill-tooltip item-tooltip patch-note-item-tooltip"
      style="display: none"
      aria-hidden="true"
    />
  </section>
</template>

<style scoped>
.patch-notes-view {
  --patch-sticky-offset: 3rem;
  --patch-notes-start-cap: 20vh;
  --patch-section-scroll-margin: calc(var(--patch-sticky-offset) + 6.5rem);
  max-width: 100%;
  min-width: 0;
  overflow-x: clip;
}

.patch-search-container,
.patch-notes-container {
  max-width: 1100px;
}

.patch-search-sticky {
  position: sticky;
  top: var(--patch-sticky-offset);
  z-index: 10;
  padding: 0.6rem 0.8rem;
  margin: 0 -0.2rem;
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 0.75rem;
  background: rgba(22, 22, 22, 0.95);
  backdrop-filter: blur(2px);
}

.patch-search-controls {
  align-items: flex-end;
}

.patch-search-input-control {
  min-width: 10rem;
}

.patch-jump-top-button {
  min-width: 3.25rem;
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
  scroll-margin-top: var(--patch-section-scroll-margin);
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
  min-width: 0;
  overflow-wrap: break-word;
}

.patch-release {
  margin-left: 0.5rem;
  color: var(--bulma-text-weak, #9f9f9f);
  font-weight: 500;
  font-size: 0.85em;
}

.patch-meta {
  color: var(--bulma-text-weak, #9f9f9f);
  font-size: 0.9rem;
}

.context {
  margin: 0;
  overflow-x: hidden;
  line-height: 1.3rem;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  max-width: 100%;
  min-width: 0;
}

.patch-note-item-tooltip {
  z-index: 10000;
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

.patch-note-skill-tooltip .subskill-inline-block {
  margin: 10px 0 6px;
  padding: 4px 6px 6px;
  border: 1px solid rgba(255, 166, 87, 0.65);
  border-radius: 4px;
  background: transparent;
  text-align: center;
  min-inline-size: 0;
}

.patch-note-skill-tooltip .subskill-inline-legend {
  padding: 0 8px;
  margin: 0 auto;
  width: auto;
  float: none;
  text-align: center;
  background: #1a1a1a;
  line-height: 1.2;
}

.patch-note-skill-tooltip .subskill-inline-body {
  text-align: center;
  margin-top: 0;
  line-height: 1.35;
}

.patch-note-skill-tooltip .subskill-inline-block--inactive {
  opacity: 0.65;
  border-color: rgba(138, 138, 138, 0.55);
}

.patch-note-skill-tooltip .subskill-inline-block--inactive .subskill-inline-legend {
  color: #aaa;
}

:deep(.patch-skill-highlight),
:deep(.patch-item-highlight) {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}

:deep(.patch-skill-highlight:focus-visible),
:deep(.patch-item-highlight:focus-visible) {
  outline: 1px dashed rgba(72, 199, 116, 0.85);
  outline-offset: 2px;
}

mark {
  background: rgba(255, 221, 87, 0.5);
  color: inherit;
}

.result-header {
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}

.patch-open-full-button {
  flex-shrink: 0;
}

.markdown-content:deep(ul),
.markdown-content:deep(ol) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.markdown-content:deep(ul li),
.markdown-content:deep(ol li) {
  margin: 0 0;
  white-space: normal;
}

.markdown-content:deep(ul li > p),
.markdown-content:deep(ol li > p) {
  margin-top: 0;
  margin-bottom: 0;
  white-space: normal;
}

.markdown-content:deep(p),
.markdown-content:deep(li),
.markdown-content:deep(blockquote),
.markdown-content:deep(pre),
.markdown-content:deep(code) {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  max-width: 100%;
}

.markdown-content:deep(table) {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
}

.markdown-content:deep(pre),
.markdown-content:deep(img) {
  max-width: 100%;
}

@media screen and (max-width: 768px) {
  .patch-notes-view {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .patch-search-sticky {
    padding: 0.5rem 0.65rem;
    margin: 0;
  }

  .patch-search-container > .field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0.5rem;
    row-gap: 0.4rem;
  }

  .patch-search-sticky .label {
    grid-column: 1;
    grid-row: 1;
    margin-bottom: 0;
  }

  .patch-search-sticky .patch-search-controls {
    display: contents;
  }

  .patch-search-input-control {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    min-width: 0;
  }

  .patch-search-controls > .control:last-child {
    grid-column: 2;
    grid-row: 1;
    margin-right: 0;
    width: auto;
  }

  .patch-jump-top-button {
    width: auto;
    min-width: 0;
    white-space: nowrap;
  }

  .patch-summary,
  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  .patch-meta {
    flex-shrink: 0;
  }

  .patch-release {
    display: inline-block;
    margin-left: 0.35rem;
  }

  .markdown-content:deep(h1) {
    font-size: 1.25rem;
    margin: 0.5rem 0 0.35rem;
  }

  .markdown-content:deep(h2) {
    font-size: 1.1rem;
    margin: 0.45rem 0 0.3rem;
  }

  .markdown-content:deep(h3),
  .markdown-content:deep(h4) {
    font-size: 1rem;
    margin: 0.4rem 0 0.25rem;
  }

  .markdown-content:deep(ul),
  .markdown-content:deep(ol) {
    margin-left: 0.25rem;
  }

  .patch-note-skill-tooltip {
    max-width: calc(100vw - 1.25rem);
    min-width: 0;
    width: min(22rem, calc(100vw - 1.25rem));
  }

  .patch-note-skill-tooltip .tooltip-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .patch-note-skill-tooltip :deep(.tooltip-icon .image) {
    width: 48px;
    height: 48px;
  }
}
</style>
