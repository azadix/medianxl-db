<script setup>
import { computed, ref, watch } from 'vue';
import { getItemIconUrl } from '@/shared/utils.js';

const props = defineProps({
  /** Catalog item definition. */
  def: { type: Object, default: null },
  /** Optional icon stem override (e.g. random jewelry variant on an instance). */
  icon: { type: String, default: '' },
  /** Optional short label override. */
  label: { type: String, default: '' },
  /** Fill parent slot instead of inventory cell sizing. */
  fill: { type: Boolean, default: false },
});

const imageFailed = ref(false);

const iconKey = computed(() => (props.icon || props.def?.icon || '').trim());

watch(iconKey, () => {
  imageFailed.value = false;
});

const displayName = computed(() => props.label || props.def?.name || '');

const rarityClass = computed(() => {
  const r = props.def?.rarity || 'normal';
  return `item-icon--rarity-${r}`;
});

const initials = computed(() => {
  const n = displayName.value;
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
});

const iconUrl = computed(() => {
  if (!iconKey.value) return '';
  return getItemIconUrl(iconKey.value);
});

const showImage = computed(() => Boolean(iconUrl.value) && !imageFailed.value);

function onImgError() {
  imageFailed.value = true;
}
</script>

<template>
  <div
    class="item-icon"
    :class="[rarityClass, { 'item-icon--fill': fill, 'item-icon--has-img': showImage }]"
  >
    <img
      v-if="showImage"
      class="item-icon__img"
      :src="iconUrl"
      :alt="displayName"
      draggable="false"
      @error="onImgError"
    />
    <template v-else>
      <span class="item-icon__glyph">{{ initials }}</span>
      <span v-if="!fill" class="item-icon__name">{{ displayName }}</span>
    </template>
  </div>
</template>
