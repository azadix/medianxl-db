<script setup>
import { computed, ref } from 'vue';
import {
  isCorruptedWormhole,
  getWormholeCycleTypeMatrix,
  getWormholeCycleCounts,
  setWormholeCycleCount,
  WORMHOLE_CYCLE_SIZE_LABELS,
  hasWormholeCycles,
  getWormholeCycleReqLevelBonus,
  canApplyWormholeCycle,
  applyWormholeCycle,
  clearWormholeCycles,
  formatWormholeCycleSummary,
  WORMHOLE_CYCLE_REQ_LEVEL_CAP,
} from '@/items/wormhole-cycles.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), required: true },
});

const emit = defineEmits(['update:rolls']);

const showPanel = computed(() => isCorruptedWormhole(props.def));
const matrix = computed(() => getWormholeCycleTypeMatrix());
const counts = computed(() => getWormholeCycleCounts(props.rolls).filter((entry) => entry.count > 0));
const hasCycles = computed(() => hasWormholeCycles(props.rolls));
const reqBonus = computed(() => getWormholeCycleReqLevelBonus(props.rolls));
const selectedId = ref(/** @type {string|null} */ (null));
const matrixOpen = ref(false);

const selectedCycle = computed(() => {
  if (!selectedId.value) return null;
  for (const row of matrix.value.rows) {
    const found = Object.values(row.cells).find((c) => c && c.id === selectedId.value);
    if (found) return found;
  }
  return null;
});

const applyCheck = computed(() =>
  selectedId.value ? canApplyWormholeCycle(props.rolls, selectedId.value) : { ok: false, reason: 'Select a cycle' }
);

/**
 * @param {string} cycleId
 */
function selectCycle(cycleId) {
  selectedId.value = selectedId.value === cycleId ? null : cycleId;
}

/**
 * @param {import('@/items/wormhole-cycles-data.js').WormholeCycleDef} cycle
 * @returns {string}
 */
function cellTitle(cycle) {
  const rl = cycle.reqLevelBonus ? `+${cycle.reqLevelBonus} Required Level` : 'Does not increase Required Level';
  return [...cycle.affixes, rl].join('\n');
}

function onApply() {
  if (!selectedId.value) return;
  const result = applyWormholeCycle(props.rolls, selectedId.value);
  if (!result.ok) return;
  emit('update:rolls', result.rolls);
}

/**
 * @param {Event} event
 * @returns {number|null}
 */
function inputNumber(event) {
  const raw = /** @type {HTMLInputElement} */ (event.target).value;
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Counted types (Life & Mana): the input holds how many cycles are used.
 * Committed on change so the field snaps back when the Req. Lvl cap clamps it.
 * @param {string} cycleId
 * @param {Event} event
 */
function onCountChange(cycleId, event) {
  const next = setWormholeCycleCount(props.rolls, cycleId, inputNumber(event) ?? 0);
  emit('update:rolls', next);
  const entry = getWormholeCycleCounts(next).find((e) => e.cycle.id === cycleId);
  /** @type {HTMLInputElement} */ (event.target).value = String(entry ? entry.count : 0);
}

function onClear() {
  emit('update:rolls', clearWormholeCycles(props.rolls));
  selectedId.value = null;
}

</script>

<template>
  <div v-if="showPanel" class="wormhole-cycles">
    <button
      type="button"
      class="wormhole-cycles__toggle"
      :aria-expanded="matrixOpen ? 'true' : 'false'"
      aria-controls="wormhole-cycles-matrix"
      @click="matrixOpen = !matrixOpen"
    >
      <span class="wormhole-cycles__heading is-size-7 has-text-grey">Cycles</span>
      <span class="icon is-small">
        <i class="fa-solid" :class="matrixOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
      </span>
    </button>

    <div v-if="matrixOpen" id="wormhole-cycles-matrix">
    <p class="wormhole-cycles__hint is-size-7 has-text-grey mb-2">
      Required Level bonus: {{ reqBonus }} / {{ WORMHOLE_CYCLE_REQ_LEVEL_CAP }}
      <span v-if="!applyCheck.ok && selectedId"> · {{ applyCheck.reason }}</span>
    </p>

    <div class="wormhole-cycles__matrix" role="grid">
      <div class="wormhole-cycles__head wormhole-cycles__head--type is-size-7">Cycle type</div>
      <div
        v-for="col in matrix.sizes"
        :key="'head-' + col.size"
        class="wormhole-cycles__head is-size-7"
      >
        {{ col.label }}
      </div>

      <template v-for="row in matrix.rows" :key="row.type">
        <div class="wormhole-cycles__type">
          <span class="wormhole-cycles__type-name">{{ row.label }}</span>
          <span class="wormhole-cycles__type-mods">{{ row.mods }}</span>
        </div>
        <template v-if="row.spanning">
          <button
            type="button"
            class="wormhole-cycles__cell wormhole-cycles__cell--span button is-small"
            :class="{
              'is-link': selectedId === row.cells.golden.id,
              'wormhole-cycles__cell--capped': !canApplyWormholeCycle(rolls, row.cells.golden.id).ok,
            }"
            :aria-pressed="selectedId === row.cells.golden.id"
            :title="cellTitle(row.cells.golden)"
            @click="selectCycle(row.cells.golden.id)"
          >
            <span class="wormhole-cycles__cell-main">{{ formatWormholeCycleSummary(row.cells.golden) }}</span>
            <span class="wormhole-cycles__cell-rl">No Req. Lvl</span>
          </button>
        </template>
        <template v-else>
          <template v-for="col in matrix.sizes" :key="row.type + '-' + col.size">
            <button
              v-if="row.cells[col.size]"
              type="button"
              class="wormhole-cycles__cell button is-small"
              :class="{
                'is-link': selectedId === row.cells[col.size].id,
                'wormhole-cycles__cell--capped': !canApplyWormholeCycle(rolls, row.cells[col.size].id).ok,
              }"
              :aria-pressed="selectedId === row.cells[col.size].id"
              :title="cellTitle(row.cells[col.size])"
              @click="selectCycle(row.cells[col.size].id)"
            >
              <span class="wormhole-cycles__cell-rl">
                {{ row.cells[col.size].reqLevelBonus ? '+' + row.cells[col.size].reqLevelBonus + ' Req. Lvl' : 'No Req. Lvl' }}
              </span>
            </button>
            <button
              v-else
              type="button"
              class="wormhole-cycles__cell wormhole-cycles__cell--blocked button is-small"
              disabled
              aria-disabled="true"
              :title="`No ${col.label} ${row.label} cycle`"
            >
              <span class="wormhole-cycles__cell-rl">&ndash;</span>
            </button>
          </template>
        </template>
      </template>
    </div>

    <div class="wormhole-cycles__actions">
      <button
        type="button"
        class="button is-small is-link"
        :disabled="!applyCheck.ok"
        @click="onApply"
      >
        Apply
      </button>
      <button
        type="button"
        class="button is-small"
        :disabled="!hasCycles"
        @click="onClear"
      >
        Clear applied
      </button>
    </div>

    <div v-if="selectedCycle" class="wormhole-cycles__preview is-size-7">
      <p class="has-text-grey mb-1">Selected</p>
      <ul class="wormhole-cycles__affixes">
        <li v-for="(affix, idx) in selectedCycle.affixes" :key="'sel-' + idx">{{ affix }}</li>
        <li v-if="selectedCycle.reqLevelBonus">+{{ selectedCycle.reqLevelBonus }} Required Level</li>
        <li v-else>Does not increase Required Level</li>
        <li v-if="selectedCycle.limit">Limit: {{ selectedCycle.limit }}</li>
      </ul>
    </div>
    </div>

    <div v-if="hasCycles" class="wormhole-cycles__applied">
      <p class="wormhole-cycles__group-label is-size-7">Cycle totals</p>
      <div class="wormhole-cycles__totals">
        <p class="wormhole-cycles__total">
          <span class="wormhole-cycles__total-label">Required Level bonus: {{ reqBonus }} / {{ WORMHOLE_CYCLE_REQ_LEVEL_CAP }}</span>
        </p>
        <div v-for="entry in counts" :key="'count-' + entry.cycle.id" class="wormhole-cycles__count">
          <label class="wormhole-cycles__total">
            <span class="wormhole-cycles__total-label">
              {{ WORMHOLE_CYCLE_SIZE_LABELS[entry.cycle.size] || entry.cycle.size }}s (Life &amp; Mana) used
            </span>
            <input
              class="input is-small wormhole-cycles__input"
              type="number"
              min="0"
              step="1"
              :value="entry.count"
              @change="onCountChange(entry.cycle.id, $event)"
            >
          </label>
          <p v-if="entry.count" class="wormhole-cycles__count-stats">
            {{ entry.stats.map((st) => st.text).join(', ') }}
            <span v-if="entry.cycle.reqLevelBonus">
              (+{{ entry.count * entry.cycle.reqLevelBonus }} Req. Lvl)
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wormhole-cycles {
  margin-bottom: 0.75rem;
}

.wormhole-cycles__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.15rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.wormhole-cycles__toggle:hover .wormhole-cycles__heading,
.wormhole-cycles__toggle:hover .icon {
  color: #fff;
}

.wormhole-cycles__toggle .icon {
  color: #9a9aa8;
}

.wormhole-cycles__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wormhole-cycles__group-label {
  margin-bottom: 0.35rem;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.wormhole-cycles__matrix {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  align-items: stretch;
}

.wormhole-cycles__head {
  align-self: end;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: center;
}

.wormhole-cycles__head--type {
  text-align: left;
}

.wormhole-cycles__type {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  line-height: 1.25;
}

.wormhole-cycles__type-name {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.85);
}

.wormhole-cycles__type-mods {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
}

.wormhole-cycles__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: auto;
  width: 75%;
  justify-self: center;
  white-space: normal;
  text-align: center;
  line-height: 1.25;
  padding: 0.4rem 0.35rem;
  font-size: 110%;
}

.wormhole-cycles__cell--span {
  grid-column: span 3;
  width: auto;
  justify-self: stretch;
}

.wormhole-cycles__cell-main {
  font-size: 0.79rem;
}

.wormhole-cycles__cell-rl {
  margin-top: 0.15rem;
  font-size: 0.72rem;
  opacity: 0.7;
}

.wormhole-cycles__cell--capped:not(.is-link) {
  opacity: 0.45;
}

.wormhole-cycles__cell--blocked,
.wormhole-cycles__cell--blocked[disabled] {
  opacity: 0.25;
  cursor: not-allowed;
  pointer-events: none;
}

.wormhole-cycles__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.wormhole-cycles__preview {
  margin-top: 0.65rem;
}

.wormhole-cycles__affixes {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wormhole-cycles__affixes li + li {
  margin-top: 0.2rem;
}

.wormhole-cycles__affixes {
  color: rgba(255, 255, 255, 0.75);
}

.wormhole-cycles__applied {
  margin-top: 0.75rem;
}

.wormhole-cycles__totals {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.wormhole-cycles__total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
}

.wormhole-cycles__total-label {
  color: rgba(255, 255, 255, 0.65);
}

.wormhole-cycles__total-field {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: pre;
}

.wormhole-cycles__count-stats {
  margin-top: 0.1rem;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
}

.wormhole-cycles__input {
  width: 4.5rem;
  text-align: right;
}
</style>
