<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSkillIconHTML } from '../../shared/utils.js';
import SkillCardImage from './SkillCardImage.vue';
import { mergeHomeQuery, readHomeFilterFromRoute } from '../../skills/skillsIndexRoute.js';
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

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = key;
    sortDir.value = 1;
  }
}

const sortHint = computed(() => (sortDir.value === 1 ? 'asc' : 'desc'));

const filteredSkills = computed(() => {
  const parsed = parsedSearch.value;
  let rows = props.skills.filter((s) => {
    if (filterState.value === 'all') return true;
    const has = Boolean(s.hasDetails);
    if (filterState.value === 'with_details') return has;
    return !has;
  });
  if (parsed.type !== 'regex_error') {
    rows = rows.filter((s) => skillMatchesSearch(s, parsed));
  }
  const dir = sortDir.value;
  const key = sortKey.value;
  rows = [...rows].sort((a, b) => {
    const va = String(a[key] ?? '');
    const vb = String(b[key] ?? '');
    const c = va.localeCompare(vb, undefined, { sensitivity: 'base' });
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
          placeholder="Search name, tags, class, tab (use /pattern/flags for regex)"
        />
        <p v-if="parsedSearch.type === 'regex_error'" class="help is-danger">
          Invalid regex: {{ parsedSearch.message }}
        </p>
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
              <button type="button" class="button is-ghost is-small p-0 skills-sort-btn" @click="toggleSort('name')">
                Name
                <span v-if="sortKey === 'name'" class="has-text-grey is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th class="skills-col-tags is-hidden-mobile">Tags</th>
            <th class="is-hidden-mobile">
              <button type="button" class="button is-ghost is-small p-0 skills-sort-btn" @click="toggleSort('class')">
                Class
                <span v-if="sortKey === 'class'" class="has-text-grey is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th class="is-hidden-mobile">
              <button type="button" class="button is-ghost is-small p-0 skills-sort-btn" @click="toggleSort('tab')">
                Tab
                <span v-if="sortKey === 'tab'" class="has-text-grey is-size-7">{{ sortHint }}</span>
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
                  :to="{ name: 'home', query: homeQueryForSkill(skill.id) }"
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
