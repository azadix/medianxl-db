<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getPlannerCharacterStatDefs } from '../../../character/planner-stats-config.js';
import { getCharacterInstance } from '../../../character/character-state.js';
import { setupPlannerStatRowTooltips, applyPlannerStatInput } from '../../../character/planner-stats-panel.js';
import { getFileSkillStore } from '../../../tree/skill-data-store.js';
import { usePlannerSkillReferencedStats } from '../../composables/usePlannerSkillReferencedStats.js';

const charStatsPlaceholder =
  'Only stats that differ from default are saved. Example:\n{{strength}}=120\n{{fire_resistance}}=30';

const panelRoot = ref(null);
/** @type {import('vue').Ref<{ key: string, label: string, min: number|null, max: number|null, allowNegative?: boolean, default?: number, alwaysVisible?: boolean, sortOrder?: number }[]>} */
const statDefs = ref(getPlannerCharacterStatDefs());
/** @type {import('vue').Ref<Record<string, number>>} */
const stats = ref({});
const syncingFromTextarea = ref(false);
/** Stat row whose input is focused (keeps row visible while editing down to default). */
const activeStatKey = ref(/** @type {string|null} */ (null));
/** Bump to force recompute of non-reactive derived data (skill store load, skill point changes). */
const refreshTick = ref(0);

const { skillReferencedStatKeys } = usePlannerSkillReferencedStats(refreshTick);

/**
 * @param {{ default?: number }} def
 */
function defaultStatValue(def) {
  return def.default != null && !Number.isNaN(def.default) ? def.default : 0;
}

const visibleStatDefs = computed(() => {
  return statDefs.value.filter((def) => {
    if (def.alwaysVisible) return true;
    if (skillReferencedStatKeys.value.has(def.key)) return true;
    if (activeStatKey.value === def.key) return true;
    const raw = stats.value[def.key];
    let v = raw != null && raw !== '' ? Number(raw) : 0;
    if (Number.isNaN(v)) v = 0;
    return v !== defaultStatValue(def);
  });
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
  syncTextareaFromCharacter();
}

function syncTextareaFromCharacter() {
  const ta = document.getElementById('characterStats');
  const ch = getCharacterInstance();
  if (!ta || !ch) return;
  if (document.activeElement === ta) return;
  ta.value = ch.exportStatsToText();
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

function onTextareaInput(e) {
  if (syncingFromTextarea.value) return;
  const ta = e.target;
  if (!(ta instanceof HTMLTextAreaElement)) return;
  const ch = getCharacterInstance();
  if (!ch) return;
  ch.parseStatsFromText(ta.value);
  syncingFromTextarea.value = true;
  try {
    pullStats();
  } finally {
    syncingFromTextarea.value = false;
  }
  window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { fromTextarea: true } }));
}

function onTextareaBlur() {
  pullStats();
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
    <div class="character-sheet-body">
      <label class="label">Character stats</label>
      <div
        id="plannerStatsPanel"
        ref="panelRoot"
        class="planner-stats-panel box has-background-dark p-3 mb-2"
      >
        <div class="planner-stats-baseline planner-stats-registry-scroll">
          <div
            v-for="def in visibleStatDefs"
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
      <details class="planner-stats-advanced mt-1">
        <summary class="is-size-7 has-text-grey is-clickable">Advanced: paste or edit raw stat lines</summary>
        <div class="control mt-2">
          <textarea
            id="characterStats"
            class="textarea is-small"
            rows="5"
            :placeholder="charStatsPlaceholder"
            @input="onTextareaInput"
            @blur="onTextareaBlur"
          ></textarea>
        </div>
        <p class="help is-size-7">
          One per line: stat_key=value. Only registered keys are accepted. Export omits default (zero) values.
        </p>
      </details>
    </div>
  </div>
</template>
