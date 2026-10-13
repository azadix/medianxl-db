<script setup>
import { computed, ref } from 'vue';
import {
  isCorruptedWormhole,
  getWormholeCycleMatrix,
  getAppliedWormholeCycles,
  getWormholeCycleReqLevelBonus,
  canApplyWormholeCycle,
  applyWormholeCycle,
  removeWormholeCycleAt,
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
const matrix = computed(() => getWormholeCycleMatrix());
const applied = computed(() => getAppliedWormholeCycles(props.rolls));
const reqBonus = computed(() => getWormholeCycleReqLevelBonus(props.rolls));
const selectedId = ref(/** @type {string|null} */ (null));

const selectedCycle = computed(() => {
  if (!selectedId.value) return null;
  for (const group of matrix.value) {
    const found = group.cycles.find((c) => c.id === selectedId.value);
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

function onApply() {
  if (!selectedId.value) return;
  const result = applyWormholeCycle(props.rolls, selectedId.value);
  if (!result.ok) return;
  emit('update:rolls', result.rolls);
}

/**
 * @param {number} index
 */
function onRemove(index) {
  emit('update:rolls', removeWormholeCycleAt(props.rolls, index));
}

function onClear() {
  emit('update:rolls', clearWormholeCycles(props.rolls));
  selectedId.value = null;
}
</script>

<template>
  <div v-if="showPanel" class="wormhole-cycles">
    <p class="wormhole-cycles__heading is-size-7 has-text-grey mb-2">Cycles</p>
    <p class="wormhole-cycles__hint is-size-7 has-text-grey mb-2">
      Required Level bonus: {{ reqBonus }} / {{ WORMHOLE_CYCLE_REQ_LEVEL_CAP }}
      <span v-if="!applyCheck.ok && selectedId"> · {{ applyCheck.reason }}</span>
    </p>

    <div
      v-for="group in matrix"
      :key="group.size"
      class="wormhole-cycles__group"
    >
      <p class="wormhole-cycles__group-label is-size-7">{{ group.label }}</p>
      <div class="wormhole-cycles__matrix">
        <button
          v-for="cycle in group.cycles"
          :key="cycle.id"
          type="button"
          class="wormhole-cycles__cell button is-small"
          :class="{
            'is-link': selectedId === cycle.id,
            'wormhole-cycles__cell--blocked': !canApplyWormholeCycle(rolls, cycle.id).ok,
          }"
          :title="cycle.affixes.join('\n') + `\n+${cycle.reqLevelBonus} Required Level`"
          @click="selectCycle(cycle.id)"
        >
          <span class="wormhole-cycles__cell-main">{{ formatWormholeCycleSummary(cycle) }}</span>
          <span v-if="cycle.reqLevelBonus" class="wormhole-cycles__cell-rl">
            +{{ cycle.reqLevelBonus }} RL
          </span>
          <span v-else class="wormhole-cycles__cell-rl">No RL</span>
        </button>
      </div>
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
        :disabled="!applied.length"
        @click="onClear"
      >
        Clear
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

    <div v-if="applied.length" class="wormhole-cycles__applied">
      <p class="wormhole-cycles__group-label is-size-7">Applied cycles</p>
      <ul class="wormhole-cycles__list">
        <li v-for="(cycle, idx) in applied" :key="'app-' + idx + '-' + cycle.id">
          <span>{{ formatWormholeCycleSummary(cycle) }}</span>
          <button type="button" class="button is-small is-text" @click="onRemove(idx)">
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wormhole-cycles {
  margin-bottom: 0.75rem;
}

.wormhole-cycles__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wormhole-cycles__group + .wormhole-cycles__group {
  margin-top: 0.65rem;
}

.wormhole-cycles__group-label {
  margin-bottom: 0.35rem;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.wormhole-cycles__matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.wormhole-cycles__cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: auto;
  white-space: normal;
  text-align: left;
  line-height: 1.25;
  padding: 0.4rem 0.5rem;
}

.wormhole-cycles__cell-main {
  font-size: 0.72rem;
}

.wormhole-cycles__cell-rl {
  margin-top: 0.15rem;
  font-size: 0.65rem;
  opacity: 0.7;
}

.wormhole-cycles__cell--blocked:not(.is-link) {
  opacity: 0.45;
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

.wormhole-cycles__affixes,
.wormhole-cycles__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wormhole-cycles__affixes li + li,
.wormhole-cycles__list li + li {
  margin-top: 0.2rem;
}

.wormhole-cycles__affixes {
  color: rgba(255, 255, 255, 0.75);
}

.wormhole-cycles__applied {
  margin-top: 0.75rem;
}

.wormhole-cycles__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
}
</style>
