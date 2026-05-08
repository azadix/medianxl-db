<script setup>
import { computed, ref, watch } from 'vue';
import { getSkillVariantKey } from '../../../tree/skill-variants.js';
import {
  getLevelColorClass,
  canAddPoints,
  getRestrictionMessage,
} from '../../../tree/tree-render.js';
import { setSkillDisabled, setOSkillSlotDisabled } from '../../../character/character-state.js';
import SkillVariantMenu from './SkillVariantMenu.vue';
import SkillCardImage from './SkillCardImage.vue';
import SkillCardButtons from './SkillCardButtons.vue';

const props = defineProps({
  cardData: { type: Object, required: true },
  plannerRevision: { type: Number, default: 0 },
});

const emit = defineEmits(['plus', 'minus']);

function onToggleDisabled() {
  const slotId = props.cardData.oskillSlotId;
  if (slotId) {
    setOSkillSlotDisabled(slotId, !props.cardData.isDisabled);
  } else {
    setSkillDisabled(props.cardData.skillId, !props.cardData.isDisabled);
  }
}

const variantLabel = ref('');
const variantEpoch = ref(0);

const variantMapKey = computed(() => String(props.cardData.variantStateKey ?? props.cardData.skillId));
const variants = computed(() => props.cardData.variants || []);

function onVariantLabel(s) {
  variantLabel.value = s;
}

function onVariantRefresh() {
  variantEpoch.value++;
  window.dispatchEvent(new CustomEvent('tooltipRefresh', { detail: { skillCard: null } }));
}

const skillVariantAttr = computed(() => {
  props.plannerRevision;
  variantEpoch.value;
  if (!variants.value.length) return {};
  const vk = getSkillVariantKey(variantMapKey.value);
  if (vk != null && String(vk).trim() !== '') {
    return { 'data-skill-variant': String(vk).trim() };
  }
  return {};
});

const plusDisabled = computed(
  () =>
    !canAddPoints(
      props.cardData.canAllocate,
      props.cardData.currentPoints || 0,
      props.cardData.maxPoints || 0
    )
);
const minusDisabled = computed(() => (props.cardData.currentPoints || 0) === 0);

const plusClass = computed(() => (plusDisabled.value ? 'is-ghost' : 'is-success'));
const minusClass = computed(() => (minusDisabled.value ? 'is-ghost' : 'is-danger'));

const levelColorClass = computed(() =>
  getLevelColorClass(props.cardData.currentPoints || 0, props.cardData.maxPoints || 0)
);

const nameBaseClass = computed(() => {
  const cd = props.cardData;
  return cd.isDisabled ? 'has-text-danger' : '';
});

const showDisableToggle = computed(() => {
  const cd = props.cardData;
  if (cd.isInnate) return false;
  if (cd.isPassive === true) return false;
  if (cd.isUpgrade === true) return false;
  if (String(cd.tabName || '').trim().toLowerCase() === 'mastery') return false;
  if (Math.floor(Number(cd.currentPoints) || 0) <= 0) return false;
  if (cd.tabName === 'oSkill' && !cd.oskillSlotId) return false;
  // show for regular non-passives and oSkills (which also carry isPassive/isUpgrade via tree-render)
  return true;
});
const disableButtonTitle = computed(() =>
  props.cardData.isDisabled ? 'Enable skill bonuses' : 'Disable skill bonuses'
);

const plusTitle = computed(() => getRestrictionMessage(props.cardData.restrictions) || '');

watch(
  () => props.cardData,
  () => variantEpoch.value++,
  { deep: true }
);
</script>

<template>
  <div
    class="skill-card"
    :class="{ 'skill-card--variants': variants.length > 0 }"
    :data-skill-id="String(cardData.skillId)"
    :data-skill-numeric-id="cardData.numericId != null ? String(cardData.numericId) : undefined"
    :data-class-id="cardData.classId != null ? String(cardData.classId) : undefined"
    :data-oskill-slot-id="cardData.oskillSlotId != null ? String(cardData.oskillSlotId) : undefined"
    v-bind="skillVariantAttr"
  >
    <div class="skill-card-header">
      <div
        class="skill-card-spacer"
        :class="{ 'skill-card-variant-wrap': variants.length > 0 }"
      >
        <SkillVariantMenu
          v-if="variants.length"
          :variant-map-key="variantMapKey"
          :variants="variants"
          @label-change="onVariantLabel"
          @refresh-tooltip="onVariantRefresh"
        />
      </div>
      <SkillCardImage :icon-markup="cardData.iconHTML" />
      <SkillCardButtons
        v-if="!cardData.isInnate"
        :skill-id="cardData.skillId"
        :plus-disabled="plusDisabled"
        :minus-disabled="minusDisabled"
        :plus-title="plusTitle"
        :plus-class="plusClass"
        :minus-class="minusClass"
        @plus="emit('plus', $event)"
        @minus="emit('minus', $event)"
      />
    </div>
    <button
      v-if="showDisableToggle"
      type="button"
      class="button is-outlined is-small skill-disable-toggle"
      :class="cardData.isDisabled ? 'is-danger' : 'is-success'"
      :title="disableButtonTitle"
      :aria-label="disableButtonTitle"
      @click.prevent="onToggleDisabled"
    >
      <span class="icon is-small"><i class="fa-solid fa-power-off"></i></span>
    </button>
    <div class="skill-card-name">
      <span class="skill-card-name-base" :class="nameBaseClass">{{ cardData.displayName }}</span>
      <span
        v-if="cardData.parentSkillId"
        class="tag is-info is-light is-rounded is-size-7 ml-1"
        :title="`Subskill of ${cardData.parentDisplayName || cardData.parentSkillId}`"
      >
        Subskill
      </span>
      <span class="skill-card-name-variant has-text-grey is-size-7">{{ variantLabel }}</span>
    </div>
    <div class="skill-card-level">
      <div :class="[levelColorClass, 'is-size-6']">
        {{ cardData.currentPoints || 0 }} / {{ cardData.maxPoints || 0 }}
      </div>
    </div>
  </div>
</template>
