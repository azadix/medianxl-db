<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSkillIconHTML } from '../../shared/utils.js';
import SkillCardImage from './SkillCardImage.vue';
import {
  mergeHomeQuery,
  readHomeFilterFromRoute,
  readHomeClassFiltersFromRoute,
  readHomeTagFiltersFromRoute,
  readClassTagJoinFromRoute,
  SKILLS_ROUTE_NAME,
} from '../../skills/skillsIndexRoute.js';
import { parseSearchInput, skillMatchesSearch } from '../../skills/skillTableSearch.js';

const props = defineProps({
  skills: { type: Array, default: () => [] },
  /** `tree_data` subfolder for icons */
  iconFolder: { type: String, default: null },
});

const route = useRoute();
const router = useRouter();

const searchRaw = ref('');
const sortKey = ref(/** @type {'name'|'class'|'tab'} */ ('name'));
const sortDir = ref(/** @type {1|-1} */ (1));

const parsedSearch = computed(() => parseSearchInput(searchRaw.value));

const filterState = computed(() => readHomeFilterFromRoute(router));

const selectedClasses = computed(() => readHomeClassFiltersFromRoute(router));
const selectedTags = computed(() => readHomeTagFiltersFromRoute(router));
const classTagJoin = computed(() => readClassTagJoinFromRoute(router));

const uniqueClasses = computed(() => {
  const set = new Set();
  for (const s of props.skills) {
    const c = s.class != null ? String(s.class) : '';
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
});

const uniqueTags = computed(() => {
  const set = new Set();
  for (const s of props.skills) {
    if (!Array.isArray(s.tags)) continue;
    for (const t of s.tags) {
      const v = t != null ? String(t).trim() : '';
      if (v) set.add(v);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
});

const filterButtonClass = computed(() => {
  switch (filterState.value) {
    case 'with_details':
      return 'is-primary';
    case 'without_details':
      return 'is-success';
    default:
      return 'is-info';
  }
});

const filterButtonLabel = computed(() => {
  switch (filterState.value) {
    case 'with_details':
      return 'Show only with details';
    case 'without_details':
      return 'Show only without details';
    default:
      return 'Show all';
  }
});

const openDropdown = ref(/** @type {null | 'class' | 'tags'} */ (null));
const showFilterHelpModal = ref(false);

function toggleDropdown(which) {
  openDropdown.value = openDropdown.value === which ? null : which;
}

function closeDropdowns() {
  openDropdown.value = null;
}

function openFilterHelp() {
  showFilterHelpModal.value = true;
}

function closeFilterHelp() {
  showFilterHelpModal.value = false;
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
  if (e.key === 'Escape') {
    showFilterHelpModal.value = false;
    openDropdown.value = null;
  }
}

onMounted(() => document.addEventListener('pointerdown', onGlobalPointerDown, true));
onUnmounted(() => document.removeEventListener('pointerdown', onGlobalPointerDown, true));
onMounted(() => document.addEventListener('keydown', onGlobalKeydown));
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown));

const classTriggerSummary = computed(() => {
  const sel = selectedClasses.value;
  if (!sel.length) return 'All classes';
  if (sel.length <= 2) return sel.join(', ');
  return `${sel.length} classes`;
});

const tagTriggerSummary = computed(() => {
  const sel = selectedTags.value;
  if (!sel.length) return 'All tags';
  if (sel.length <= 2) return sel.join(', ');
  return `${sel.length} tags`;
});

/**
 * @param {string} value
 */
function toggleClassOption(value) {
  const set = new Set(readHomeClassFiltersFromRoute(router));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  mergeHomeQuery(router, { classes: [...set], tabs: [] });
}

/**
 * @param {string} value
 */
function toggleTagOption(value) {
  const set = new Set(readHomeTagFiltersFromRoute(router));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  mergeHomeQuery(router, { tags: [...set], tabs: [] });
}

/**
 * @param {Event} e
 */
function onJoinChange(e) {
  const el = /** @type {HTMLSelectElement} */ (e.target);
  const v = el.value === 'or' ? 'or' : 'and';
  mergeHomeQuery(router, {
    filterLogic: v === 'and' ? '' : 'or',
  });
}

function clearClassFilters() {
  closeDropdowns();
  mergeHomeQuery(router, { classes: [] });
}

function clearTagFilters() {
  closeDropdowns();
  mergeHomeQuery(router, { tags: [], tabs: [] });
}

function cycleFilter() {
  let next;
  switch (filterState.value) {
    case 'all':
      next = 'with_details';
      break;
    case 'with_details':
      next = 'without_details';
      break;
    case 'without_details':
      next = 'all';
      break;
    default:
      next = 'all';
  }
  mergeHomeQuery(router, { filter: next === 'all' ? '' : next });
}

function homeQueryForSkill(skillId) {
  const q = { ...route.query, skill: String(skillId) };
  const f = q.filter;
  const fs = Array.isArray(f) ? f[0] : f;
  if (!fs || fs === 'all') delete q.filter;
  return q;
}

const sortHint = computed(() => (sortDir.value === 1 ? 'A-Z' : 'Z-A'));

/**
 * @param {object} skill
 * @param {'name'|'class'|'tab'} key
 */
function sortComparableForSkill(skill, key) {
  if (key === 'tab') return String(skill.tabName ?? '');
  return String(skill[key] ?? '');
}

/** @param {'name'|'class'|'tab'} key */
function toggleSortColumn(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = key;
    sortDir.value = 1;
  }
}

const filteredSkills = computed(() => {
  const parsed = parsedSearch.value;
  const classSel = selectedClasses.value;
  const tagSel = selectedTags.value;
  let rows = props.skills.filter((s) => {
    if (filterState.value === 'all') return true;
    const has = Boolean(s.hasDetails);
    if (filterState.value === 'with_details') return has;
    return !has;
  });
  const join = classTagJoin.value;
  const matchesClass = (s) => !classSel.length || classSel.includes(String(s.class ?? ''));
  const skillTags = (s) =>
    Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const matchesTag = (s) => {
    if (!tagSel.length) return true;
    const tags = skillTags(s);
    if (join === 'and') {
      return tagSel.every((t) => tags.includes(t));
    }
    return tagSel.some((t) => tags.includes(t));
  };
  if (!classSel.length && !tagSel.length) {
    // no class/tag constraint
  } else if (classSel.length && !tagSel.length) {
    rows = rows.filter(matchesClass);
  } else if (!classSel.length && tagSel.length) {
    rows = rows.filter(matchesTag);
  } else {
    if (join === 'and') {
      rows = rows.filter((s) => matchesClass(s) && matchesTag(s));
    } else {
      rows = rows.filter((s) => matchesClass(s) || matchesTag(s));
    }
  }
  if (parsed.type !== 'regex_error') {
    rows = rows.filter((s) => skillMatchesSearch(s, parsed));
  }
  const key = sortKey.value;
  const dir = sortDir.value;
  rows = [...rows].sort((a, b) => {
    const va = sortComparableForSkill(a, key);
    const vb = sortComparableForSkill(b, key);
    const c = va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
    return c * dir;
  });
  return rows;
});

function iconMarkup(skill) {
  return getSkillIconHTML(skill.image, skill.class, 'is-48x48', props.iconFolder);
}
</script>

<template>
  <div class="skills-browse-root">
    <div class="field is-grouped is-grouped-multiline is-align-items-flex-end mb-4 skills-browse-toolbar">
      <div class="control">
        <button
          type="button"
          class="button is-outlined filter-toggle"
          :class="filterButtonClass"
          @click="cycleFilter"
        >
          {{ filterButtonLabel }}
        </button>
      </div>
      <div class="control is-expanded" style="flex: 1; min-width: 12rem">
        <label class="label is-sr-only" for="skills-search-input">Search skills</label>
        <input
          id="skills-search-input"
          v-model="searchRaw"
          class="input"
          type="search"
          autocomplete="off"
          placeholder="Search name, tags, class, tab"
        />
        <p v-if="parsedSearch.type === 'regex_error'" class="help is-danger">
          Invalid regex: {{ parsedSearch.message }}
        </p>
      </div>
    </div>

    <div
      v-if="uniqueClasses.length || uniqueTags.length"
      class="skills-filter-panel box py-3 px-3 mb-4"
    >
      <div class="field is-grouped is-grouped-multiline is-align-items-flex-end skills-filter-dd-row">
        <div v-if="uniqueClasses.length" class="control">
          <label id="skills-dd-class-label" class="label">Class</label>
          <div class="skills-filter-dd-row-inner">
            <div class="dropdown skills-filter-dd" :class="{ 'is-active': openDropdown === 'class' }">
              <div class="dropdown-trigger">
                <button
                  type="button"
                  class="button skills-dd-trigger"
                  aria-haspopup="true"
                  aria-labelledby="skills-dd-class-label"
                  :aria-expanded="openDropdown === 'class'"
                  @click.stop="toggleDropdown('class')"
                >
                  <span class="skills-dd-trigger-text">{{ classTriggerSummary }}</span>
                  <span class="icon is-small">
                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                  </span>
                </button>
              </div>
              <div class="dropdown-menu" role="menu">
                <div class="dropdown-content skills-dd-body">
                  <div class="skills-dd-scroll">
                    <label
                      v-for="c in uniqueClasses"
                      :key="'dd-cls-' + c"
                      class="dropdown-item skills-dd-checkbox-label"
                      :class="{ 'is-selected': selectedClasses.includes(c) }"
                      @click.prevent="toggleClassOption(c)"
                    >
                      <input
                        type="checkbox"
                        class="mr-2"
                        :checked="selectedClasses.includes(c)"
                        tabindex="-1"
                        aria-hidden="true"
                      />
                      <span>{{ c }}</span>
                    </label>
                  </div>
                  <div class="skills-dd-footer">
                    <hr class="dropdown-divider skills-dd-footer-divider" />
                    <div class="px-2 py-2">
                      <button type="button" class="button is-small is-danger is-outlined is-fullwidth" @click="clearClassFilters">
                        Clear class filter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="uniqueTags.length" class="control">
          <label id="skills-dd-tags-label" class="label">Tags</label>
          <div class="skills-filter-dd-row-inner">
            <div class="dropdown skills-filter-dd" :class="{ 'is-active': openDropdown === 'tags' }">
              <div class="dropdown-trigger">
                <button
                  type="button"
                  class="button skills-dd-trigger"
                  aria-haspopup="true"
                  aria-labelledby="skills-dd-tags-label"
                  :aria-expanded="openDropdown === 'tags'"
                  @click.stop="toggleDropdown('tags')"
                >
                  <span class="skills-dd-trigger-text">{{ tagTriggerSummary }}</span>
                  <span class="icon is-small">
                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                  </span>
                </button>
              </div>
              <div class="dropdown-menu" role="menu">
                <div class="dropdown-content skills-dd-body">
                  <div class="skills-dd-scroll">
                    <label
                      v-for="t in uniqueTags"
                      :key="'dd-tag-' + t"
                      class="dropdown-item skills-dd-checkbox-label"
                      :class="{ 'is-selected': selectedTags.includes(t) }"
                      @click.prevent="toggleTagOption(t)"
                    >
                      <input
                        type="checkbox"
                        class="mr-2"
                        :checked="selectedTags.includes(t)"
                        tabindex="-1"
                        aria-hidden="true"
                      />
                      <span>{{ t }}</span>
                    </label>
                  </div>
                  <div class="skills-dd-footer">
                    <hr class="dropdown-divider skills-dd-footer-divider" />
                    <div class="px-2 py-2">
                      <button type="button" class="button is-small is-danger is-outlined is-fullwidth" @click="clearTagFilters">
                        Clear tag filter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="uniqueClasses.length && uniqueTags.length" class="control">
          <label class="label" for="skills-filter-join">Combine class and tags</label>
          <div class="select">
            <select id="skills-filter-join" :value="classTagJoin" @change="onJoinChange">
              <option value="and">AND (match both)</option>
              <option value="or">OR (match either)</option>
            </select>
          </div>
        </div>
        <div class="control filter-help-control">
          <label class="label is-invisible" aria-hidden="true">Help</label>
          <button
            id="skillsFilterHelpBtn"
            type="button"
            class="button is-info is-outlined"
            title="Skill filters help"
            aria-label="Skill filters help"
            @click="openFilterHelp"
          >
            <span>?</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="showFilterHelpModal" class="modal is-active skills-filter-help-overlay">
      <div class="modal-background" @click="closeFilterHelp"></div>
      <div class="modal-card skills-filter-help-card">
        <header class="modal-card-head px-4">
          <p class="modal-card-title">Skill Filters Help</p>
        </header>
        <section class="modal-card-body p-4">
          <div class="content">
            <p>Open class or tag dropdowns to select filters.</p>
            <ul>
              <li>Class filter matches skills whose class is in the selected class list.</li>
              <li>Tag filter in AND mode requires all selected tags on a skill.</li>
              <li>Tag filter in OR mode requires at least one selected tag on a skill.</li>
              <li>
                When both class and tag filters have selections, Combine controls whether both groups must match (AND)
                or either group can match (OR).
              </li>
            </ul>
          </div>
        </section>
        <footer class="modal-card-foot p-4">
          <button type="button" class="button is-primary" @click="closeFilterHelp">Close</button>
        </footer>
      </div>
    </div>

    <div class="skills-table-container">
      <table class="table is-hoverable is-fullwidth skills-browse-table">
        <colgroup>
          <col class="skills-col-w-icon" />
          <col class="skills-col-w-name" />
          <col class="skills-col-w-tags" />
          <col class="skills-col-w-class" />
          <col class="skills-col-w-tab" />
        </colgroup>
        <thead>
          <tr>
            <th class="skills-col-icon">Image</th>
            <th class="skills-col-name">
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('name')">
                Name
                <span v-if="sortKey === 'name'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th class="skills-col-tags is-hidden-mobile">Tags</th>
            <th class="is-hidden-mobile">
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('class')">
                Class
                <span v-if="sortKey === 'class'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th class="is-hidden-mobile">
              <button type="button" class="button is-ghost p-0 skills-sort-btn" @click="toggleSortColumn('tab')">
                Tab
                <span v-if="sortKey === 'tab'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredSkills.length === 0">
            <td colspan="5" class="has-text-grey">No matching skills.</td>
          </tr>
          <template v-else>
            <tr v-for="skill in filteredSkills" :key="skill.id" :data-skill-id="skill.id">
              <td class="skills-col-icon skills-td-clip">
                <SkillCardImage :icon-markup="iconMarkup(skill)" />
              </td>
              <td class="skills-td-clip">
                <RouterLink
                  v-if="skill.hasDetails"
                  :to="{ name: SKILLS_ROUTE_NAME, query: homeQueryForSkill(skill.id) }"
                  class="has-text-weight-medium skills-td-link"
                >
                  {{ skill.name }}
                </RouterLink>
                <span v-else class="skills-td-link">{{ skill.name }}</span>
              </td>
              <td class="skills-col-tags is-hidden-mobile skills-td-tags">
                <div v-if="skill.tags && skill.tags.length" class="tags">
                  <span v-for="t in skill.tags" :key="t" class="tag">{{ t }}</span>
                </div>
              </td>
              <td class="is-hidden-mobile skills-td-clip">{{ skill.class }}</td>
              <td class="is-hidden-mobile skills-td-clip">{{ skill.tabName }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.skills-browse-toolbar {
  flex-wrap: wrap;
}

.skills-filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.skills-filter-dd-row-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.filter-help-control {
  margin-left: auto;
}

.skills-filter-help-overlay {
  z-index: 10000;
}

.skills-filter-help-card {
  min-width: 50%;
  max-height: 80vh;
}

.skills-filter-help-card .modal-card-body {
  overflow-y: auto;
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

.skills-browse-table {
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
.skills-col-w-tags {
  width: 22rem;
}
.skills-col-w-class {
  width: 11rem;
}
.skills-col-w-tab {
  width: 11rem;
}

.skills-col-icon {
  vertical-align: middle;
}

.skills-td-clip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  max-width: 0;
}

.skills-td-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-td-tags {
  overflow: hidden;
  vertical-align: middle;
  max-width: 0;
}

.skills-td-tags :deep(.tags) {
  max-height: 4.5rem;
  overflow-y: auto;
  flex-wrap: wrap;
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
  .skills-browse-table {
    font-size: 0.875rem;
  }

  .skills-browse-table :deep(td),
  .skills-browse-table :deep(th) {
    padding: 0.5rem 0.25rem;
  }

  .skills-browse-table :deep(.tags) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
  }
}
</style>
