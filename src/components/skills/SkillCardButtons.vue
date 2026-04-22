<script setup>
defineProps({
  skillId: { type: [String, Number], required: true },
  plusDisabled: { type: Boolean, default: false },
  minusDisabled: { type: Boolean, default: false },
  plusTitle: { type: String, default: '' },
  plusClass: { type: String, default: '' },
  minusClass: { type: String, default: '' },
});

const emit = defineEmits(['plus', 'minus']);

function onPlus(e) {
  const d = e.shiftKey ? 25 : 1;
  emit('plus', d);
}

function onMinus(e) {
  const d = e.shiftKey ? -25 : -1;
  emit('minus', d);
}
</script>

<template>
  <div class="skill-buttons-container">
    <div class="skill-buttons">
      <button
        type="button"
        class="button is-outlined is-small skill-plus-btn"
        :class="plusClass"
        :disabled="plusDisabled"
        :data-skill="String(skillId)"
        :data-warning-message="plusTitle"
        :title="plusTitle"
        @click.prevent="onPlus"
      >
        +
      </button>
      <button
        type="button"
        class="button is-outlined is-small skill-minus-btn"
        :class="minusClass"
        :disabled="minusDisabled"
        :data-skill="String(skillId)"
        @click.prevent="onMinus"
      >
        −
      </button>
    </div>
  </div>
</template>
