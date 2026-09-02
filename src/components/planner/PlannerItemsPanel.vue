<script setup>
import { onMounted, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import EquipmentSlot from './items/EquipmentSlot.vue';
import ItemPickerModal from './items/ItemPickerModal.vue';
import ItemInspectorPanel from './items/ItemInspectorPanel.vue';
import ItemTooltipHost from './items/ItemTooltipHost.vue';
import PlannerEnableList from './items/PlannerEnableList.vue';
import { plannerResetItemsClick } from '@/planner/planner-dom-handlers.js';

/** @typedef {'equipment' | 'charms' | 'relics'} ItemsTabId */

const ITEMS_TABS = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'charms', label: 'Charms' },
  { id: 'relics', label: 'Relics' },
];

const itemsStore = useItemsStore();
const { weaponSet } = storeToRefs(itemsStore);

/** @type {import('vue').Ref<ItemsTabId>} */
const activeItemsTab = ref('equipment');

const weaponSlot = computed(() => (weaponSet.value === 1 ? 'rarm2' : 'rarm'));
const offhandSlot = computed(() => (weaponSet.value === 1 ? 'larm2' : 'larm'));

onMounted(() => {
  itemsStore.loadCatalog();
});

/** @param {0|1} set */
function setWeaponSet(set) {
  itemsStore.setWeaponSet(set);
}

/** @param {ItemsTabId} tabId */
function switchItemsTab(tabId) {
  if (activeItemsTab.value === tabId) return;
  activeItemsTab.value = tabId;
  itemsStore.clearSelection();
}
</script>

<template>
  <div class="planner-items-panel">
    <div class="tabs planner-items-tabs">
      <ul>
        <li
          v-for="tab in ITEMS_TABS"
          :key="tab.id"
          :class="{ 'is-active': activeItemsTab === tab.id }"
        >
          <a href="#" @click.prevent="switchItemsTab(tab.id)">{{ tab.label }}</a>
        </li>
      </ul>
      <button
        id="resetItemsBtn"
        class="button is-danger is-outlined is-small"
        type="button"
        @click="plannerResetItemsClick"
      >
        <span class="icon"><i class="fa-solid fa-rotate-left"></i></span>
        <span>Reset items</span>
      </button>
    </div>

    <div class="planner-items-layout">
      <div class="planner-items-page">
        <section
          v-show="activeItemsTab === 'equipment'"
          class="planner-equipment-panel"
          aria-label="Equipment"
        >
          <div class="planner-equipment-grid">
            <div class="planner-equipment-weapon-col planner-equipment-weapon-col--left">
              <div class="planner-equipment-weapon-tabs" role="group" aria-label="Left weapon set">
                <button
                  type="button"
                  class="button is-small"
                  :class="{ 'is-active': weaponSet === 0 }"
                  @click="setWeaponSet(0)"
                >
                  I
                </button>
                <button
                  type="button"
                  class="button is-small"
                  :class="{ 'is-active': weaponSet === 1 }"
                  @click="setWeaponSet(1)"
                >
                  II
                </button>
              </div>
              <EquipmentSlot label="Weapon" :slot-key="weaponSlot" />
            </div>

            <div class="planner-equipment-center">
              <EquipmentSlot label="Head" slot-key="head" class="planner-equipment-head" />
              <EquipmentSlot label="Amulet" slot-key="neck" class="planner-equipment-amulet" />
              <EquipmentSlot label="Torso" slot-key="tors" class="planner-equipment-torso" />
              <EquipmentSlot label="Ring Left" slot-key="lrin" class="planner-equipment-ring-l" />
              <EquipmentSlot label="Belt" slot-key="belt" class="planner-equipment-belt" />
              <EquipmentSlot label="Ring Right" slot-key="rrin" class="planner-equipment-ring-r" />
            </div>

            <div class="planner-equipment-weapon-col planner-equipment-weapon-col--right">
              <div class="planner-equipment-weapon-tabs" role="group" aria-label="Right weapon set">
                <button
                  type="button"
                  class="button is-small"
                  :class="{ 'is-active': weaponSet === 0 }"
                  @click="setWeaponSet(0)"
                >
                  I
                </button>
                <button
                  type="button"
                  class="button is-small"
                  :class="{ 'is-active': weaponSet === 1 }"
                  @click="setWeaponSet(1)"
                >
                  II
                </button>
              </div>
              <EquipmentSlot label="Off-hand" :slot-key="offhandSlot" />
            </div>

            <EquipmentSlot label="Gloves" slot-key="glov" class="planner-equipment-gloves" />
            <EquipmentSlot label="Boots" slot-key="feet" class="planner-equipment-boots" />
          </div>
        </section>

        <PlannerEnableList v-show="activeItemsTab === 'charms'" kind="charms" />
        <PlannerEnableList v-show="activeItemsTab === 'relics'" kind="relics" />
      </div>

      <div class="planner-items-side">
        <ItemInspectorPanel />
      </div>
    </div>

    <footer class="notification is-danger mt-3 mb-0 py-2 planner-items-footer">
      Work in progress. This page might not work properly and the data might be outdated. Items are NOT saved when exporting or saving a build.
    </footer>

    <ItemPickerModal />
    <ItemTooltipHost />
  </div>
</template>
