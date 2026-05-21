<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import {
  getSkillVariantKey,
  setSkillVariantKey,
  variantBracketSuffixFromList,
} from '../../../tree/skill-variants.js';
import { runPlannerSkillStatRecompute } from '@/character/character-state.js';

const props = defineProps({
  variantMapKey: { type: String, required: true },
  variants: { type: Array, default: () => [] },
});

const emit = defineEmits(['label-change', 'refresh-tooltip']);

const panelOpen = ref(false);
const panelEl = ref(null);

function syncLabel() {
  let stored = getSkillVariantKey(props.variantMapKey);
  if (stored && !props.variants.some((x) => x.variant_key === stored)) {
    setSkillVariantKey(props.variantMapKey, null);
    stored = null;
  }
  emit('label-change', variantBracketSuffixFromList(stored, props.variants));
}

watch(
  () => [props.variantMapKey, props.variants],
  () => syncLabel(),
  { immediate: true, deep: true }
);

function onDocClick(e) {
  const t = e.target;
  if (t.closest && (t.closest('.skill-variant-trigger') || t.closest('.skill-variant-panel'))) {
    return;
  }
  panelOpen.value = false;
  if (panelEl.value) panelEl.value.style.display = 'none';
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true);
});

function togglePanel(e) {
  e.stopPropagation();
  if (!panelOpen.value) {
    document.querySelectorAll('.skill-variant-panel').forEach((p) => {
      if (panelEl.value && p !== panelEl.value) {
        p.style.display = 'none';
      }
    });
  }
  panelOpen.value = !panelOpen.value;
  if (panelEl.value) {
    panelEl.value.style.display = panelOpen.value ? 'block' : 'none';
  }
}

function chooseDefault(e) {
  e.stopPropagation();
  setSkillVariantKey(props.variantMapKey, null);
  syncLabel();
  runPlannerSkillStatRecompute({ immediate: true });
  emit('refresh-tooltip');
  panelOpen.value = false;
  if (panelEl.value) panelEl.value.style.display = 'none';
}

function chooseVariant(key, e) {
  e.stopPropagation();
  setSkillVariantKey(props.variantMapKey, key);
  syncLabel();
  runPlannerSkillStatRecompute({ immediate: true });
  emit('refresh-tooltip');
  panelOpen.value = false;
  if (panelEl.value) panelEl.value.style.display = 'none';
}
</script>

<template>
  <button
    type="button"
    class="skill-variant-trigger"
    title="Skill variant (tooltip preview)"
    aria-label="Choose skill variant"
    aria-haspopup="true"
    @click="togglePanel"
  >
    &#x22EE;
  </button>
  <div
    ref="panelEl"
    class="skill-variant-panel"
    style="display: none"
    role="menu"
  >
    <button
      type="button"
      class="skill-variant-option skill-variant-option--default"
      role="menuitem"
      @click="chooseDefault"
    >
      Default
    </button>
    <button
      v-for="v in variants"
      :key="v.variant_key"
      type="button"
      class="skill-variant-option"
      :data-variant-key="v.variant_key"
      role="menuitem"
      @click="chooseVariant(v.variant_key, $event)"
    >
      {{ v.label }}
    </button>
  </div>
</template>
