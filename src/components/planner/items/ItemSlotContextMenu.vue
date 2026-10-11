<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  /** @type {{ x: number, y: number }|null} */
  menu: { type: Object, default: null },
});

defineEmits(['change', 'remove']);

const rootRef = ref(/** @type {HTMLElement|null} */ (null));
const pos = ref({ left: 0, top: 0 });

watch(
  () => props.menu,
  async (next) => {
    if (!next) return;
    pos.value = { left: next.x, top: next.y };
    await nextTick();
    const el = rootRef.value;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = next.x;
    let top = next.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    pos.value = { left, top };
  }
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu"
      ref="rootRef"
      class="item-slot-context-menu"
      role="menu"
      :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
      @contextmenu.prevent
    >
      <button
        type="button"
        class="item-slot-context-menu__item"
        role="menuitem"
        @click="$emit('change')"
      >
        Change item
      </button>
      <button
        type="button"
        class="item-slot-context-menu__item item-slot-context-menu__item--danger"
        role="menuitem"
        @click="$emit('remove')"
      >
        Remove item
      </button>
    </div>
  </Teleport>
</template>
