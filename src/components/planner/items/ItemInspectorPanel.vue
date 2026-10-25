<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  getItemDetailStatRows,
  mergeRollsForDef,
  clampRoll,
  ITEM_CATEGORY_LABEL,
} from '@/items/item-stats.js';
import { EQUIPMENT_SLOT_LABELS, pairedWeaponSlot } from '@/items/item-types.js';
import { MAX_RELICS, isRelicItem } from '@/items/relic-items.js';
import { isCharmItem } from '@/items/charm-items.js';
import ItemDetailPanel from './ItemDetailPanel.vue';
import ItemInspectorTabs from './ItemInspectorTabs.vue';
import { getEffectivePlannerLevel, getCharacterInstance, runPlannerSkillStatRecompute, syncItemGrantedOSkills } from '@/character/planner-core.js';
import { getPlannerItemReqLevelCap } from '@/planner/planner-options.js';
import { hidePlannerSkillTooltip, refreshCurrentTooltip } from '@/tree/tree-tooltip.js';
import { hideItemTooltip, refreshItemTooltips } from '@/items/item-tooltip-runtime.js';
import { isItemCorruptible } from '@/items/corruptions.js';
import { listOilsForItem } from '@/items/oils.js';
import { defHasItemMechanic } from '@/items/item-mechanics.js';
import { canUseMysticOrbOnItem, listMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { getItemUpgradeFlags } from '@/items/item-upgrades.js';

/** @typedef {'base'|'sockets'|'mysticOrbs'|'oils'|'corruptions'|'effigies'|'blessing'|'shrine'|'mechanics'} InspectorTabId */

function afterItemSkillSourcesChanged() {
  syncItemGrantedOSkills();
  refreshCurrentTooltip();
  runPlannerSkillStatRecompute();
}

function refreshOpenItemTooltipsForInstance(id) {
  if (id == null) return;
  void refreshItemTooltips({ instanceId: id });
}

/** Delay before writing slider rolls to the store / character stats. */
const ROLL_APPLY_DELAY_MS = 300;

const itemsStore = useItemsStore();
const { selectedSlot, editingInstanceId, isPickerOpen, enabledRelicCount } =
  storeToRefs(itemsStore);

/** @type {import('vue').Ref<Record<string, number>>} */
const rolls = ref({});

/** @type {import('vue').Ref<InspectorTabId>} */
const activeTab = ref(/** @type {InspectorTabId} */ ('base'));

/** @type {ReturnType<typeof setTimeout>|null} */
let rollApplyTimer = null;
/** @type {{ instanceId: number, rolls: Record<string, number>, def: object|null }|null} */
let pendingRollApply = null;

function clearRollApplyTimer() {
  if (rollApplyTimer != null) {
    clearTimeout(rollApplyTimer);
    rollApplyTimer = null;
  }
}

/**
 * Apply the last pending slider rolls to the store (and character stats when relevant).
 */
function flushPendingRollApply() {
  clearRollApplyTimer();
  const pending = pendingRollApply;
  pendingRollApply = null;
  if (!pending) return;
  // Instance may already be gone (e.g. charm disabled while dragging a slider).
  if (!itemsStore.instances[pending.instanceId]) return;
  itemsStore.updateInstanceRolls(pending.instanceId, pending.rolls);
  refreshOpenItemTooltipsForInstance(pending.instanceId);
  if (pending.def && (isRelicItem(pending.def) || isCharmItem(pending.def))) {
    afterItemSkillSourcesChanged();
  } else if (Object.values(itemsStore.equipment).includes(pending.instanceId)) {
    runPlannerSkillStatRecompute();
  }
}

/**
 * @param {Record<string, number>} merged
 */
function scheduleRollApply(merged) {
  const id = instanceId.value;
  if (id == null) return;
  pendingRollApply = {
    instanceId: id,
    rolls: { ...merged },
    def: itemDef.value,
  };
  clearRollApplyTimer();
  rollApplyTimer = setTimeout(() => {
    rollApplyTimer = null;
    flushPendingRollApply();
  }, ROLL_APPLY_DELAY_MS);
}

const instanceId = computed(() => editingInstanceId.value);

const isEnableListSlot = computed(() => {
  const loc = selectedSlot.value?.location;
  return loc === 'charms' || loc === 'relics';
});

const enableListKind = computed(() => {
  const loc = selectedSlot.value?.location;
  return loc === 'charms' || loc === 'relics' ? loc : null;
});

const selectedDefId = computed(() => {
  if (!isEnableListSlot.value || !selectedSlot.value) return null;
  const id = String(selectedSlot.value.slot || '');
  return id || null;
});

const isListItemEnabled = computed(() => {
  const kind = enableListKind.value;
  const defId = selectedDefId.value;
  if (!kind || !defId) return false;
  return itemsStore.isEnabled(kind, defId);
});

const canEnableListItem = computed(() => {
  if (isListItemEnabled.value) return true;
  if (enableListKind.value !== 'relics') return true;
  return enabledRelicCount.value < MAX_RELICS;
});

const itemDef = computed(() => {
  const id = instanceId.value;
  if (id != null) return itemsStore.getDefForInstance(id);
  // Preview catalog row when a disabled charm/relic is highlighted.
  if (isEnableListSlot.value) {
    const defId = selectedDefId.value;
    return defId ? (itemsStore.catalogById[defId] ?? null) : null;
  }
  return null;
});

const itemIcon = computed(() => {
  const id = instanceId.value;
  if (id != null) return itemsStore.getIconForInstance(id);
  return itemDef.value?.icon || '';
});

const className = computed(
  () => itemsStore.viewerClassName ?? getCharacterInstance()?.className ?? null
);

const showActions = computed(() => itemDef.value != null);

const instanceExtras = computed(() => {
  const id = instanceId.value;
  if (id == null) return [];
  return itemsStore.getExtrasForInstance(id);
});

const instanceMysticOrbs = computed(() => {
  const id = instanceId.value;
  if (id == null) return [];
  return itemsStore.getMysticOrbsForInstance(id);
});

const instanceSocketables = computed(() => {
  const id = instanceId.value;
  if (id == null) return [];
  return itemsStore.getSocketablesForInstance(id);
});

const equipSlot = computed(() => {
  const sel = selectedSlot.value;
  return sel?.location === 'equipment' ? String(sel.slot) : '';
});

const instanceBlessing = computed(() => {
  const id = instanceId.value;
  if (id == null) return '';
  return itemsStore.instances[id]?.blessing || '';
});
const instanceShrine = computed(() => {
  const id = instanceId.value;
  if (id == null) return '';
  return itemsStore.instances[id]?.shrine || '';
});

const rollOptions = computed(() => ({
  className: className.value,
  shrine: instanceShrine.value,
  blessing: instanceBlessing.value,
}));

const effectiveRolls = computed(() => {
  const def = itemDef.value;
  if (!def) return rolls.value;
  return mergeRollsForDef(def, rolls.value, rollOptions.value);
});

const inspectorTabs = computed(() => {
  const def = itemDef.value;
  /** @type {Array<{ id: InspectorTabId, label: string }>} */
  const tabs = [{ id: 'base', label: 'Base item' }];
  if (!def) return tabs;
  if (isCharmItem(def) || isRelicItem(def)) return tabs;
  if (Number(def.sockets) > 0) tabs.push({ id: 'sockets', label: 'Sockets' });
  tabs.push({ id: 'mysticOrbs', label: 'Orbs' });
  const host = {
    shrine: instanceShrine.value,
    blessing: instanceBlessing.value,
    extras: instanceExtras.value,
  };
  const hasEffigy = listMysticOrbsCatalog().some(
    (row) => (row.kind || '') === 'effigy' && canUseMysticOrbOnItem(row, def, 0, host)
  );
  if (hasEffigy) tabs.push({ id: 'effigies', label: 'Effigies' });
  if (listOilsForItem(def, equipSlot.value).length) tabs.push({ id: 'oils', label: 'Oil' });
  const honorific = def.rarity === 'honorific' || def.customQuality === 'honorific';
  const crafted = def.rarity === 'crafted' || def.customQuality === 'crafted';
  if (honorific) tabs.push({ id: 'blessing', label: 'Blessing' });
  else if (isItemCorruptible(def)) tabs.push({ id: 'corruptions', label: 'Corrupt' });
  if (crafted) {
    tabs.push({ id: 'shrine', label: 'Shrine' });
    tabs.push({ id: 'blessing', label: 'Blessing' });
  }
  if (defHasItemMechanic(def)) tabs.push({ id: 'mechanics', label: 'Mechanics' });
  return tabs;
});

const instanceOil = computed(() => {
  const id = instanceId.value;
  if (id == null) return '';
  return itemsStore.instances[id]?.oil || '';
});
const instanceCorruptions = computed(() => {
  const id = instanceId.value;
  if (id == null) return [];
  return itemsStore.instances[id]?.corruptions || [];
});
const instanceMechanics = computed(() => {
  const id = instanceId.value;
  if (id == null) return {};
  return itemsStore.instances[id]?.mechanics || {};
});
const instanceCustom = computed(() => {
  const id = instanceId.value;
  if (id == null) return null;
  return itemsStore.instances[id]?.custom || null;
});
const etherealLocked = computed(() => {
  const id = instanceId.value;
  if (id == null) return false;
  return getItemUpgradeFlags(itemsStore.getUpgradeStateForInstance(id)).etherealForced;
});
const instanceRandomElement = computed(() => {
  const id = instanceId.value;
  if (id == null) return 'fire';
  return itemsStore.instances[id]?.randomElement || 'fire';
});
const instanceEthereal = computed(() => {
  const id = instanceId.value;
  if (id == null) return false;
  if (etherealLocked.value) return true;
  return itemsStore.instances[id]?.ethereal === true;
});

const detailStatRows = computed(() => {
  const def = itemDef.value;
  if (!def) return [];
  const id = instanceId.value;
  return getItemDetailStatRows(def, effectiveRolls.value, {
    characterLevel: getEffectivePlannerLevel(),
    charmInInventory: true,
    className: className.value,
    extras: instanceExtras.value,
    socketables: instanceSocketables.value,
    mysticOrbs: instanceMysticOrbs.value,
    ...(id != null ? itemsStore.getItemBonusOptionsForInstance(id) : {}),
  });
});

const slotLabel = computed(() => {
  const sel = selectedSlot.value;
  if (!sel) return '';
  if (sel.location === 'equipment') {
    return EQUIPMENT_SLOT_LABELS[String(sel.slot)] || String(sel.slot);
  }
  if (sel.location === 'charms') return 'Charms';
  if (sel.location === 'relics') return 'Relics';
  return 'Inventory';
});

const categoryLabel = computed(() => {
  const def = itemDef.value;
  if (!def) return slotLabel.value;
  return ITEM_CATEGORY_LABEL[def.category] || def.category || slotLabel.value;
});

const emptyText = computed(() => {
  if (isEnableListSlot.value) {
    return 'Select a charm or relic to view and edit rolls.';
  }
  return 'Select an equipped item to edit rolls.';
});

const inactiveNotice = computed(() => {
  const sel = selectedSlot.value;
  if (sel?.location !== 'equipment') return '';
  const slot = String(sel.slot);
  // Track this slot, its pair, and class so the notice updates on equip/class change.
  void itemsStore.equipment[slot];
  void itemsStore.viewerClassName;
  const other = pairedWeaponSlot(slot);
  if (other) void itemsStore.equipment[other];
  return itemsStore.equipmentSlotInactiveReason(slot) || '';
});

function loadRolls() {
  const id = instanceId.value;
  if (id != null) {
    const def = itemsStore.getDefForInstance(id);
    rolls.value = def
      ? mergeRollsForDef(def, itemsStore.getRollsForInstance(id), rollOptions.value)
      : {};
    return;
  }
  const def = itemDef.value;
  rolls.value = def ? mergeRollsForDef(def, null, rollOptions.value) : {};
}

// Only reload when the selected item changes — not on every def object touch.
// Keep local rolls when enabling/disabling the same charm/relic in place.
watch(
  [instanceId, () => itemDef.value?.id ?? null],
  (curr, prev) => {
    flushPendingRollApply();
    const [newId, newDefId] = curr;
    const prevId = prev?.[0] ?? null;
    const prevDefId = prev?.[1] ?? null;
    const sameDef = newDefId != null && newDefId === prevDefId;
    if (!sameDef) {
      activeTab.value = 'base';
    }
    if (sameDef && prevId == null && newId != null && Object.keys(rolls.value).length) {
      const def = itemsStore.getDefForInstance(newId) || itemDef.value;
      const merged = def ? mergeRollsForDef(def, rolls.value, rollOptions.value) : rolls.value;
      rolls.value = merged;
      itemsStore.updateInstanceRolls(newId, { ...merged });
      refreshOpenItemTooltipsForInstance(newId);
      if (def && (isRelicItem(def) || isCharmItem(def))) {
        afterItemSkillSourcesChanged();
      }
      return;
    }
    if (sameDef && prevId != null && newId == null) {
      // Disabled while still selected — keep current roll preview.
      return;
    }
    loadRolls();
  },
  { immediate: true }
);

watch(
  inspectorTabs,
  (tabs) => {
    if (!tabs.some((tab) => tab.id === activeTab.value)) activeTab.value = 'base';
  },
  { immediate: true }
);

/**
 * Update local rolls; persist only when an enabled instance exists.
 * @param {Record<string, number>} nextRolls
 */
function persistRolls(nextRolls) {
  clearRollApplyTimer();
  pendingRollApply = null;
  const def = itemDef.value;
  const merged = def ? mergeRollsForDef(def, nextRolls, rollOptions.value) : nextRolls;
  rolls.value = merged;
  const id = instanceId.value;
  if (id == null) return;
  itemsStore.updateInstanceRolls(id, { ...merged });
  refreshOpenItemTooltipsForInstance(id);
  if (def && (isRelicItem(def) || isCharmItem(def))) {
    afterItemSkillSourcesChanged();
  } else if (Object.values(itemsStore.equipment).includes(id)) {
    runPlannerSkillStatRecompute();
  }
}

/**
 * Slider / number edits: update the inspector immediately, apply stats after idle.
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {string|number} raw
 */
function setRoll(key, min, max, raw) {
  const nextVal = clampRoll(Number(raw), min, max);
  const def = itemDef.value;
  const nextRolls = { ...rolls.value, [key]: nextVal };
  const merged = def ? mergeRollsForDef(def, nextRolls, rollOptions.value) : nextRolls;
  rolls.value = merged;
  if (key === 'sockets') {
    persistRolls(merged);
    return;
  }
  scheduleRollApply(merged);
}

/**
 * @param {Record<string, number>} next
 */
function onRollsUpdate(next) {
  persistRolls(next);
}

/**
 * @param {Array<object>} next
 */
function onSocketablesUpdate(next) {
  const id = instanceId.value;
  if (id == null) return;
  hideItemTooltip(true);
  hidePlannerSkillTooltip(true);
  itemsStore.updateInstanceSocketables(id, next);
  refreshOpenItemTooltipsForInstance(id);
  if (Object.values(itemsStore.equipment).includes(id)) {
    runPlannerSkillStatRecompute();
  }
}

/**
 * @param {Array<[number, string]>} next
 */
function onMysticOrbsUpdate(next) {
  const id = instanceId.value;
  if (id == null) return;
  hideItemTooltip(true);
  hidePlannerSkillTooltip(true);
  itemsStore.updateInstanceMysticOrbs(id, next);
  refreshOpenItemTooltipsForInstance(id);
  if (Object.values(itemsStore.equipment).includes(id)) {
    runPlannerSkillStatRecompute();
  }
}

/**
 * @param {() => void} write
 */
function persistUpgrade(write) {
  const id = instanceId.value;
  if (id == null) return;
  hideItemTooltip(true);
  hidePlannerSkillTooltip(true);
  write();
  refreshOpenItemTooltipsForInstance(id);
  if (Object.values(itemsStore.equipment).includes(id)) {
    itemsStore.syncCharacterToItemReqs();
    runPlannerSkillStatRecompute();
  }
}

function onOilUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceOil(instanceId.value, next));
}
function onCorruptionsUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceCorruptions(instanceId.value, next));
}
function onBlessingUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceBlessing(instanceId.value, next));
}
function onShrineUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceShrine(instanceId.value, next));
}
function onMechanicsUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceMechanics(instanceId.value, next));
}
function onCustomUpdate(next) {
  persistUpgrade(() => itemsStore.updateInstanceCustom(instanceId.value, next));
}
function onEtherealUpdate(next) {
  persistUpgrade(() => itemsStore.setInstanceEthereal(instanceId.value, Boolean(next)));
}
function onRandomElementUpdate(next) {
  persistUpgrade(() => itemsStore.setInstanceRandomElement(instanceId.value, next));
}

function onChangeItem() {
  if (isEnableListSlot.value) return;
  itemsStore.openPicker();
}

function onRemove() {
  if (selectedSlot.value) {
    itemsStore.removeItem(selectedSlot.value);
    itemsStore.clearSelection();
    afterItemSkillSourcesChanged();
  }
}

function onToggleEnableListItem() {
  const kind = enableListKind.value;
  const defId = selectedDefId.value;
  if (!kind || !defId) return;
  if (isListItemEnabled.value) {
    if (kind === 'charms') itemsStore.toggleCharm(defId, false);
    else itemsStore.toggleRelic(defId, false);
  } else {
    if (!canEnableListItem.value) return;
    const seed = { ...rolls.value };
    if (kind === 'charms') itemsStore.toggleCharm(defId, true, seed);
    else itemsStore.toggleRelic(defId, true, seed);
  }
  if (kind === 'charms' || kind === 'relics') {
    afterItemSkillSourcesChanged();
  }
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (isPickerOpen.value) return;
  if (instanceId.value != null || isEnableListSlot.value) {
    itemsStore.clearSelection();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  flushPendingRollApply();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section class="planner-item-inspector" aria-labelledby="planner-item-inspector-title">
    <div class="planner-item-inspector__top">
      <div class="planner-item-inspector__bar">
        <h3 id="planner-item-inspector-title" class="planner-items-section-title">
          {{ itemDef ? categoryLabel : 'Item' }}
        </h3>
        <div v-if="showActions" class="planner-item-inspector__actions">
          <button
            v-if="!isEnableListSlot"
            type="button"
            class="button is-small"
            @click="onChangeItem"
          >
            Change
          </button>
          <button
            v-if="isEnableListSlot"
            type="button"
            class="button is-small"
            :class="isListItemEnabled ? 'is-danger is-outlined' : 'is-success is-outlined'"
            :disabled="!isListItemEnabled && !canEnableListItem"
            @click="onToggleEnableListItem"
          >
            {{ isListItemEnabled ? 'Disable' : 'Enable' }}
          </button>
          <button
            v-else
            type="button"
            class="button is-small is-danger is-outlined"
            @click="onRemove"
          >
            Remove
          </button>
        </div>
      </div>
      <ItemInspectorTabs v-if="itemDef" v-model="activeTab" :tabs="inspectorTabs" />
    </div>

    <p v-if="inactiveNotice" class="is-size-7 has-text-danger px-3 mb-2" role="status">
      {{ inactiveNotice }}
    </p>

    <ItemDetailPanel
      :def="itemDef"
      :icon="itemIcon"
      :rolls="rolls"
      :effective-rolls="effectiveRolls"
      :detail-stat-rows="detailStatRows"
      :extras="instanceExtras"
      :mystic-orbs="instanceMysticOrbs"
      :socketables="instanceSocketables"
      :active-tab="activeTab"
      :can-edit="instanceId != null"
      :empty-text="emptyText"
      :character-level="getPlannerItemReqLevelCap(getEffectivePlannerLevel())"
      :equip-slot="equipSlot"
      :oil="instanceOil"
      :corruptions="instanceCorruptions"
      :blessing="instanceBlessing"
      :shrine="instanceShrine"
      :mechanics="instanceMechanics"
      :custom="instanceCustom"
      :ethereal="instanceEthereal"
      :ethereal-locked="etherealLocked"
      :random-element="instanceRandomElement"
      @update:rolls="onRollsUpdate"
      @set-roll="setRoll"
      @update:socketables="onSocketablesUpdate"
      @update:mystic-orbs="onMysticOrbsUpdate"
      @update:oil="onOilUpdate"
      @update:corruptions="onCorruptionsUpdate"
      @update:blessing="onBlessingUpdate"
      @update:shrine="onShrineUpdate"
      @update:mechanics="onMechanicsUpdate"
      @update:custom="onCustomUpdate"
      @update:ethereal="onEtherealUpdate"
      @update:random-element="onRandomElementUpdate"
    />
  </section>
</template>
