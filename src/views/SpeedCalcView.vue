<script>
export default {
  name: 'SpeedCalcView',
};
</script>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  SPEED_CALC_CLASS_GROUPS,
  encodeSpeedCalcClassKey,
  parseSpeedCalcClassKey,
} from '@/speedcalc/movement-baselines.js';
import {
  NONE_MOVE_PENALTY_OPTION,
  findMovePenaltyOption,
  formatMovePenaltyOption,
  loadMovePenaltyOptions,
} from '@/speedcalc/movement-armor-options.js';
import {
  LAB_LEVEL_MAX,
  LAB_LEVEL_MIN,
  MOVE_CURSE_GROUPS,
  formatMoveCurseOption,
  sumSelectedMoveCurses,
} from '@/speedcalc/movement-debuff-options.js';
import { FRAME_DISTANCE_YARDS, buildSpeedGraphSeries, computeSpeedCalc } from '@/speedcalc/movement-speed.js';
import SpeedCalcSpeedGraph from '@/components/speedcalc/SpeedCalcSpeedGraph.vue';
import SpeedCalcYardMap from '@/components/speedcalc/SpeedCalcYardMap.vue';

const classKey = ref(encodeSpeedCalcClassKey('Amazon', 'none'));
const selectedClass = computed(() => parseSpeedCalcClassKey(classKey.value));
const className = computed(() => selectedClass.value.className);
const morphId = computed(() => selectedClass.value.morphId);
const itemFrw = ref(0);
const labLevel = ref(1);
const curseKeys = ref([]);
const armorKey = ref(NONE_MOVE_PENALTY_OPTION.key);
const shieldKey = ref(NONE_MOVE_PENALTY_OPTION.key);
const armorOptions = ref([NONE_MOVE_PENALTY_OPTION]);
const shieldOptions = ref([NONE_MOVE_PENALTY_OPTION]);

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const selectedArmor = computed(() => findMovePenaltyOption(armorOptions.value, armorKey.value));
const selectedShield = computed(() => findMovePenaltyOption(shieldOptions.value, shieldKey.value));
const selectedCurses = computed(() => sumSelectedMoveCurses(curseKeys.value, labLevel.value));

function isCurseSelected(key) {
  return curseKeys.value.includes(key);
}

function toggleCurse(key) {
  const next = curseKeys.value.includes(key)
    ? curseKeys.value.filter((k) => k !== key)
    : [...curseKeys.value, key];
  curseKeys.value = next;
}

const result = computed(() =>
  computeSpeedCalc({
    className: className.value,
    morphId: morphId.value,
    itemFrw: toInt(itemFrw.value),
    curseItemFrw: selectedCurses.value.itemFrw,
    skillFrw: selectedCurses.value.skillFrw,
    armorPenalty: selectedArmor.value.penalty,
    shieldPenalty: selectedShield.value.penalty,
  })
);

function currentRow(rows) {
  return rows.find((row) => row.current) || null;
}

function nextRow(rows) {
  const idx = rows.findIndex((row) => row.current);
  return idx >= 0 ? rows[idx + 1] || null : null;
}

const walkCurrent = computed(() => currentRow(result.value.walkRows));
const walkNext = computed(() => nextRow(result.value.walkRows));
const sprintCurrent = computed(() => currentRow(result.value.sprintRows));
const sprintNext = computed(() => nextRow(result.value.sprintRows));
const showGraph = ref(true);
const graphSeries = computed(() =>
  buildSpeedGraphSeries({
    className: className.value,
    morphId: morphId.value,
    curseItemFrw: selectedCurses.value.itemFrw,
    skillFrw: selectedCurses.value.skillFrw,
    armorPenalty: selectedArmor.value.penalty,
    shieldPenalty: selectedShield.value.penalty,
  })
);

function formatYards(n) {
  return (Math.floor(n * 100) / 100).toFixed(2);
}

onMounted(async () => {
  try {
    const loaded = await loadMovePenaltyOptions();
    armorOptions.value = loaded.armor;
    shieldOptions.value = loaded.shields;
  } catch (err) {
    console.error(err);
  }
});
</script>

<template>
  <section class="section py-5 speedcalc-view">
    <div class="container speedcalc-shell">
      <header class="speedcalc-hero">
        <div>
          <h1 class="title is-3 mb-2">Movement speed calculator</h1>
          <p class="speedcalc-subtitle">
            Item speed uses the engine curve. Armor penalties apply at full value. Actual speed grows linearly with velocity; frame counts are only the aproximations needed for {{ FRAME_DISTANCE_YARDS }} yards.
          </p>
        </div>
      </header>

      <div class="speedcalc-panel speedcalc-controls">
        <div class="speedcalc-grid">
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-class">Class</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="sc-class" v-model="classKey">
                  <template v-for="group in SPEED_CALC_CLASS_GROUPS" :key="group.className">
                    <option :value="encodeSpeedCalcClassKey(group.className, 'none')">{{ group.className }}</option>
                    <option
                      v-for="morph in group.morphs"
                      :key="group.className + ':' + morph.id"
                      class="speedcalc-morph-option"
                      :value="encodeSpeedCalcClassKey(group.className, morph.id)"
                    >
                      {{ '\u00a0\u00a0' + morph.label }}
                    </option>
                  </template>
                </select>
              </div>
            </div>
          </div>
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-armor">Body armor</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="sc-armor" v-model="armorKey">
                  <option v-for="opt in armorOptions" :key="'a' + opt.key" :value="opt.key">
                    {{ formatMovePenaltyOption(opt) }}
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-shield">Shield</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="sc-shield" v-model="shieldKey">
                  <option v-for="opt in shieldOptions" :key="'s' + opt.key" :value="opt.key">
                    {{ formatMovePenaltyOption(opt) }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="speedcalc-curses">
          <h2 class="speedcalc-curse-heading">Debuff</h2>
          <div v-for="group in MOVE_CURSE_GROUPS" :key="group.id" class="speedcalc-curse-group">
            <h3 class="speedcalc-curse-title">{{ group.title }}</h3>
            <p class="speedcalc-curse-hint">{{ group.hint }}</p>
            <div class="speedcalc-curse-list">
              <label
                v-for="opt in group.options"
                :key="opt.key"
                class="speedcalc-curse-check"
                :class="{ 'is-selected': isCurseSelected(opt.key) }"
              >
                <input
                  type="checkbox"
                  class="mr-2"
                  :checked="isCurseSelected(opt.key)"
                  :aria-label="formatMoveCurseOption(opt, labLevel)"
                  @change="toggleCurse(opt.key)"
                >
                <span>{{ formatMoveCurseOption(opt, labLevel) }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="speedcalc-extra-fields">
          <div class="field mb-0 speedcalc-item-frw">
            <label class="label speedcalc-label" for="sc-item-frw">Movement speed</label>
            <div class="control speedcalc-number">
              <input id="sc-item-frw" v-model.number="itemFrw" class="input" type="number" step="1">
              <span class="speedcalc-suffix">%</span>
            </div>
          </div>
          <div v-if="isCurseSelected('navigator')" class="field mb-0 speedcalc-item-frw">
            <label class="label speedcalc-label" for="sc-lab">Lab level</label>
            <div class="control">
              <input
                id="sc-lab"
                v-model.number="labLevel"
                class="input"
                type="number"
                :min="LAB_LEVEL_MIN"
                :max="LAB_LEVEL_MAX"
                step="1"
              >
            </div>
          </div>
        </div>
      </div>

      <div class="speedcalc-results">
        <article class="speedcalc-result is-walk">
          <div class="speedcalc-result-head">
            <h2 class="speedcalc-result-title">Walk</h2>
            <span class="speedcalc-chip">{{ result.walk.speedPct }}% speed</span>
          </div>
          <p class="speedcalc-result-speed">{{ formatYards(result.walk.yardsPerSec) }}<span> yards/s</span></p>
          <div class="speedcalc-result-meta">
            <div>
              <span class="speedcalc-meta-value">{{ result.walk.frames }} frames</span>
              <span class="speedcalc-meta-label">for {{ FRAME_DISTANCE_YARDS }} yards</span>
            </div>
            <div>
              <span class="speedcalc-meta-value">{{ result.walk.walk }}</span>
              <span class="speedcalc-meta-label">base walk</span>
            </div>
          </div>
        </article>

        <article class="speedcalc-result is-sprint">
          <div class="speedcalc-result-head">
            <h2 class="speedcalc-result-title">Sprint</h2>
            <span class="speedcalc-chip">{{ result.sprint.speedPct }}% speed</span>
          </div>
          <p class="speedcalc-result-speed">{{ formatYards(result.sprint.yardsPerSec) }}<span> yards/s</span></p>
          <div class="speedcalc-result-meta">
            <div>
              <span class="speedcalc-meta-value">{{ result.sprint.frames }} frames</span>
              <span class="speedcalc-meta-label">for {{ FRAME_DISTANCE_YARDS }} yards</span>
            </div>
            <div>
              <span class="speedcalc-meta-value">{{ result.sprint.run }}</span>
              <span class="speedcalc-meta-label">base sprint</span>
            </div>
          </div>
        </article>
      </div>

      <div class="speedcalc-breakdown">
        <div class="speedcalc-breakdown-bar">
          <div class="speedcalc-mode-switch" role="group" aria-label="Breakpoint view">
            <button type="button" :class="{ 'is-selected': !showGraph }" @click="showGraph = false">Table</button>
            <button type="button" :class="{ 'is-selected': showGraph }" @click="showGraph = true">Graph</button>
          </div>
        </div>
        <article v-if="showGraph" class="speedcalc-panel speedcalc-graph-card">
          <header class="speedcalc-card-head speedcalc-graph-head">
            <div>
              <h2 class="speedcalc-card-title">Walk and sprint speed</h2>
              <p class="speedcalc-card-hint">Hover the lines for yards/s and frames at that movement speed.</p>
            </div>
            <div class="speedcalc-graph-legend" aria-hidden="true">
              <span class="is-walk">Walk</span>
              <span class="is-sprint">Sprint</span>
            </div>
          </header>
          <SpeedCalcSpeedGraph
            :walk="graphSeries.walk"
            :sprint="graphSeries.sprint"
            :current-item-frw="toInt(itemFrw)"
          />
        </article>
        <div v-else class="speedcalc-tables">
          <article class="speedcalc-panel speedcalc-table-card">
            <header class="speedcalc-card-head">
              <h2 class="speedcalc-card-title">Walk breakpoints</h2>
              <p v-if="walkCurrent" class="speedcalc-card-hint">
                Now {{ walkCurrent.frames }} frm
                <span v-if="walkNext"> · next {{ walkNext.frames }} frm at {{ walkNext.value }}<span v-if="walkNext.extra != null"> (+{{ walkNext.extra }})</span></span>
              </p>
            </header>
            <div class="speedcalc-table-wrap">
              <table class="table is-narrow is-fullwidth speedcalc-table">
                <thead>
                  <tr>
                    <th>Frm</th>
                    <th>Item speed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in result.walkRows"
                    :key="'w' + row.frames + '-' + row.value"
                    :class="{ 'is-current': row.current }"
                  >
                    <td class="speedcalc-frm">{{ row.frames }}</td>
                    <td>{{ row.value }}<span v-if="row.extra != null" class="speedcalc-extra"> +{{ row.extra }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="speedcalc-panel speedcalc-table-card">
            <header class="speedcalc-card-head">
              <h2 class="speedcalc-card-title">Sprint breakpoints</h2>
              <p v-if="sprintCurrent" class="speedcalc-card-hint">
                Now {{ sprintCurrent.frames }} frm
                <span v-if="sprintNext"> · next {{ sprintNext.frames }} frm at {{ sprintNext.value }}<span v-if="sprintNext.extra != null"> (+{{ sprintNext.extra }})</span></span>
              </p>
            </header>
            <div class="speedcalc-table-wrap">
              <table class="table is-narrow is-fullwidth speedcalc-table">
                <thead>
                  <tr>
                    <th>Frm</th>
                    <th>Item speed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in result.sprintRows"
                    :key="'s' + row.frames + '-' + row.value"
                    :class="{ 'is-current': row.current }"
                  >
                    <td class="speedcalc-frm">{{ row.frames }}</td>
                    <td>{{ row.value }}<span v-if="row.extra != null" class="speedcalc-extra"> +{{ row.extra }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>

      <SpeedCalcYardMap class="mt-5" />
    </div>
  </section>
</template>

<style scoped>
.speedcalc-view {
  --sc-panel: rgba(255, 255, 255, 0.04);
  --sc-panel-border: rgba(255, 255, 255, 0.1);
  --sc-accent: #7dff7d;
  --sc-walk: #6ee7c8;
  --sc-sprint: #ffcf6e;
}
.speedcalc-shell {
  max-width: 72rem;
}
.speedcalc-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.speedcalc-subtitle {
  color: var(--bulma-text-weak, #a8adb8);
  max-width: 42rem;
}
.speedcalc-panel {
  border: 1px solid var(--sc-panel-border);
  border-radius: 0.9rem;
  background: var(--sc-panel);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}
.speedcalc-controls {
  padding: 1rem;
  margin-bottom: 1rem;
}
.speedcalc-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem 1rem;
}
.speedcalc-curses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--sc-panel-border);
}
.speedcalc-curse-heading {
  grid-column: 1 / -1;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin: 0;
}
.speedcalc-extra-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--sc-panel-border);
}
.speedcalc-item-frw {
  max-width: 16rem;
}
.speedcalc-curse-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.2rem;
}
.speedcalc-curse-hint {
  font-size: 0.78rem;
  color: var(--bulma-text-weak, #a8adb8);
  margin-bottom: 0.55rem;
}
.speedcalc-curse-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.45rem;
}
.speedcalc-curse-check {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  white-space: nowrap;
  margin: 0;
  padding: 0.28rem 0.55rem;
  border-radius: 0.35rem;
  border: 1px solid hsl(0, 0%, 30%);
  color: #b5b5b5;
  font-size: 0.82rem;
}
.speedcalc-curse-check.is-selected {
  border-color: hsla(153, 47%, 49%, 0.9);
  background: hsla(153, 47%, 49%, 0.16);
  color: #fff;
}
.speedcalc-label {
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.speedcalc-morph-option {
  color: #6b7280;
}
.speedcalc-number {
  position: relative;
}
.speedcalc-number .input {
  padding-right: 2rem;
}
.speedcalc-suffix {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--bulma-text-weak, #a8adb8);
  pointer-events: none;
}
.speedcalc-results {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}
.speedcalc-result {
  padding: 1.1rem 1.15rem;
  border-radius: 0.9rem;
  border: 1px solid var(--sc-panel-border);
  background: var(--sc-panel);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}
.speedcalc-result.is-walk {
  border-top: 3px solid var(--sc-walk);
}
.speedcalc-result.is-sprint {
  border-top: 3px solid var(--sc-sprint);
}
.speedcalc-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.speedcalc-result-title {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.speedcalc-chip {
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--sc-panel-border);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.speedcalc-result-speed {
  margin-top: 0.45rem;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.speedcalc-result-speed span {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--bulma-text-weak, #a8adb8);
}
.speedcalc-result-meta {
  display: flex;
  gap: 2rem;
  margin-top: 0.8rem;
}
.speedcalc-result-meta > div {
  display: flex;
  flex-direction: column;
}
.speedcalc-meta-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.speedcalc-meta-label {
  font-size: 0.75rem;
  color: var(--bulma-text-weak, #a8adb8);
}
.speedcalc-breakdown-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.65rem;
}
.speedcalc-mode-switch {
  display: inline-flex;
  gap: 0.35rem;
}
.speedcalc-mode-switch button {
  cursor: pointer;
  margin: 0;
  padding: 0.28rem 0.7rem;
  border-radius: 0.35rem;
  border: 1px solid hsl(0, 0%, 30%);
  background: transparent;
  color: #b5b5b5;
  font-size: 0.82rem;
}
.speedcalc-mode-switch button.is-selected {
  border-color: hsla(153, 47%, 49%, 0.9);
  background: hsla(153, 47%, 49%, 0.16);
  color: #fff;
}
.speedcalc-graph-card {
  overflow: hidden;
  padding-bottom: 0.35rem;
}
.speedcalc-graph-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.speedcalc-graph-legend {
  display: flex;
  gap: 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}
.speedcalc-graph-legend .is-walk {
  color: var(--sc-walk);
}
.speedcalc-graph-legend .is-sprint {
  color: var(--sc-sprint);
}
.speedcalc-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.speedcalc-table-card {
  overflow: hidden;
}
.speedcalc-card-head {
  padding: 0.9rem 1rem 0.75rem;
  border-bottom: 1px solid var(--sc-panel-border);
}
.speedcalc-card-title {
  font-size: 1rem;
  font-weight: 700;
}
.speedcalc-card-hint {
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: var(--bulma-text-weak, #a8adb8);
  font-variant-numeric: tabular-nums;
}
.speedcalc-table-wrap {
  max-height: 21rem;
  overflow: auto;
}
.speedcalc-table {
  background: transparent;
  margin-bottom: 0;
  font-variant-numeric: tabular-nums;
}
.speedcalc-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #1d2029;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.speedcalc-table tbody tr {
  transition: background 120ms ease;
}
.speedcalc-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}
.speedcalc-table tr.is-current {
  background: rgba(255, 207, 110, 0.16);
  box-shadow: inset 3px 0 0 var(--sc-sprint);
}
.speedcalc-table tr.is-current td {
  font-weight: 700;
}
.speedcalc-frm {
  width: 5.5rem;
  font-weight: 700;
}
.speedcalc-extra {
  color: var(--sc-sprint);
  font-weight: 700;
}
@media (max-width: 900px) {
  .speedcalc-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .speedcalc-hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .speedcalc-grid,
  .speedcalc-curses,
  .speedcalc-results,
  .speedcalc-tables {
    grid-template-columns: 1fr;
  }
  .speedcalc-result-speed {
    font-size: 1.7rem;
  }
}
</style>
