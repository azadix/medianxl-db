<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getPlannerCharacterStatDefs } from '../../../character/planner-stats-config.js';
import { getCharacterInstance } from '../../../character/character-state.js';
import { setupPlannerStatRowTooltips, applyPlannerStatInput } from '../../../character/planner-stats-panel.js';
import { getFileSkillStore } from '../../../tree/skill-data-store.js';
import { usePlannerSkillReferencedStats } from '../../composables/usePlannerSkillReferencedStats.js';

const panelRoot = ref(null);
/** @type {import('vue').Ref<{ key: string, label: string, min: number|null, max: number|null, allowNegative?: boolean, default?: number, alwaysVisible?: boolean, sortOrder?: number }[]>} */
const statDefs = ref(getPlannerCharacterStatDefs());
/** @type {import('vue').Ref<Record<string, number>>} */
const stats = ref({});
/** Stat row whose input is focused (keeps row visible while editing down to default). */
const activeStatKey = ref(/** @type {string|null} */ (null));
/** Bump to force recompute of non-reactive derived data (skill store load, skill point changes). */
const refreshTick = ref(0);
const statFilter = ref('all');

const statFilters = [
  { id: 'all', label: 'All' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'resists', label: 'Resists' },
  { id: 'damage', label: 'Damage' },
  { id: 'misc', label: 'Misc' },
];

const { skillReferencedStatKeys } = usePlannerSkillReferencedStats(refreshTick);

/**
 * @param {{ default?: number }} def
 */
function defaultStatValue(def) {
  return def.default != null && !Number.isNaN(def.default) ? def.default : 0;
}

const visibleStatDefs = computed(() => {
  return statDefs.value.filter((def) => {
    if (def.key === 'life' || def.key === 'mana') return false;
    if (def.alwaysVisible) return true;
    if (skillReferencedStatKeys.value.has(def.key)) return true;
    if (activeStatKey.value === def.key) return true;
    const raw = stats.value[def.key];
    let v = raw != null && raw !== '' ? Number(raw) : 0;
    if (Number.isNaN(v)) v = 0;
    return v !== defaultStatValue(def);
  });
});

const vitals = computed(() => [
  { key: 'life', label: 'Life', value: Math.floor(Number(stats.value.life) || 0) },
  { key: 'mana', label: 'Mana', value: Math.floor(Number(stats.value.mana) || 0) },
]);

function statCategory(def) {
  const key = String(def.key || '').toLowerCase();
  if (['strength', 'dexterity', 'energy', 'vitality'].includes(key)) return 'attributes';
  if (key.includes('resistance') || key.endsWith('_res')) return 'resists';
  if (key.includes('damage') || key.includes('spell') || key.includes('attack')) return 'damage';
  return 'misc';
}

const filteredStatDefs = computed(() => {
  if (statFilter.value === 'all') return visibleStatDefs.value;
  return visibleStatDefs.value.filter((def) => statCategory(def) === statFilter.value);
});

/** @param {{ allowNegative?: boolean, min: number|null }} def */
function statInputMin(def) {
  if (def.allowNegative) {
    return def.min != null && Number.isFinite(def.min) ? def.min : undefined;
  }
  return def.min != null && Number.isFinite(def.min) ? Math.max(0, def.min) : 0;
}

/** @param {{ max: number|null }} def */
function statInputMax(def) {
  return def.max != null && Number.isFinite(def.max) ? def.max : undefined;
}

function pullStats() {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.classList.contains('planner-stat-input')) {
    return;
  }
  const ch = getCharacterInstance();
  stats.value = ch ? { ...ch.getAllStats() } : {};
}

function onStatInput(statKey, e) {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.readOnly) return;
  applyPlannerStatInput(statKey, t.value);
  const ch = getCharacterInstance();
  if (ch) {
    stats.value = { ...ch.getAllStats() };
  }
}

/** @param {string} key */
function onStatRowFocus(key) {
  activeStatKey.value = key;
}

/** @param {string} key */
function onStatRowBlur(key) {
  if (activeStatKey.value === key) {
    activeStatKey.value = null;
  }
}

const refreshHandler = () => {
  refreshTick.value++;
  statDefs.value = getPlannerCharacterStatDefs();
  pullStats();
};

onMounted(() => {
  refreshHandler();
  // Skill data store is async and not reactive; poll briefly so we refresh once it becomes available.
  let tries = 0;
  const maxTries = 80; // ~8s @ 100ms
  const pollStoreReady = () => {
    if (getFileSkillStore()) {
      refreshHandler();
      return;
    }
    tries++;
    if (tries >= maxTries) return;
    window.setTimeout(pollStoreReady, 100);
  };
  pollStoreReady();
  nextTick(() => {
    if (panelRoot.value) {
      setupPlannerStatRowTooltips(panelRoot.value);
    }
  });
  window.addEventListener('characterStatsChanged', refreshHandler);
  window.addEventListener('plannerStatsPanelRefresh', refreshHandler);
  window.addEventListener('questCompletionChanged', refreshHandler);
  window.addEventListener('skillPointsChanged', refreshHandler);
});

onUnmounted(() => {
  window.removeEventListener('characterStatsChanged', refreshHandler);
  window.removeEventListener('plannerStatsPanelRefresh', refreshHandler);
  window.removeEventListener('questCompletionChanged', refreshHandler);
  window.removeEventListener('skillPointsChanged', refreshHandler);
});
</script>

<template>
  <div id="sidebarPaneStats">
    <div class="character-sheet-body planner-stats-layout">
      <section class="planner-card planner-vitals-card">
        <div class="planner-vitals-grid">
          <div v-for="vital in vitals" :key="vital.key" class="planner-vital-tile" :class="'is-' + vital.key">
            <span>{{ vital.label }}</span>
            <strong>{{ vital.value }}</strong>
          </div>
        </div>
      </section>

      <div class="planner-filter-chips">
        <button
          v-for="filter in statFilters"
          :key="filter.id"
          type="button"
          class="button is-small planner-filter-chip"
          :class="{ 'is-active': statFilter === filter.id }"
          @click="statFilter = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>

      <div
        id="plannerStatsPanel"
        ref="panelRoot"
        class="planner-stats-panel planner-card mb-2"
      >
        <div class="planner-stats-baseline planner-stats-registry-scroll">
          <div
            v-for="def in filteredStatDefs"
            :key="def.key"
            class="planner-stat-row"
            :class="{
              'planner-stat-life': def.key === 'life',
              'planner-stat-mana': def.key === 'mana',
            }"
            :data-stat-key="def.key"
          >
            <label class="planner-stat-label" :for="'planner-stat-' + def.key">{{ def.label }}</label>
            <div class="planner-stat-controls">
              <input
                :id="'planner-stat-' + def.key"
                type="number"
                class="input is-small planner-stat-input"
                :data-stat-key="def.key"
                step="any"
                :min="statInputMin(def)"
                :max="statInputMax(def)"
                :readonly="def.key === 'life' || def.key === 'mana'"
                :value="stats[def.key] ?? 0"
                @focus="onStatRowFocus(def.key)"
                @blur="onStatRowBlur(def.key)"
                @input="onStatInput(def.key, $event)"
                @change="onStatInput(def.key, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
