<script setup>
import { computed } from 'vue';
import {
  CHARM_ROLL_KEYS,
  hasCharmExtras,
  getCharmUpgradeEntries,
  getCharmTrophyEntry,
  getCharmModifierPools,
  isCharmItem,
} from '@/items/charm-items.js';
import { getCharacterInstance } from '@/character/planner-core.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), required: true },
});

const emit = defineEmits(['update:rolls']);

const className = computed(() => getCharacterInstance()?.className ?? null);
const showPanel = computed(() => isCharmItem(props.def) && hasCharmExtras(props.def));
const pools = computed(() => getCharmModifierPools(props.def));
const upgradeEntries = computed(() => getCharmUpgradeEntries(props.def, className.value));
const trophyEntry = computed(() => getCharmTrophyEntry(props.def));

/**
 * @param {Record<string, number>} patch
 */
function patchRolls(patch) {
  emit('update:rolls', { ...props.rolls, ...patch });
}

/**
 * @param {string} key
 * @param {boolean} checked
 */
function setChecked(key, checked) {
  patchRolls({ [key]: checked ? 1 : 0 });
}

/**
 * @param {number} poolIndex
 * @param {number} optionIndex
 */
function setPoolChoice(poolIndex, optionIndex) {
  patchRolls({ [`${CHARM_ROLL_KEYS.poolPrefix}${poolIndex}`]: optionIndex });
}
</script>

<template>
  <div v-if="showPanel" class="charm-extras-controls">
    <p class="charm-extras-controls__heading is-size-7 has-text-grey mb-2">Charm options</p>

    <div v-for="pool in pools" :key="'pool-' + pool.poolIndex" class="charm-extras-controls__pool">
      <label class="label is-size-7 mb-1">Modifier choice</label>
      <div class="select is-small is-fullwidth">
        <select
          :value="rolls[`${CHARM_ROLL_KEYS.poolPrefix}${pool.poolIndex}`] ?? 0"
          @change="setPoolChoice(pool.poolIndex, Number($event.target.value))"
        >
          <option v-for="(opt, idx) in pool.options" :key="idx" :value="idx">
            {{ opt }}
          </option>
        </select>
      </div>
    </div>

    <div
      v-for="entry in upgradeEntries"
      :key="entry.key"
      class="charm-extras-controls__group"
    >
      <label class="checkbox charm-extras-controls__check">
        <input
          type="checkbox"
          :checked="Boolean(rolls[entry.key])"
          @change="setChecked(entry.key, $event.target.checked)"
        />
        {{ entry.label }}
      </label>
      <ul v-if="entry.affixes.length" class="charm-extras-controls__affixes">
        <li v-for="(affix, idx) in entry.affixes" :key="idx">{{ affix }}</li>
      </ul>
      <p v-else class="charm-extras-controls__affixes charm-extras-controls__affixes--empty is-size-7 has-text-grey">
        Select a class for upgrade affixes
      </p>
    </div>

    <div v-if="trophyEntry" class="charm-extras-controls__group">
      <label class="checkbox charm-extras-controls__check">
        <input
          type="checkbox"
          :checked="Boolean(rolls[trophyEntry.key])"
          @change="setChecked(trophyEntry.key, $event.target.checked)"
        />
        {{ trophyEntry.label }}
      </label>
      <ul class="charm-extras-controls__affixes">
        <li v-for="(affix, idx) in trophyEntry.affixes" :key="idx">{{ affix }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.charm-extras-controls {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.charm-extras-controls__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.charm-extras-controls__pool + .charm-extras-controls__group,
.charm-extras-controls__group + .charm-extras-controls__group {
  margin-top: 0.75rem;
}

.charm-extras-controls__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.charm-extras-controls__affixes {
  list-style: none;
  margin: 0.35rem 0 0 1.5rem;
  padding: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.75);
}

.charm-extras-controls__affixes li + li {
  margin-top: 0.15rem;
}

.charm-extras-controls__affixes--empty {
  margin: 0.35rem 0 0 1.5rem;
}
</style>
