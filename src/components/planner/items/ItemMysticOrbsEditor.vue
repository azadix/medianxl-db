<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  canUseMysticOrbOnItem,
  formatMysticOrbRows,
  formatRequiredLevelBonusLine,
  getMysticOrbDisplayLines,
  listMysticOrbsCatalog,
  lookupMysticOrb,
  mysticOrbIcon,
  mysticOrbKind,
  mysticOrbMaxStacks,
  mysticOrbNameCssClass,
  mysticOrbsRequiredLevelBonus,
  normalizeMysticOrbs,
} from '@/items/mystic-orbs.js';
import {
  itemAllowsMysticOrbReqLevel,
  itemRequirementsExceedCharacterLevel,
} from '@/items/item-requirements.js';
import { getItemIconUrl } from '@/shared/utils.js';
import { hideItemTooltip } from '@/items/item-tooltip-runtime.js';
import { hidePlannerSkillTooltip } from '@/tree/tree-tooltip.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), default: () => ({}) },
  extras: { type: Array, default: () => [] },
  socketables: { type: Array, default: () => [] },
  mysticOrbs: { type: Array, default: () => [] },
  characterLevel: { type: Number, default: null },
  editable: { type: Boolean, default: false },
  kinds: { type: Array, default: null },
  heading: { type: String, default: 'Mystic Orbs' },
  emptyText: { type: String, default: 'No mystic orbs applied.' },
  addLabel: { type: String, default: 'Add mystic orb…' },
  importNote: { type: String, default: '' },
  shrine: { type: String, default: '' },
  blessing: { type: String, default: '' },
});

const emit = defineEmits(['update:mystic-orbs']);

const menuOpen = ref(false);

/**
 * @param {string} name
 */
function matchesKinds(name) {
  if (!Array.isArray(props.kinds) || !props.kinds.length) return true;
  const kind = lookupMysticOrb(name)?.kind || 'umo';
  return props.kinds.includes(kind);
}

const allOrbs = computed(() => normalizeMysticOrbs(props.mysticOrbs));
const applied = computed(() => allOrbs.value.filter((entry) => matchesKinds(entry[1])));
const reqLevelBonus = computed(() => mysticOrbsRequiredLevelBonus(applied.value));

const countByName = computed(() => {
  /** @type {Record<string, number>} */
  const map = {};
  for (const [count, name] of applied.value) map[name] = count;
  return map;
});

const rows = computed(() => formatMysticOrbRows(applied.value));

const hostState = computed(() => ({
  shrine: props.shrine,
  blessing: props.blessing,
  extras: props.extras,
}));

/**
 * @param {Array<[number, string]>} next
 */
function orbReqOptions(next) {
  return {
    rolls: props.rolls,
    extras: props.extras,
    socketables: props.socketables,
    mysticOrbs: next,
  };
}

function fitsCharacterLevel(next) {
  return !itemRequirementsExceedCharacterLevel(
    props.def,
    orbReqOptions(next),
    props.characterLevel
  );
}

/**
 * @param {string} name
 * @param {number} count
 * @returns {Array<[number, string]>}
 */
function orbsWithCount(name, count) {
  const next = allOrbs.value.map((entry) => /** @type {[number, string]} */ ([entry[0], entry[1]]));
  const idx = next.findIndex((entry) => entry[1] === name);
  if (count < 1) {
    if (idx >= 0) next.splice(idx, 1);
    return next;
  }
  if (idx >= 0) next[idx] = [count, name];
  else next.push([count, name]);
  return next;
}

const addable = computed(() =>
  listMysticOrbsCatalog().filter((row) => {
    if (Array.isArray(props.kinds) && props.kinds.length) {
      const kind = row.kind || 'umo';
      if (!props.kinds.includes(kind)) return false;
    }
    const have = countByName.value[row.name] || 0;
    if (!canUseMysticOrbOnItem(row, props.def, have, hostState.value)) return false;
    const next = orbsWithCount(row.name, have + 1);
    if (!itemAllowsMysticOrbReqLevel(props.def, orbReqOptions(next), row.name, have + 1)) {
      return false;
    }
    return fitsCharacterLevel(next);
  })
);

const catalogGroups = computed(() => {
  /** @type {Record<string, ReturnType<typeof listMysticOrbsCatalog>>} */
  const groups = { Unique: [], Rare: [], 'Mystic Orb': [], Effigy: [] };
  for (const row of addable.value) {
    const kind = mysticOrbKind(row.name);
    const key =
      kind === 'unique'
        ? 'Unique'
        : kind === 'rare'
          ? 'Rare'
          : kind === 'effigy'
            ? 'Effigy'
            : 'Mystic Orb';
    groups[key].push(row);
  }
  return groups;
});

/**
 * @param {Array<[number, string]>} next
 */
function persist(next) {
  emit('update:mystic-orbs', normalizeMysticOrbs(next));
}

/**
 * @param {string|import('@/items/mystic-orbs.js').MysticOrbCatalogRow|null|undefined} orb
 */
function orbIconUrl(orb) {
  return getItemIconUrl(mysticOrbIcon(orb));
}

/**
 * @param {string} name
 */
function addOrb(name) {
  const label = String(name || '').trim();
  const have = countByName.value[label] || 0;
  if (!label || !canUseMysticOrbOnItem(label, props.def, have, hostState.value)) return;
  const next = orbsWithCount(label, have + 1);
  if (!itemAllowsMysticOrbReqLevel(props.def, orbReqOptions(next), label, have + 1)) return;
  if (!fitsCharacterLevel(next)) return;
  persist(next);
  menuOpen.value = false;
}

/**
 * @param {string} name
 * @param {string|number} raw
 */
function setCount(name, raw) {
  const max = mysticOrbMaxStacks(name);
  let value = Math.floor(Number(raw));
  if (!Number.isFinite(value)) return;
  if (value < 1) value = 1;
  value = Math.min(max, value);
  while (value > 1 && !canUseMysticOrbOnItem(name, props.def, value - 1, hostState.value)) value -= 1;
  while (value > 1 && !itemAllowsMysticOrbReqLevel(props.def, orbReqOptions(orbsWithCount(name, value)), name, value)) {
    value -= 1;
  }
  while (value > 1 && !fitsCharacterLevel(orbsWithCount(name, value))) value -= 1;
  if (!itemAllowsMysticOrbReqLevel(props.def, orbReqOptions(orbsWithCount(name, value)), name, value)) return;
  if (!fitsCharacterLevel(orbsWithCount(name, value))) return;
  persist(orbsWithCount(name, value));
}

/**
 * @param {string} name
 */
function removeOrb(name) {
  persist(allOrbs.value.filter((entry) => entry[1] !== name));
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
  <div class="item-upgrade-section" :aria-label="heading">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">
      {{ heading }}
      <span v-if="reqLevelBonus">{{ formatRequiredLevelBonusLine(reqLevelBonus) }}</span>
    </p>
    <p v-if="importNote" class="item-upgrade-section__note is-size-7 has-text-grey">{{ importNote }}</p>
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
          <span class="item-sockets-editor__empty-label">{{ addLabel }}</span>
        </button>
        <div v-if="menuOpen" class="item-sockets-editor__menu" role="listbox">
          <template v-for="(groupRows, label) in catalogGroups" :key="label">
            <template v-if="groupRows.length">
              <div class="item-sockets-editor__group">{{ label }}</div>
              <button
                v-for="row in groupRows"
                :key="row.name"
                type="button"
                class="item-sockets-editor__option"
                role="option"
                @click.stop="addOrb(row.name)"
              >
                <img
                  v-if="orbIconUrl(row)"
                  class="item-sockets-editor__icon"
                  :src="orbIconUrl(row)"
                  alt=""
                />
                <span
                  v-else
                  class="item-sockets-editor__icon item-sockets-editor__icon--empty"
                  aria-hidden="true"
                ></span>
                <span class="item-sockets-editor__option-text">
                  <span :class="mysticOrbNameCssClass(row.name)">{{ row.name }}</span>
                  <span
                    v-for="(mod, midx) in getMysticOrbDisplayLines(row.name, 1)"
                    :key="row.name + '-mod-' + midx"
                    class="item-sockets-editor__option-bonus"
                  >
                    {{ mod }}
                  </span>
                </span>
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>
    <ul v-if="rows.length" class="item-upgrade-section__list">
      <li v-for="(orb, idx) in rows" :key="'mo-' + idx" class="item-upgrade-section__item">
        <div class="item-mo-editor__row">
          <img
            v-if="orbIconUrl(orb.name)"
            class="item-sockets-editor__icon"
            :src="orbIconUrl(orb.name)"
            alt=""
          />
          <span
            v-else
            class="item-sockets-editor__icon item-sockets-editor__icon--empty"
            aria-hidden="true"
          ></span>
          <span class="item-mo-editor__name" :class="mysticOrbNameCssClass(orb.kind)">{{
            orb.name
          }}</span>
          <input
            v-if="editable"
            class="input item-picker-modal__roll-input"
            type="number"
            min="1"
            :max="mysticOrbMaxStacks(orb.name)"
            step="1"
            :value="countByName[orb.name] || 1"
            :aria-label="'Stacks of ' + orb.name + ' (' + (countByName[orb.name] || 1) + '/' + mysticOrbMaxStacks(orb.name) + ')'"
            @change="setCount(orb.name, $event.target.value)"
          />
          <button
            v-if="editable"
            type="button"
            class="button is-small is-danger is-outlined"
            @click="removeOrb(orb.name)"
          >
            Remove
          </button>
        </div>
        <div v-if="orb.mods.length" class="item-upgrade-section__mods">
          <div
            v-for="(mod, midx) in orb.mods"
            :key="'mo-mod-' + idx + '-' + midx"
            class="item-upgrade-section__mod"
          >
            {{ mod }}
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">
      {{ emptyText }}
    </p>
  </div>
</template>
