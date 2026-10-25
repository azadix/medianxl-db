<script setup>
import { computed } from 'vue';
import {
  CHARM_ROLL_KEYS,
  hasCharmExtras,
  getCharmUpgradeEntries,
  getCharmTrophyEntry,
  getCharmModifierPools,
  getCharmTrophyOptions,
  hasCharmExtraAwakening,
  getParagonHammerConfig,
  countParagonRegularUpgrades,
  isCharmItem,
  isDimensionalKeyCharm,
  charmPoolHighRollKey,
  formatCharmPoolRollButton,
} from '@/items/charm-items.js';
import { getCharacterInstance } from '@/character/planner-core.js';
import { useItemsStore } from '@/stores/items.js';
import WormholeCyclesControls from './WormholeCyclesControls.vue';
import { isCorruptedWormhole } from '@/items/wormhole-cycles.js';
import {
  DIM_KEY_DREAM_COUNT,
  DIM_KEY_DREAM_POINTS,
  DIM_KEY_LAB_MAGIC_FIND,
  DIM_KEY_LAB_MAX,
  DIM_KEY_ROLL_KEYS,
  DIM_KEY_STAR_COUNT,
  DIM_KEY_STAR_POINTS,
  DIM_KEY_VARIANT_IDS,
  DIM_KEY_VARIANT_LABELS,
  dimensionalKeyTrialsReadyForNephalem,
  dimensionalKeyVariantIndex,
  dimKeyPieceRollKey,
  getDimensionalKeyVariant,
  getDimensionalKeyVariantId,
} from '@/items/dimensional-key.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), required: true },
});

const emit = defineEmits(['update:rolls']);

const itemsStore = useItemsStore();
const className = computed(
  () => itemsStore.viewerClassName ?? getCharacterInstance()?.className ?? null
);
const showPanel = computed(() => isCharmItem(props.def) && hasCharmExtras(props.def));
const showWormholeCycles = computed(() => isCorruptedWormhole(props.def));
const pools = computed(() => getCharmModifierPools(props.def));
const upgradeEntries = computed(() => getCharmUpgradeEntries(props.def, className.value));
const trophyEntry = computed(() => getCharmTrophyEntry(props.def));
const trophyOptions = computed(() => getCharmTrophyOptions(props.def));
const extraAwakening = computed(() => hasCharmExtraAwakening(props.def));
const paragon = computed(() => getParagonHammerConfig(props.def));
const paragonRegularUsed = computed(() => countParagonRegularUpgrades(props.def, props.rolls));
const paragonRegularLimit = computed(() => Number(paragon.value?.regularLimit) || 0);
const dimKey = computed(() => isDimensionalKeyCharm(props.def));
const dimKeyVariant = computed(() => getDimensionalKeyVariant(props.def, props.rolls));
const dimKeyVariantId = computed(() => getDimensionalKeyVariantId(props.rolls));
const dimKeyNephalemReady = computed(() => dimensionalKeyTrialsReadyForNephalem(props.rolls));
const dimKeyStars = Array.from({ length: DIM_KEY_STAR_COUNT }, (_, i) => i + 1);
const dimKeyDreams = Array.from({ length: DIM_KEY_DREAM_COUNT }, (_, i) => i + 1);
const dimKeyLabOptions = Array.from({ length: DIM_KEY_LAB_MAX + 1 }, (_, i) => i);

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

/**
 * @param {number} poolIndex
 * @param {0|1} high
 */
function setPoolHigh(poolIndex, high) {
  patchRolls({ [charmPoolHighRollKey(poolIndex)]: high });
}

/**
 * @param {{ poolIndex: number, options: Array<{ label: string, low?: string, high?: string }> }} pool
 */
function selectedPoolOption(pool) {
  const idx = Number(props.rolls[`${CHARM_ROLL_KEYS.poolPrefix}${pool.poolIndex}`]) || 0;
  return pool.options[idx] || pool.options[0] || null;
}

/**
 * @param {number} index
 */
function setTrophyIndex(index) {
  /** @type {Record<string, number>} */
  const patch = { [CHARM_ROLL_KEYS.trophyIndex]: index };
  if (index > 0 && Number(props.rolls[CHARM_ROLL_KEYS.trophyIndex2]) === index) {
    patch[CHARM_ROLL_KEYS.trophyIndex2] = 0;
  }
  patchRolls(patch);
}

/**
 * @param {number} index
 */
function setTrophyIndex2(index) {
  const trophyIndex = Number(props.rolls[CHARM_ROLL_KEYS.trophyIndex]) || 0;
  patchRolls({ [CHARM_ROLL_KEYS.trophyIndex2]: index > 0 && index === trophyIndex ? 0 : index });
}

/**
 * @param {number} index
 * @param {boolean} checked
 */
function setParagonRegular(index, checked) {
  const key = `${CHARM_ROLL_KEYS.paragonRegularPrefix}${index}`;
  if (checked && paragonRegularUsed.value >= paragonRegularLimit.value && !props.rolls[key]) {
    return;
  }
  patchRolls({ [key]: checked ? 1 : 0 });
}

/**
 * @param {number} path
 */
function setParagonPath(path) {
  patchRolls({ [CHARM_ROLL_KEYS.paragonPath]: path });
}

/**
 * @param {string} prefix
 * @param {number} n
 * @param {boolean} checked
 */
function setDimKeyPiece(prefix, n, checked) {
  /** @type {Record<string, number>} */
  const patch = { [dimKeyPieceRollKey(prefix, n)]: checked ? 1 : 0 };
  const next = { ...props.rolls, ...patch };
  if (!dimensionalKeyTrialsReadyForNephalem(next)) {
    patch[DIM_KEY_ROLL_KEYS.nephalem] = 0;
  }
  patchRolls(patch);
}

/**
 * @param {number} labs
 */
function setDimKeyLabs(labs) {
  /** @type {Record<string, number>} */
  const patch = { [DIM_KEY_ROLL_KEYS.labs]: labs };
  const next = { ...props.rolls, ...patch };
  if (!dimensionalKeyTrialsReadyForNephalem(next)) {
    patch[DIM_KEY_ROLL_KEYS.nephalem] = 0;
  }
  patchRolls(patch);
}

/**
 * @param {boolean} checked
 */
function setDimKeyInvasion(checked) {
  /** @type {Record<string, number>} */
  const patch = { [DIM_KEY_ROLL_KEYS.invasion]: checked ? 1 : 0 };
  const next = { ...props.rolls, ...patch };
  if (!dimensionalKeyTrialsReadyForNephalem(next)) {
    patch[DIM_KEY_ROLL_KEYS.nephalem] = 0;
  }
  patchRolls(patch);
}

/**
 * @param {boolean} checked
 */
function setDimKeyNephalem(checked) {
  if (checked && !dimKeyNephalemReady.value) return;
  patchRolls({ [DIM_KEY_ROLL_KEYS.nephalem]: checked ? 1 : 0 });
}

/**
 * @param {string} id
 */
function setDimKeyVariant(id) {
  patchRolls({ [DIM_KEY_ROLL_KEYS.variant]: dimensionalKeyVariantIndex(id) });
}
</script>

<template>
  <div v-if="showPanel" class="charm-extras-controls">
    <p class="charm-extras-controls__heading is-size-7 has-text-grey mb-2">Charm options</p>

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

    <WormholeCyclesControls
      v-if="showWormholeCycles"
      :def="def"
      :rolls="rolls"
      @update:rolls="emit('update:rolls', $event)"
    />

    <div v-if="dimKey && dimKeyVariant" class="charm-extras-controls__group">
      <div class="charm-extras-controls__pool">
        <label class="label is-size-7 mb-1">Key type</label>
        <div class="select is-small is-fullwidth">
          <select
            :value="dimKeyVariantId"
            @change="setDimKeyVariant($event.target.value)"
          >
            <option v-for="id in DIM_KEY_VARIANT_IDS" :key="id" :value="id">
              {{ DIM_KEY_VARIANT_LABELS[id] }}
            </option>
          </select>
        </div>
      </div>
      <p class="is-size-7 has-text-grey mb-2 mt-2">Star Chart</p>
      <div class="charm-extras-controls__pieces">
        <label
          v-for="n in dimKeyStars"
          :key="'star-' + n"
          class="checkbox charm-extras-controls__piece"
        >
          <input
            type="checkbox"
            :checked="Boolean(rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.starPrefix, n)])"
            @change="setDimKeyPiece(DIM_KEY_ROLL_KEYS.starPrefix, n, $event.target.checked)"
          />
          {{ n }} +{{ DIM_KEY_STAR_POINTS[n - 1] }}
        </label>
      </div>
      <p class="is-size-7 has-text-grey mb-2 mt-2">Dream Fragments</p>
      <div class="charm-extras-controls__pieces">
        <label
          v-for="n in dimKeyDreams"
          :key="'dream-' + n"
          class="checkbox charm-extras-controls__piece"
        >
          <input
            type="checkbox"
            :checked="Boolean(rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.dreamPrefix, n)])"
            @change="setDimKeyPiece(DIM_KEY_ROLL_KEYS.dreamPrefix, n, $event.target.checked)"
          />
          {{ n }} +{{ DIM_KEY_DREAM_POINTS[n - 1] }}
        </label>
      </div>
      <div class="charm-extras-controls__pool mt-2">
        <label class="label is-size-7 mb-1">Labs added</label>
        <div class="select is-small is-fullwidth">
          <select
            :value="rolls[DIM_KEY_ROLL_KEYS.labs] ?? 0"
            @change="setDimKeyLabs(Number($event.target.value))"
          >
            <option v-for="lab in dimKeyLabOptions" :key="'lab-' + lab" :value="lab">
              <template v-if="lab === 0">None</template>
              <template v-else>T{{ lab }} +{{ DIM_KEY_LAB_MAGIC_FIND[lab] }}% Magic Find</template>
            </option>
          </select>
        </div>
      </div>
      <label class="checkbox charm-extras-controls__check mt-2">
        <input
          type="checkbox"
          :checked="Boolean(rolls[DIM_KEY_ROLL_KEYS.invasion])"
          @change="setDimKeyInvasion($event.target.checked)"
        />
        End the Invasion
      </label>
      <ul v-if="dimKeyVariant.invasion?.length" class="charm-extras-controls__affixes">
        <li v-for="(affix, idx) in dimKeyVariant.invasion" :key="'inv-' + idx">{{ affix }}</li>
      </ul>
      <label class="checkbox charm-extras-controls__check mt-2">
        <input
          type="checkbox"
          :checked="Boolean(rolls[DIM_KEY_ROLL_KEYS.nephalem])"
          :disabled="!rolls[DIM_KEY_ROLL_KEYS.nephalem] && !dimKeyNephalemReady"
          @change="setDimKeyNephalem($event.target.checked)"
        />
        Trial of the Nephalem
      </label>
      <p class="charm-extras-controls__affixes is-size-7 has-text-grey">
        Requires all Star Charts, Dream Fragments, T10 labs, and End the Invasion
      </p>
    </div>

    <div v-for="pool in pools" :key="'pool-' + pool.poolIndex" class="charm-extras-controls__pool">
      <label class="label is-size-7 mb-1">{{ pool.label || 'Modifier choice' }}</label>
      <div class="select is-small is-fullwidth">
        <select
          :value="rolls[`${CHARM_ROLL_KEYS.poolPrefix}${pool.poolIndex}`] ?? 0"
          @change="setPoolChoice(pool.poolIndex, Number($event.target.value))"
        >
          <option v-for="(opt, idx) in pool.options" :key="idx" :value="idx">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div
        v-if="selectedPoolOption(pool)?.low && selectedPoolOption(pool)?.high"
        class="charm-extras-controls__rolls"
      >
        <button
          type="button"
          class="button is-small"
          :class="{
            'is-link': !Number(rolls[charmPoolHighRollKey(pool.poolIndex)]),
          }"
          @click="setPoolHigh(pool.poolIndex, 0)"
        >
          {{ formatCharmPoolRollButton('Low', selectedPoolOption(pool).low) }}
        </button>
        <button
          type="button"
          class="button is-small"
          :class="{
            'is-link': Boolean(Number(rolls[charmPoolHighRollKey(pool.poolIndex)])),
          }"
          @click="setPoolHigh(pool.poolIndex, 1)"
        >
          {{ formatCharmPoolRollButton('High', selectedPoolOption(pool).high) }}
        </button>
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
        No upgrade bonus for this class
      </p>
    </div>

    <div v-if="trophyOptions.length" class="charm-extras-controls__pool">
      <label class="label is-size-7 mb-1">Trophy</label>
      <div class="select is-small is-fullwidth">
        <select
          :value="rolls[CHARM_ROLL_KEYS.trophyIndex] ?? 0"
          @change="setTrophyIndex(Number($event.target.value))"
        >
          <option :value="0">None</option>
          <option v-for="(opt, idx) in trophyOptions" :key="opt.label" :value="idx + 1">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="trophyOptions.length && extraAwakening" class="charm-extras-controls__group">
      <label class="checkbox charm-extras-controls__check">
        <input
          type="checkbox"
          :checked="Boolean(rolls[CHARM_ROLL_KEYS.awakening])"
          @change="setChecked(CHARM_ROLL_KEYS.awakening, $event.target.checked)"
        />
        Extra Awakening
      </label>
      <div v-if="rolls[CHARM_ROLL_KEYS.awakening]" class="charm-extras-controls__pool mt-2">
        <label class="label is-size-7 mb-1">Second trophy</label>
        <div class="select is-small is-fullwidth">
          <select
            :value="rolls[CHARM_ROLL_KEYS.trophyIndex2] ?? 0"
            @change="setTrophyIndex2(Number($event.target.value))"
          >
            <option :value="0">None</option>
            <option
              v-for="(opt, idx) in trophyOptions"
              :key="'aw-' + opt.label"
              :value="idx + 1"
              :disabled="idx + 1 === Number(rolls[CHARM_ROLL_KEYS.trophyIndex])"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="paragon" class="charm-extras-controls__group">
      <p class="is-size-7 has-text-grey mb-2">
        Regular charges: {{ paragonRegularUsed }} / {{ paragonRegularLimit }}
      </p>
      <div
        v-for="(step, idx) in paragon.regularUpgrades || []"
        :key="'pr-' + idx"
        class="charm-extras-controls__group"
      >
        <label class="checkbox charm-extras-controls__check">
          <input
            type="checkbox"
            :checked="Boolean(rolls[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${idx}`])"
            :disabled="!rolls[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${idx}`] && paragonRegularUsed >= paragonRegularLimit"
            @change="setParagonRegular(idx, $event.target.checked)"
          />
          {{ step.label }}
        </label>
        <ul v-if="step.affixes?.length" class="charm-extras-controls__affixes">
          <li v-for="(affix, affixIdx) in step.affixes" :key="affixIdx">{{ affix }}</li>
        </ul>
      </div>
      <div class="charm-extras-controls__pool mt-2">
        <label class="label is-size-7 mb-1">Paragon path</label>
        <div class="select is-small is-fullwidth">
          <select
            :value="rolls[CHARM_ROLL_KEYS.paragonPath] ?? 0"
            @change="setParagonPath(Number($event.target.value))"
          >
            <option :value="0">None</option>
            <option
              v-for="(path, idx) in paragon.paragonPaths || []"
              :key="path.id || path.label"
              :value="idx + 1"
            >
              {{ path.label }}
            </option>
          </select>
        </div>
        <ul
          v-if="paragon.paragonPaths?.[(rolls[CHARM_ROLL_KEYS.paragonPath] ?? 0) - 1]?.affixes?.length"
          class="charm-extras-controls__affixes"
        >
          <li
            v-for="(affix, affixIdx) in paragon.paragonPaths[(rolls[CHARM_ROLL_KEYS.paragonPath] ?? 0) - 1].affixes"
            :key="'path-' + affixIdx"
          >
            {{ affix }}
          </li>
        </ul>
      </div>
      <div v-if="paragon.justicar" class="charm-extras-controls__group mt-2">
        <label class="checkbox charm-extras-controls__check">
          <input
            type="checkbox"
            :checked="Boolean(rolls[CHARM_ROLL_KEYS.paragonJusticar])"
            @change="setChecked(CHARM_ROLL_KEYS.paragonJusticar, $event.target.checked)"
          />
          {{ paragon.justicar.label }}
        </label>
        <ul v-if="paragon.justicar.affixes?.length" class="charm-extras-controls__affixes">
          <li v-for="(affix, affixIdx) in paragon.justicar.affixes" :key="'j-' + affixIdx">
            {{ affix }}
          </li>
        </ul>
        <p v-if="paragon.justicar.hint" class="charm-extras-controls__affixes is-size-7 has-text-grey">
          {{ paragon.justicar.hint }}
        </p>
      </div>
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
.charm-extras-controls__group + .charm-extras-controls__group,
.charm-extras-controls__pool + .charm-extras-controls__pool {
  margin-top: 0.75rem;
}

.charm-extras-controls__rolls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.charm-extras-controls__pieces {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.85rem;
}

.charm-extras-controls__piece {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.charm-extras-controls__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.charm-extras-controls__check + .charm-extras-controls__check {
  margin-top: 0.35rem;
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

.mt-2 {
  margin-top: 0.5rem;
}
</style>
