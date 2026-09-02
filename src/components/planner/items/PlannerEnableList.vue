<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { MAX_RELICS, resolveRelicSkill } from '@/items/relic-items.js';
import { usePlannerRevisionRefresh } from '@/composables/usePlannerRevisionRefresh.js';
import { getSkillIconHTML } from '@/shared/utils.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '@/shared/version-config.js';
import { runPlannerSkillStatRecompute, syncItemGrantedOSkills } from '@/character/planner-core.js';
import { refreshCurrentTooltip } from '@/tree/tree-tooltip.js';
import ItemIcon from './ItemIcon.vue';
import SkillCardImage from '@/components/skills/SkillCardImage.vue';

const props = defineProps({
  /** @type {'charms'|'relics'} */
  kind: { type: String, required: true },
});

const itemsStore = useItemsStore();
const { selectedSlot, enabledRelicCount, enabledCharms, enabledRelics } =
  storeToRefs(itemsStore);

const search = ref('');

const isCharms = computed(() => props.kind === 'charms');
const isRelics = computed(() => props.kind === 'relics');

function refreshClassFilter() {
  itemsStore.syncViewerClassName();
}

onMounted(refreshClassFilter);
usePlannerRevisionRefresh(refreshClassFilter);

const catalog = computed(() =>
  isCharms.value ? itemsStore.charmCatalog : itemsStore.relicCatalog
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return catalog.value;
  return catalog.value.filter(
    (d) =>
      String(d.name || '')
        .toLowerCase()
        .includes(q) || String(d.id || '').toLowerCase().includes(q)
  );
});

const atRelicCap = computed(
  () => isRelics.value && enabledRelicCount.value >= MAX_RELICS
);

const iconFolder = computed(() => versionToTreeAssetFolder(getCurrentVersion()));

/**
 * @param {object} def
 * @returns {boolean}
 */
function isEnabled(def) {
  if (isCharms.value) return enabledCharms.value[def.id] != null;
  return enabledRelics.value[def.id] != null;
}

/**
 * @param {object} def
 * @returns {boolean}
 */
function isSelected(def) {
  const sel = selectedSlot.value;
  return (
    sel != null &&
    sel.location === props.kind &&
    String(sel.slot) === String(def.id)
  );
}

/**
 * @param {object} def
 * @returns {boolean}
 */
function checkboxDisabled(def) {
  return isRelics.value && atRelicCap.value && !isEnabled(def);
}

/**
 * @param {object} def
 * @returns {string}
 */
function relicIconMarkup(def) {
  const skill = resolveRelicSkill(def);
  if (!skill?.image) return '';
  return getSkillIconHTML(skill.image, skill.className, 'is-48x48', iconFolder.value);
}

/**
 * @param {object} def
 */
function onSelectRow(def) {
  itemsStore.selectEnabledItem(/** @type {'charms'|'relics'} */ (props.kind), def.id);
}

/**
 * @param {object} def
 * @param {Event} event
 */
function onCheckboxChange(def, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const want = input.checked;
  const ok = isCharms.value
    ? itemsStore.toggleCharm(def.id, want)
    : itemsStore.toggleRelic(def.id, want);
  // Keep DOM in sync if enable was rejected (e.g. relic cap).
  if (!ok) input.checked = isEnabled(def);
  if (ok) {
    refreshCurrentTooltip();
    syncItemGrantedOSkills();
    runPlannerSkillStatRecompute();
  }
}

function onEnableAllCharms() {
  itemsStore.enableAllCharms();
  refreshCurrentTooltip();
  syncItemGrantedOSkills();
  runPlannerSkillStatRecompute();
}
</script>

<template>
  <section class="planner-enable-list" :aria-label="isCharms ? 'Charms' : 'Relics'">
    <div class="planner-enable-list__toolbar">
      <div class="control has-icons-left planner-enable-list__search">
        <input
          v-model="search"
          class="input is-small"
          type="search"
          :placeholder="isCharms ? 'Search charms...' : 'Search relics...'"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="icon is-left is-small"><i class="fa-solid fa-magnifying-glass"></i></span>
      </div>
      <button
        v-if="isCharms"
        type="button"
        class="button is-small"
        @click="onEnableAllCharms"
      >
        Enable every charm
      </button>
      <span v-else class="planner-enable-list__cap is-size-7">
        {{ enabledRelicCount }} / {{ MAX_RELICS }}
      </span>
    </div>

    <ul class="planner-enable-list__rows" role="listbox" :aria-label="isCharms ? 'Charm list' : 'Relic list'">
      <li v-if="filtered.length === 0" class="planner-enable-list__empty">No matching items</li>
      <li
        v-for="def in filtered"
        :key="def.id"
        class="planner-enable-list__row"
        :class="[
          'planner-enable-list__row--' + (def.rarity || 'normal'),
          {
            'is-selected': isSelected(def),
            'is-enabled': isEnabled(def),
            'is-disabled': checkboxDisabled(def),
          },
        ]"
        role="option"
        :aria-selected="isSelected(def)"
        tabindex="0"
        @click="onSelectRow(def)"
        @keydown.enter.prevent="onSelectRow(def)"
      >
        <label class="planner-enable-list__check" @click.stop>
          <input
            type="checkbox"
            :checked="isEnabled(def)"
            :disabled="checkboxDisabled(def)"
            :aria-label="'Enable ' + def.name"
            @change="onCheckboxChange(def, $event)"
          />
        </label>
        <div class="planner-enable-list__icon">
          <SkillCardImage
            v-if="isRelics && relicIconMarkup(def)"
            :icon-markup="relicIconMarkup(def)"
          />
          <ItemIcon v-else :def="def" fill />
        </div>
        <span class="planner-enable-list__name">{{ def.name }}</span>
      </li>
    </ul>
  </section>
</template>
