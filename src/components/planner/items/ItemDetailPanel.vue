<script setup>
import ItemIcon from './ItemIcon.vue';
import CharmExtrasControls from './CharmExtrasControls.vue';
import OverlayExtrasControls from './OverlayExtrasControls.vue';
import ItemRollRow from './ItemRollRow.vue';
import { formatItemOverlayMeta, formatItemRarityBadge } from '@/items/item-stats.js';
import { formatItemModifierLineHtml } from '@/items/item-granted-oskills.js';
import { decodeModifierLine, modifierColorCssClass } from '@/items/item-modifier-line.js';
import {
  formatItemRequirementsLine,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import { computed } from 'vue';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  icon: { type: String, default: '' },
  /** @type {import('vue').PropType<Array<{ kind: string, text?: string, stat?: object, section?: string }>>} */
  detailStatRows: { type: Array, default: () => [] },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), required: true },
  effectiveRolls: {
    type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object),
    required: true,
  },
  emptyText: { type: String, default: 'Select an item to view stats' },
});

const emit = defineEmits(['update:rolls', 'set-roll']);

const previewMeta = computed(() => formatItemOverlayMeta(props.def));
const rarityBadge = computed(() => formatItemRarityBadge(props.def));

const requirementsLine = computed(() =>
  formatItemRequirementsLine(
    resolveItemRequirements(props.def, { rolls: props.effectiveRolls })
  )
);

const REQ_LINE_RE = /^(Required (Level|Strength|Dexterity):|Requires:)/i;

const baseRows = computed(() =>
  props.detailStatRows.filter((row) => {
    if (row.section !== 'base') return false;
    if (row.kind === 'text') {
      const text = String(row.text || '').trim();
      if (!text || REQ_LINE_RE.test(text)) return false;
    }
    return true;
  })
);
const modRows = computed(() => props.detailStatRows.filter((row) => row.section !== 'base'));

/**
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {string|number} raw
 */
function onRollUpdate(key, min, max, raw) {
  emit('set-roll', key, min, max, raw);
}

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
function modLineHtml(text) {
  return formatItemModifierLineHtml(text);
}

/**
 * @param {{ text?: string, color?: string, stat?: { color?: string } }} row
 * @returns {string}
 */
function modLineClass(row) {
  const color = row?.color || row?.stat?.color || decodeModifierLine(row?.text).color;
  return modifierColorCssClass(color);
}
</script>

<template>
  <div v-if="!def" class="item-picker-modal__detail-empty">
    {{ emptyText }}
  </div>
  <div v-else class="item-picker-modal__detail-preview">
    <div class="item-picker-modal__detail-head">
      <div class="item-picker-modal__detail-head-main">
        <div class="item-picker-modal__detail-icon">
          <ItemIcon :def="def" :icon="icon || undefined" fill />
        </div>
        <div class="item-picker-modal__detail-titles">
          <p
            class="item-picker-modal__detail-name mb-1"
            :class="'item-picker-modal__row--' + (def.rarity || 'normal')"
          >
            <span class="item-picker-modal__row-name">{{ def.name }}</span>
            <span v-if="rarityBadge" class="item-detail__badge">{{ rarityBadge }}</span>
          </p>
          <p class="is-size-7 has-text-grey mb-0">{{ previewMeta }}</p>
          <p v-if="requirementsLine" class="is-size-7 has-text-grey mb-0">
            {{ requirementsLine }}
          </p>
          <p v-if="def.baseName" class="is-size-7 has-text-grey-light mb-0">
            Base: {{ def.baseName }}
          </p>
          <p v-if="def.classRestriction" class="is-size-7 has-text-grey-light mb-0">
            {{ def.classRestriction }}
          </p>
        </div>
      </div>
    </div>

    <section v-if="baseRows.length" class="item-detail__section" aria-label="Base properties">
      <h4 class="item-detail__section-title">Base properties</h4>
      <div class="item-picker-modal__detail-stats">
        <p v-for="(row, idx) in baseRows" :key="'base-' + idx" class="item-picker-modal__stat-line">
          {{ row.text }}
        </p>
      </div>
    </section>

    <section
      v-if="modRows.length"
      class="item-detail__section"
      :class="{ 'item-detail__section--after-base': baseRows.length > 0 }"
      aria-label="Item modifiers"
    >
      <h4 class="item-detail__section-title">Item modifiers</h4>
      <div class="item-picker-modal__detail-stats">
        <template v-for="(row, idx) in modRows" :key="'mod-' + idx">
          <p
            v-if="row.kind === 'text'"
            class="item-picker-modal__stat-line"
            :class="modLineClass(row)"
          >
            <span class="item-picker-modal__stat-line-text" v-html="modLineHtml(row.text)"></span>
          </p>
          <ItemRollRow
            v-else
            :stat="row.stat"
            :value="effectiveRolls[row.stat.key] ?? row.stat.min"
            @update="onRollUpdate(row.stat.key, row.stat.min, row.stat.max, $event)"
          />
        </template>
      </div>
    </section>

    <CharmExtrasControls
      v-if="def"
      :def="def"
      :rolls="rolls"
      @update:rolls="emit('update:rolls', $event)"
    />
    <OverlayExtrasControls
      v-if="def"
      :def="def"
      :rolls="rolls"
      @update:rolls="emit('update:rolls', $event)"
    />
  </div>
</template>
