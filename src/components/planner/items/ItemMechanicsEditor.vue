<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  assurCounts,
  assurLightRadiusRemoved,
  assurMaxForUpgrade,
  assurMechanicForDef,
  assurPurifierCount,
  assurRequiredLevelBonus,
  assurUpgradeDisplayLines,
  assurUpgradeGroup,
  getMechanicBonusLines,
  mechanicsWithAssurCount,
  restoreMechanicForDef,
  restorePercent,
} from '@/items/item-mechanics.js';
import { formatRequiredLevelBonusLine } from '@/items/mystic-orbs.js';
import { itemRequirementsExceedCharacterLevel } from '@/items/item-requirements.js';
import { getItemIconUrl } from '@/shared/utils.js';
import { hideItemTooltip } from '@/items/item-tooltip-runtime.js';
import { hidePlannerSkillTooltip } from '@/tree/tree-tooltip.js';

const props = defineProps({
  def: { type: Object, default: null },
  mechanics: { type: Object, default: () => ({}) },
  rolls: { type: Object, default: () => ({}) },
  extras: { type: Array, default: () => [] },
  socketables: { type: Array, default: () => [] },
  mysticOrbs: { type: Array, default: () => [] },
  corruptions: { type: Array, default: () => [] },
  characterLevel: { type: Number, default: null },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:mechanics']);

const menuOpen = ref(false);

const restore = computed(() => restoreMechanicForDef(props.def));
const assur = computed(() => assurMechanicForDef(props.def));
const applications = computed(() => Math.floor(Number(props.mechanics?.restore) || 0));
const percent = computed(() => (restore.value ? restorePercent(restore.value, applications.value) : 0));
const lines = computed(() => getMechanicBonusLines(props.def, props.mechanics));

const counts = computed(() => assurCounts(props.mechanics));
const lightRadiusRemoved = computed(() =>
  assurLightRadiusRemoved(assur.value, counts.value)
);
const lightRadiusRemaining = computed(() =>
  (Number(assur.value?.baseLightRadius) || 0) - lightRadiusRemoved.value
);
const purifierCount = computed(() => assurPurifierCount(assur.value, counts.value));
const requiredLevelBonus = computed(() =>
  assurRequiredLevelBonus(assur.value, counts.value)
);

const scrollIconUrl = getItemIconUrl('invbsc');

const appliedUpgrades = computed(() =>
  (assur.value?.upgrades || []).filter((up) => (counts.value[up.id] || 0) > 0)
);

/**
 * @param {Record<string, number>} nextMechanics
 */
function reqOptions(nextMechanics) {
  return {
    rolls: props.rolls,
    extras: props.extras,
    socketables: props.socketables,
    mysticOrbs: props.mysticOrbs,
    corruptions: props.corruptions,
    mechanics: nextMechanics,
  };
}

/**
 * @param {Record<string, number>} nextMechanics
 */
function fitsCharacterLevel(nextMechanics) {
  return !itemRequirementsExceedCharacterLevel(
    props.def,
    reqOptions(nextMechanics),
    props.characterLevel
  );
}

/**
 * @param {import('@/items/item-mechanics.js').AssurUpgrade} up
 * @param {number} nextCount
 */
function canSetCount(up, nextCount) {
  if (!assur.value) return false;
  const n = Math.floor(Number(nextCount));
  if (!Number.isFinite(n) || n < 1) return false;
  if (assurMaxForUpgrade(assur.value, counts.value, up) < n) return false;
  return fitsCharacterLevel(mechanicsWithAssurCount(props.mechanics, up.id, n));
}

const addable = computed(() =>
  (assur.value?.upgrades || []).filter((up) => {
    if ((counts.value[up.id] || 0) > 0) return false;
    return canSetCount(up, 1);
  })
);

const catalogGroups = computed(() => {
  /** @type {Record<string, import('@/items/item-mechanics.js').AssurUpgrade[]>} */
  const groups = { Upgrade: [], 'Light Radius': [], 'Replaces Purify': [] };
  for (const up of addable.value) groups[assurUpgradeGroup(up)].push(up);
  return groups;
});

/**
 * @param {string} id
 * @returns {number}
 */
function countFor(id) {
  return counts.value[id] || 0;
}

/**
 * @param {string} id
 * @returns {number}
 */
function maxFor(id) {
  const up = (assur.value?.upgrades || []).find((row) => row.id === id);
  if (!up || !assur.value) return 0;
  return assurMaxForUpgrade(assur.value, counts.value, up);
}

function persist(next) {
  emit('update:mechanics', next);
}

function setRestore(raw) {
  if (!restore.value) return;
  let n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) n = 0;
  n = Math.max(0, Math.min(restore.value.maxApplications, n));
  persist({ ...props.mechanics, restore: n });
}

/**
 * @param {string} id
 */
function addScroll(id) {
  const up = (assur.value?.upgrades || []).find((row) => row.id === id);
  if (!up || !canSetCount(up, 1)) return;
  persist(mechanicsWithAssurCount(props.mechanics, id, 1));
  menuOpen.value = false;
}

/**
 * @param {string} id
 * @param {string|number} raw
 */
function setAssur(id, raw) {
  const up = (assur.value?.upgrades || []).find((row) => row.id === id);
  if (!up || !assur.value) return;
  let n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return;
  if (n < 1) n = 1;
  n = Math.min(assurMaxForUpgrade(assur.value, counts.value, up), n);
  while (n > 1 && !canSetCount(up, n)) n -= 1;
  if (!canSetCount(up, n)) return;
  persist(mechanicsWithAssurCount(props.mechanics, id, n));
}

/**
 * @param {string} id
 */
function removeScroll(id) {
  persist(mechanicsWithAssurCount(props.mechanics, id, 0));
}

function dismissHoverTooltips() {
  hideItemTooltip(true);
  hidePlannerSkillTooltip(true);
}

function toggleMenu() {
  if (!props.editable || !addable.value.length) return;
  dismissHoverTooltips();
  menuOpen.value = !menuOpen.value;
}

/**
 * @param {MouseEvent} e
 */
function onDocClick(e) {
  const t = e.target;
  if (t instanceof Element && t.closest('.item-mo-editor__picker')) return;
  menuOpen.value = false;
}

/**
 * @param {KeyboardEvent} e
 */
function onDocKey(e) {
  if (e.key === 'Escape') menuOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKey, true);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onDocKey, true);
});
</script>

<template>
  <div class="item-upgrade-section" aria-label="Item mechanics">
    <template v-if="restore">
      <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">
        {{ restore.label || 'Mechanics' }}
      </p>
      <div class="item-mo-editor__row mb-2">
        <span class="item-mo-editor__name">Restore +{{ percent }}%</span>
        <input
          v-if="editable"
          class="input item-picker-modal__roll-input"
          type="number"
          min="0"
          :max="restore.maxApplications"
          :value="applications"
          @change="setRestore($event.target.value)"
        />
      </div>
      <p v-if="restore.hint" class="is-size-7 has-text-grey mb-2">{{ restore.hint }}</p>
      <div class="item-upgrade-section__mods">
        <div v-for="(line, i) in lines" :key="i" class="item-upgrade-section__mod">{{ line }}</div>
      </div>
    </template>

    <template v-if="assur">
      <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">
        {{ assur.label || "Assur's Bane Upgrade" }}
        <span v-if="requiredLevelBonus">{{ formatRequiredLevelBonusLine(requiredLevelBonus) }}</span>
      </p>
      <p class="item-upgrade-section__note is-size-7 has-text-grey">
        Light Radius remaining: {{ lightRadiusRemaining }} / {{ assur.baseLightRadius || 0 }}
        <span v-if="purifierCount"> · Purify replaced</span>
      </p>
      <div v-if="editable" class="item-mo-editor__add">
        <div class="item-sockets-editor__picker item-mo-editor__picker" @mousedown="dismissHoverTooltips">
          <button
            type="button"
            class="item-sockets-editor__trigger"
            :disabled="!addable.length"
            :aria-expanded="menuOpen"
            aria-haspopup="listbox"
            @click.stop="toggleMenu"
          >
            <span class="item-sockets-editor__icon item-sockets-editor__icon--empty" aria-hidden="true"></span>
            <span class="item-sockets-editor__empty-label">Add upgrade scroll…</span>
          </button>
          <div v-if="menuOpen" class="item-sockets-editor__menu" role="listbox">
            <template v-for="(groupRows, label) in catalogGroups" :key="label">
              <template v-if="groupRows.length">
                <div class="item-sockets-editor__group">{{ label }}</div>
                <button
                  v-for="up in groupRows"
                  :key="up.id"
                  type="button"
                  class="item-sockets-editor__option"
                  role="option"
                  @click.stop="addScroll(up.id)"
                >
                  <img v-if="scrollIconUrl" class="item-sockets-editor__icon" :src="scrollIconUrl" alt="" />
                  <span
                    v-else
                    class="item-sockets-editor__icon item-sockets-editor__icon--empty"
                    aria-hidden="true"
                  ></span>
                  <span class="item-sockets-editor__option-text">
                    <span>{{ up.label }}</span>
                    <span
                      v-for="(mod, midx) in up.lines.filter((line) => line !== up.label)"
                      :key="up.id + '-mod-' + midx"
                      class="item-sockets-editor__option-bonus"
                    >
                      {{ mod }}
                    </span>
                    <span
                      v-if="up.requiredLevel"
                      class="item-sockets-editor__option-bonus"
                    >
                      {{ formatRequiredLevelBonusLine(up.requiredLevel) }}
                    </span>
                  </span>
                </button>
              </template>
            </template>
          </div>
        </div>
      </div>
      <ul v-if="appliedUpgrades.length" class="item-upgrade-section__list">
        <li v-for="up in appliedUpgrades" :key="up.id" class="item-upgrade-section__item">
          <div class="item-mo-editor__row">
            <img v-if="scrollIconUrl" class="item-sockets-editor__icon" :src="scrollIconUrl" alt="" />
            <span
              v-else
              class="item-sockets-editor__icon item-sockets-editor__icon--empty"
              aria-hidden="true"
            ></span>
            <span class="item-mo-editor__name">{{ up.label }}</span>
            <input
              v-if="editable"
              class="input item-picker-modal__roll-input"
              type="number"
              min="1"
              :max="maxFor(up.id)"
              step="1"
              :value="countFor(up.id)"
              :aria-label="'Applications of ' + up.label + ' (' + countFor(up.id) + '/' + maxFor(up.id) + ')'"
              @change="setAssur(up.id, $event.target.value)"
            />
            <button
              v-if="editable"
              type="button"
              class="button is-small is-danger is-outlined"
              @click="removeScroll(up.id)"
            >
              Remove
            </button>
          </div>
          <div
            v-if="assurUpgradeDisplayLines(up, countFor(up.id)).length"
            class="item-upgrade-section__mods"
          >
            <div
              v-for="(mod, midx) in assurUpgradeDisplayLines(up, countFor(up.id))"
              :key="up.id + '-applied-' + midx"
              class="item-upgrade-section__mod"
            >
              {{ mod }}
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">
        No upgrade scrolls applied.
      </p>
    </template>

    <p v-if="!restore && !assur" class="item-upgrade-section__empty is-size-7 has-text-grey">
      No mechanics on this item.
    </p>
  </div>
</template>
