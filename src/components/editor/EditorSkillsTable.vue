<script setup>
import { ref, computed } from 'vue';
import { getSkillIconHTML } from '@/shared/utils.js';
import SkillCardImage from '@/components/skills/SkillCardImage.vue';
import { parseSearchInput } from '@/skills/skill-table-search.js';

const props = defineProps({
  skills: { type: Array, default: () => [] },
  folderSeg: { type: String, default: '' },
});

const emit = defineEmits(['edit-index']);

const searchRaw = ref('');
const sortKey = ref(/** @type {'displayName'|'id'|'class'|'tabName'} */ ('displayName'));
const sortDir = ref(/** @type {1|-1} */ (1));

const parsedSearch = computed(() => parseSearchInput(searchRaw.value));

function editorHaystack(s) {
  return [s.id, s.displayName, s.class, s.tabName, s.parentSkillId]
    .filter((x) => x != null)
    .map((x) => String(x).toLowerCase())
    .join('\u0000');
}

function editorPlain(s) {
  return [s.id, s.displayName, s.class, s.tabName, s.parentSkillId]
    .filter((x) => x != null)
    .map((x) => String(x))
    .join(' ');
}

function editorMatches(s, p) {
  if (p.type === 'none' || p.type === 'regex_error') return true;
  if (p.type === 'substring') {
    return editorHaystack(s).includes(p.needle);
  }
  return p.re.test(editorPlain(s));
}

const sortHint = computed(() => (sortDir.value === 1 ? 'A-Z' : 'Z-A'));

/** @param {'displayName'|'id'|'class'|'tabName'} key */
function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1;
  } else {
    sortKey.value = key;
    sortDir.value = 1;
  }
}

const displayRows = computed(() => {
  const p = parsedSearch.value;
  let rows = props.skills.map((skill, index) => ({ skill, index }));
  if (p.type !== 'regex_error') {
    rows = rows.filter(({ skill }) => editorMatches(skill, p));
  }
  const key = sortKey.value;
  const dir = sortDir.value;
  rows = [...rows].sort((a, b) => {
    const va = String(a.skill[key] ?? '');
    const vb = String(b.skill[key] ?? '');
    if (key === 'id') {
      const na = Number(va);
      const nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === va && String(nb) === vb) {
        return (na - nb) * dir;
      }
    }
    const c = va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
    return c * dir;
  });
  return rows;
});

function iconMarkup(skill) {
  return getSkillIconHTML(skill.image || '', skill.class || '', 'is-48x48', props.folderSeg || null);
}
</script>

<template>
  <div class="editor-skills-table-root">
    <div class="field mb-3">
      <label class="label is-sr-only" for="editor-skills-search">Search skills</label>
      <input
        id="editor-skills-search"
        v-model="searchRaw"
        class="input"
        type="search"
        autocomplete="off"
        placeholder="Search id, name, class, tab (use /pattern/flags for regex)"
      />
      <p v-if="parsedSearch.type === 'regex_error'" class="help is-danger">
        Invalid regex: {{ parsedSearch.message }}
      </p>
    </div>

    <div class="editor-skills-table-scroll">
      <table class="table is-fullwidth is-hoverable is-striped editor-skills-table">
        <colgroup>
          <col class="editor-col-icon" />
          <col class="editor-col-id" />
          <col class="editor-col-name" />
          <col class="editor-col-class" />
          <col class="editor-col-tab" />
          <col class="editor-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>Icon</th>
            <th>
              <button type="button" class="button is-ghost p-0 editor-sort-btn" @click="toggleSort('id')">
                ID
                <span v-if="sortKey === 'id'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button
                type="button"
                class="button is-ghost p-0 editor-sort-btn"
                @click="toggleSort('displayName')"
              >
                Display name
                <span v-if="sortKey === 'displayName'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button type="button" class="button is-ghost p-0 editor-sort-btn" @click="toggleSort('class')">
                Class
                <span v-if="sortKey === 'class'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th>
              <button type="button" class="button is-ghost p-0 editor-sort-btn" @click="toggleSort('tabName')">
                Tab
                <span v-if="sortKey === 'tabName'" class="has-text-grey pl-1 is-size-7">{{ sortHint }}</span>
              </button>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="displayRows.length === 0">
            <td colspan="6" class="has-text-grey">No matching skills.</td>
          </tr>
          <template v-else>
            <tr v-for="row in displayRows" :key="row.index" :data-index="row.index">
              <td class="editor-td-icon">
                <SkillCardImage :icon-markup="iconMarkup(row.skill)" />
              </td>
              <td class="skill-id-cell editor-td-clip">{{ row.skill.id ?? '' }}</td>
              <td class="editor-td-clip">
                {{ row.skill.displayName != null ? row.skill.displayName : '' }}
                <span
                  v-if="row.skill.parentSkillId"
                  class="tag is-info is-light is-rounded is-size-7 ml-2"
                  :title="`Subskill of ${row.skill.parentSkillId}`"
                >
                  Subskill
                </span>
              </td>
              <td class="editor-td-clip">{{ row.skill.class ?? '' }}</td>
              <td class="editor-td-clip">{{ row.skill.tabName ?? '' }}</td>
              <td class="editor-td-action">
                <button
                  type="button"
                  class="button is-small is-primary is-inverted is-outlined"
                  @click="emit('edit-index', row.index)"
                >
                  Edit
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.editor-skills-table-root {
  width: 100%;
}

.editor-skills-table-scroll {
  overflow-x: auto;
}

.editor-skills-table {
  table-layout: fixed;
  width: 100%;
  min-width: 52rem;
}

.editor-col-icon {
  width: 4.5rem;
}
.editor-col-id {
  width: 5.5rem;
}
.editor-col-name {
  width: 16rem;
}
.editor-col-class {
  width: 11rem;
}
.editor-col-tab {
  width: 11rem;
}
.editor-col-action {
  width: 5.5rem;
}

.editor-td-clip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  max-width: 0;
}

.editor-td-icon {
  vertical-align: middle;
  overflow: hidden;
}

.editor-td-action {
  vertical-align: middle;
  text-align: right;
  white-space: nowrap;
  width: 5.5rem;
}

.editor-sort-btn {
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
</style>
