<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSkillIconHTML } from '@/shared/utils.js';
import SkillCardImage from './SkillCardImage.vue';
import {
  mergeHomeQuery,
  readHomeConditionFiltersFromRoute,
  SKILLS_ROUTE_NAME,
} from '@/skills/skills-index.js';
import { parseSearchInput } from '@/skills/skill-table-search.js';
import { itemRarityNameClass } from '@/items/item-tooltip.js';
import { PROC_TRIGGERS, procRowSources } from '@/items/item-procs.js';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  /** `tree_data` subfolder for icons */
  iconFolder: { type: String, default: null },
});

const route = useRoute();
const router = useRouter();

const searchRaw = ref('');
const sortKey = ref(/** @type {'skill'|'chance'|'condition'|'level'|'source'} */ ('skill'));
const sortDir = ref(/** @type {1|-1} */ (1));
const openDropdown = ref(/** @type {null | 'conditions'} */ (null));

const parsedSearch = computed(() => parseSearchInput(searchRaw.value));

const sortHint = computed(() => (sortDir.value === 1 ? 'A-Z' : 'Z-A'));

const selectedConditions = computed(() => readHomeConditionFiltersFromRoute(router));

const uniqueConditions = computed(() => {
  const seen = new Set();
  for (const row of props.rows) {
    const cond = row?.condition != null ? String(row.condition).trim() : '';
    if (cond) seen.add(cond);
  }
  const known = PROC_TRIGGERS.filter((name) => seen.has(name));
  const extra = [...seen]
    .filter((name) => !PROC_TRIGGERS.includes(name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [...known, ...extra];
});

const conditionTriggerSummary = computed(() => {
  const sel = selectedConditions.value;
  if (!sel.length) return 'All conditions';
  if (sel.length <= 2) return sel.join(', ');
  return `${sel.length} conditions`;
});

function toggleDropdown() {
  openDropdown.value = openDropdown.value === 'conditions' ? null : 'conditions';
}

function closeDropdowns() {
  openDropdown.value = null;
}

/**
 * @param {Event} e
 */
function onGlobalPointerDown(e) {
  const el = /** @type {HTMLElement | null} */ (e.target);
  if (!el?.closest) return;
  if (el.closest('.skills-filter-dd')) return;
  openDropdown.value = null;
}

/**
 * @param {KeyboardEvent} e
 */
function onGlobalKeydown(e) {
  if (e.key === 'Escape') openDropdown.value = null;
}

onMounted(() => document.addEventListener('pointerdown', onGlobalPointerDown, true));
onUnmounted(() => document.removeEventListener('pointerdown', onGlobalPointerDown, true));
onMounted(() => document.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown));

/**
 * @param {string} value
 */
function toggleConditionOption(value) {
  const set = new Set(readHomeConditionFiltersFromRoute(router));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  mergeHomeQuery(router, { conditions: [...set] });
}

function clearConditionFilters() {
  closeDropdowns();
  mergeHomeQuery(router, { conditions: [] });
}

/**
 * @param {object} row
 * @returns {string}
 */
function rowHaystack(row) {
  const sourceText = procRowSources(row)
    .map((src) => src.sourceLabel)
    .join(' ');
  return [row.skillName, row.chanceLabel, row.condition, row.level, sourceText]
    .filter((x) => x != null)
    .map((x) => String(x).toLowerCase())
    .join(' ');
}

/**
 * @param {object} row
 * @returns {string}
 */
function rowPlain(row) {
  const sourceText = procRowSources(row)
    .map((src) => src.sourceLabel)
    .join(' ');
  return [row.skillName, row.chanceLabel, row.condition, row.level, sourceText]
    .filter((x) => x != null)
    .map((x) => String(x))
    .join(' ');
}

const filteredRows = computed(() => {
  const parsed = parsedSearch.value;
  const condSel = selectedConditions.value;
  let list = Array.isArray(props.rows) ? [...props.rows] : [];
  if (condSel.length) {
    const allowed = new Set(condSel);
    list = list.filter((row) => allowed.has(String(row.condition ?? '')));
  }
  if (parsed.type === 'substring') {
    list = list.filter((row) => rowHaystack(row).includes(parsed.needle));
  } else if (parsed.type === 'regex') {
    list = list.filter((row) => parsed.re.test(rowPlain(row)));
  }
  const key = sortKey.value;
  const dir = sortDir.value;
  list.sort((a, b) => {
    if (key === 'chance') {
      const c = (Number(a.chance) || 0) - (Number(b.chance) || 0);
      return c * dir;
    }
    if (key === 'level') {
      const c = (Number(a.level) || 0) - (Number(b.level) || 0);
      return c * dir;
    }
    const va =
      key === 'condition'
        ? String(a.condition ?? '')
        : key === 'source'
          ? procRowSources(a)
              .map((src) => src.sourceLabel)
              .join('\n')
          : String(a.skillName ?? '');
    const vb =
      key === 'condition'
        ? String(b.condition ?? '')
        : key === 'source'
          ? procRowSources(b)
              .map((src) => src.sourceLabel)
              .join('\n')
          : String(b.skillName ?? '');
    return va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true }) * dir;
  });
  return list;
});

/**
 * @param {'skill'|'chance'|'condition'|'level'|'source'} key
 */
function toggleSortColumn(key) {
  if (sortKey.value === key) {
    sortDir.value = /** @type {1|-1} */ (sortDir.value === 1 ? -1 : 1);
    return;
  }
  sortKey.value = key;
  sortDir.value = 1;
}

/**
 * @param {object} row
 */
function skillQuery(row) {
  const q = { ...route.query, skill: String(row.skillId), view: 'procs' };
  const level = Math.max(1, Number(row.level) || 1);
  if (level === 1) delete q.lvl;
  else q.lvl = String(level);
  delete q.slvl;
  return q;
}

/**
 * @param {object} row
 */
function iconMarkup(row) {
  return getSkillIconHTML(row.skillImage, row.skillClass, 'is-48x48', props.iconFolder);
}

/**
 * @param {object} row
 */
function sourceClass(source) {
  return ['skills-td-link', 'js-proc-source', itemRarityNameClass(source.sourceRarity)];
}

/**
 * @param {object} source
 * @param {number} index
 */
function sourceKey(source, index) {
  return [source.sourceKind, source.itemDefId || '', source.setId || '', source.setRequired ?? '', index].join('|');
}
</script>

<template>
  <div class="skills-browse-root">
    <div class="field is-grouped is-grouped-multiline is-align-items-flex-end mb-4 skills-browse-toolbar">
      <div class="control is-expanded" style="flex: 1; min-width: 12rem">
        <label class="label is-sr-only" for="procs-search-input">Search procs</label>
        <input
          id="procs-search-input"
          v-model="searchRaw"
          class="input"
          type="search"
          autocomplete="off"
          placeholder="Search skill, chance, condition, source"
        />
        <p v-if="parsedSearch.type === 'regex_error'" class="help is-danger">
          Invalid regex: {{ parsedSearch.message }}
        </p>
      </div>
    </div>

    <div v-if="uniqueConditions.length" class="skills-filter-panel mb-2">
      <div class="field is-grouped is-grouped-multiline is-align-items-flex-end skills-filter-dd-row">
        <div class="control">
          <div class="skills-filter-dd-row-inner">
            <div class="dropdown skills-filter-dd" :class="{ 'is-active': openDropdown === 'conditions' }">
              <div class="dropdown-trigger">
                <button
                  type="button"
                  class="button skills-dd-trigger"
                  aria-haspopup="true"
                  aria-label="Filter proc conditions"
                  :aria-expanded="openDropdown === 'conditions'"
                  @click.stop="toggleDropdown"
                >
                  <span class="skills-dd-trigger-text">{{ conditionTriggerSummary }}</span>
                  <span class="icon is-small">
                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                  </span>
                </button>
              </div>
              <div class="dropdown-menu" role="menu">
                <div class="dropdown-content skills-dd-body">
                  <div class="skills-dd-scroll">
                    <label
                      v-for="cond in uniqueConditions"
                      :key="'dd-cond-' + cond"
                      class="dropdown-item skills-dd-checkbox-label"
                      :class="{ 'is-selected': selectedConditions.includes(cond) }"
                      @click.prevent="toggleConditionOption(cond)"
                    >
                      <input
                        type="checkbox"
                        class="mr-2"
                        :checked="selectedConditions.includes(cond)"
                        tabindex="-1"
                        aria-hidden="true"
                      />
                      <span>{{ cond }}</span>
                    </label>
                  </div>
                  <div class="skills-dd-footer">
                    <hr class="dropdown-divider skills-dd-footer-divider" />
                    <div class="px-2 py-2">
                      <button
                        type="button"
                        class="button is-small is-danger is-outlined is-fullwidth"
                        @click="clearConditionFilters"
                      >
                        Clear condition filter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="skills-table-container">
      <table class="table is-hoverable is-fullwidth skills-browse-table skills-procs-table">
        <colgroup>
          <col class="skills-col-w-icon" />
          <col class="skills-col-w-name" />
          <col class="skills-col-w-chance" />
          <col class="skills-col-w-condition" />
          <col class="skills-col-w-level" />
          <col class="skills-col-w-source" />
        </colgroup>
        <thead>
          <tr>
            <th class="skills-col-icon">Image</th>
            <th>
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('skill')">
                Skill
                <span v-if="sortKey === 'skill'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('chance')">
                Chance
                <span v-if="sortKey === 'chance'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th class="is-hidden-mobile">
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('condition')">
                Condition
                <span v-if="sortKey === 'condition'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('level')">
                Level
                <span v-if="sortKey === 'level'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('source')">
                Source
                <span v-if="sortKey === 'source'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredRows.length === 0">
            <td colspan="6" class="has-text-grey">No matching procs.</td>
          </tr>
          <tr v-for="row in filteredRows" :key="row.rowKey">
            <td class="skills-col-icon skills-td-clip">
              <SkillCardImage :icon-markup="iconMarkup(row)" />
            </td>
            <td class="skills-td-clip">
              <RouterLink
                :to="{ name: SKILLS_ROUTE_NAME, query: skillQuery(row) }"
                class="has-text-weight-medium skills-td-link js-proc-skill"
                :data-proc-skill-id="row.skillId"
                :data-proc-level="String(row.level)"
              >
                {{ row.skillName }}
              </RouterLink>
            </td>
            <td>{{ row.chanceLabel }}%</td>
            <td class="is-hidden-mobile skills-td-clip">{{ row.condition }}</td>
            <td>{{ row.level }}</td>
            <td class="skills-td-sources">
              <span
                v-for="(source, index) in procRowSources(row)"
                :key="sourceKey(source, index)"
                :class="sourceClass(source)"
                tabindex="0"
                :data-proc-item-id="source.itemDefId || ''"
                :data-proc-set-id="source.setId || ''"
                :data-proc-set-required="source.setRequired != null ? String(source.setRequired) : ''"
              >
                {{ source.sourceLabel }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.skills-browse-toolbar {
  flex-wrap: wrap;
}

.skills-filter-dd-row-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.skills-dd-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 18rem;
  max-width: min(40rem, 100%);
}

.skills-dd-trigger-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.skills-filter-dd {
  position: relative;
}

.skills-filter-dd.is-active {
  z-index: 30;
}

.skills-filter-dd .dropdown-menu {
  min-width: max(100%, 18rem);
  width: max-content;
  max-width: min(92vw, 44rem);
}

.skills-filter-dd .dropdown-content.skills-dd-body {
  display: flex;
  flex-direction: column;
  max-height: 50vh;
  padding: 0;
  overflow: hidden;
}

.skills-dd-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
}

.skills-dd-footer {
  flex: 0 0 auto;
}

.skills-dd-footer-divider {
  margin: 0;
}

.skills-dd-checkbox-label {
  cursor: pointer;
  white-space: nowrap;
  margin: 0.15rem 0.5rem;
  border-radius: 0.35rem;
  border: 1px solid hsl(0, 0%, 30%);
  color: #b5b5b5;
}

.skills-dd-checkbox-label.is-selected {
  border-color: hsla(153, 47%, 49%, 0.9);
  background: hsla(153, 47%, 49%, 0.16);
  color: #fff;
}

.skills-table-container {
  overflow-x: auto;
}

.skills-procs-table {
  font-size: inherit;
  table-layout: fixed;
  width: 100%;
  min-width: 56rem;
}

.skills-col-w-icon {
  width: 4.5rem;
}
.skills-col-w-name {
  width: 13rem;
}
.skills-col-w-chance {
  width: 7rem;
}
.skills-col-w-condition {
  width: 11rem;
}
.skills-col-w-level {
  width: 6rem;
}
.skills-col-w-source {
  width: 18rem;
}

.skills-col-icon {
  vertical-align: top;
}

.skills-procs-table td {
  vertical-align: top;
}

.skills-td-clip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: top;
  max-width: 0;
}

.skills-td-sources {
  overflow: hidden;
  vertical-align: top;
  max-width: 0;
}

.skills-td-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.skills-procs-table .js-proc-source {
  font-weight: 600;
}

.skills-sort-btn {
  height: auto;
  font-weight: 600;
  text-decoration: none;
  color: inherit;
}

.is-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media screen and (max-width: 768px) {
  .skills-procs-table {
    font-size: 0.875rem;
    min-width: 0;
  }
}
</style>
