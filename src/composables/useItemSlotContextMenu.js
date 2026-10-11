import { onBeforeUnmount, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items.js';
import { hideItemTooltip } from '@/items/item-tooltip-runtime.js';
import {
  syncItemGrantedOSkills,
  runPlannerSkillStatRecompute,
} from '@/character/planner-core.js';
import { refreshCurrentTooltip } from '@/tree/tree-tooltip.js';

function afterItemSkillSourcesChanged() {
  syncItemGrantedOSkills();
  refreshCurrentTooltip();
  runPlannerSkillStatRecompute();
}

/**
 * Right-click menu for equipped / inventory items (Change / Remove).
 */
export function useItemSlotContextMenu() {
  const itemsStore = useItemsStore();
  /** @type {import('vue').Ref<{ x: number, y: number }|null>} */
  const menu = ref(null);

  function closeMenu() {
    menu.value = null;
  }

  /**
   * @param {MouseEvent} e
   * @param {{ location: string, slot: string|number }} slotRef
   */
  function openMenu(e, slotRef) {
    e.preventDefault();
    e.stopPropagation();
    hideItemTooltip();
    itemsStore.selectSlot(slotRef);
    menu.value = { x: e.clientX, y: e.clientY };
  }

  function onChangeItem() {
    closeMenu();
    itemsStore.openPicker();
  }

  function onRemoveItem() {
    const slot = itemsStore.selectedSlot;
    closeMenu();
    if (!slot) return;
    itemsStore.removeItem(slot);
    itemsStore.clearSelection();
    afterItemSkillSourcesChanged();
  }

  function onWindowPointerDown(e) {
    const target = /** @type {Node|null} */ (e.target);
    if (target?.closest?.('.item-slot-context-menu')) return;
    closeMenu();
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape') closeMenu();
  }

  function onWindowBlur() {
    closeMenu();
  }

  watch(menu, (next, _prev, onCleanup) => {
    if (!next) return;
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('keydown', onWindowKeydown);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    onCleanup(() => {
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('keydown', onWindowKeydown);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    });
  });

  onBeforeUnmount(closeMenu);

  return {
    menu,
    openMenu,
    closeMenu,
    onChangeItem,
    onRemoveItem,
  };
}
