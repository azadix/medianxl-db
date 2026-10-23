<script>
export default {
  name: 'SpeedCalcView',
};
</script>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { SPEED_CALC_CLASSES, SPEED_CALC_MORPHS } from '@/speedcalc/movement-baselines.js';
import {
  NONE_MOVE_PENALTY_OPTION,
  findMovePenaltyOption,
  formatMovePenaltyOption,
  loadMovePenaltyOptions,
} from '@/speedcalc/movement-armor-options.js';
import { FRAME_DISTANCE_YARDS, computeSpeedCalc } from '@/speedcalc/movement-speed.js';
import SpeedCalcYardMap from '@/components/speedcalc/SpeedCalcYardMap.vue';

const className = ref('Amazon');
const morphId = ref('none');
const itemFrw = ref(0);
const skillFrw = ref(0);
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

const result = computed(() =>
  computeSpeedCalc({
    className: className.value,
    morphId: morphId.value,
    itemFrw: toInt(itemFrw.value),
    skillFrw: toInt(skillFrw.value),
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
            Item speed uses the engine curve. Skill speed and armor penalties apply at full value.
          </p>
        </div>
      </header>

      <div class="speedcalc-panel speedcalc-controls">
        <div class="speedcalc-grid">
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-class">Class</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="sc-class" v-model="className">
                  <option v-for="name in SPEED_CALC_CLASSES" :key="name" :value="name">{{ name }}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-morph">Morph</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select id="sc-morph" v-model="morphId">
                  <option v-for="morph in SPEED_CALC_MORPHS" :key="morph.id" :value="morph.id">{{ morph.label }}</option>
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
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-item-frw">Item movement speed</label>
            <div class="control speedcalc-number">
              <input id="sc-item-frw" v-model.number="itemFrw" class="input" type="number" step="1">
              <span class="speedcalc-suffix">%</span>
            </div>
          </div>
          <div class="field mb-0">
            <label class="label speedcalc-label" for="sc-skill-frw">Skill movement speed</label>
            <div class="control speedcalc-number">
              <input id="sc-skill-frw" v-model.number="skillFrw" class="input" type="number" step="1">
              <span class="speedcalc-suffix">%</span>
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

      <div class="speedcalc-tables">
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem 1rem;
}
.speedcalc-label {
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
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
  .speedcalc-results,
  .speedcalc-tables {
    grid-template-columns: 1fr;
  }
  .speedcalc-result-speed {
    font-size: 1.7rem;
  }
}
</style>
