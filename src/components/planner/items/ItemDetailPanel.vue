<script setup>
import ItemIcon from './ItemIcon.vue';
import CharmExtrasControls from './CharmExtrasControls.vue';
import OverlayExtrasControls from './OverlayExtrasControls.vue';
import ItemRollRow from './ItemRollRow.vue';
import { formatItemTooltipSubtitle } from '@/items/item-stats.js';
import { formatItemModifierLineHtml } from '@/items/item-granted-oskills.js';
import { modifierLineCssClass } from '@/items/item-modifier-line.js';
import {
  formatItemRequirementsLine,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import { itemRarityNameClass } from '@/items/item-tooltip.js';
import { formatMysticOrbLine, normalizeMysticOrbs } from '@/items/mystic-orbs.js';
import { formatRunewordBadge, isRunewordItem } from '@/items/runeword-items.js';
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
  extras: { type: /** @type {import('vue').PropType<string[]>} */ (Array), default: () => [] },
  mysticOrbs: {
    type: /** @type {import('vue').PropType<Array<[number, string]>>} */ (Array),
    default: () => [],
  },
  socketables: {
    type: /** @type {import('vue').PropType<Array<object>>} */ (Array),
    default: () => [],
  },
  emptyText: { type: String, default: 'Select an item to view stats' },
});

const emit = defineEmits(['update:rolls', 'set-roll']);

const subtitle = computed(() => formatItemTooltipSubtitle(props.def));
const rarityNameClass = computed(() => itemRarityNameClass(props.def?.rarity));
const mysticOrbLines = computed(() =>
  normalizeMysticOrbs(props.mysticOrbs).map(([count, name]) => formatMysticOrbLine(count, name))
);

const requirementsLine = computed(() =>
  formatItemRequirementsLine(
    resolveItemRequirements(props.def, {
      rolls: props.effectiveRolls,
      extras: props.extras,
      socketables: props.socketables,
    })
  )
);

const runewordBadge = computed(() =>
  isRunewordItem(props.def) ? formatRunewordBadge(props.def) : ''
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
 * @param {{ text?: string, color?: string, stat?: { color?: string, raw?: string, text?: string } }} row
 * @returns {string}
 */
function modLineClass(row) {
  const line =
    row?.text != null
      ? row.text
      : row?.stat?.raw != null
        ? row.stat.raw
        : row?.stat?.text != null
          ? row.stat.text
          : '';
  if (line) return modifierLineCssClass(line);
  return '';
}
</script>

<template>
  <div v-if="!def" class="item-picker-modal__detail-empty">
    {{ emptyText }}
  </div>
  <div v-else class="item-detail-panel">
    <div class="item-detail-panel__body">
      <div class="item-tooltip-header">
        <div class="item-tooltip-header-text">
          <div class="item-tooltip-name" :class="rarityNameClass">{{ def.name }}</div>
          <div v-if="subtitle" class="item-tooltip-subtitle">{{ subtitle }}</div>
          <div
            v-if="def.baseName || runewordBadge || def.setName || def.classRestriction"
            class="item-tooltip-tags"
          >
            <div v-if="def.baseName" class="item-tooltip-tag">{{ def.baseName }}</div>
            <div v-if="runewordBadge" class="item-tooltip-tag item-tooltip-tag--runeword">
              {{ runewordBadge }}
            </div>
            <div v-if="def.setName" class="item-tooltip-tag item-tooltip-tag--set">
              {{ def.setName }}
            </div>
            <div v-if="def.classRestriction" class="item-tooltip-tag">
              {{ def.classRestriction }}
            </div>
          </div>
        </div>
        <div class="item-tooltip-art item-detail-panel__art">
          <ItemIcon :def="def" :icon="icon || undefined" fill />
        </div>
      </div>

      <div
        v-if="baseRows.length"
        class="item-tooltip-section item-tooltip-section--base item-detail-panel__section"
        aria-label="Base properties"
      >
        <template v-for="(row, idx) in baseRows" :key="'base-' + idx">
          <p
            v-if="row.kind === 'text'"
            class="item-tooltip-line item-picker-modal__stat-line"
            :class="modLineClass(row)"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- escaped skill-name markup -->
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

      <div
        v-if="modRows.length"
        class="item-tooltip-section item-tooltip-section--mods item-detail-panel__section"
        aria-label="Item modifiers"
      >
        <template v-for="(row, idx) in modRows" :key="'mod-' + idx">
          <p
            v-if="row.kind === 'text'"
            class="item-tooltip-line item-picker-modal__stat-line"
            :class="modLineClass(row)"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- escaped skill-name markup -->
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

      <div v-if="requirementsLine" class="item-tooltip-reqs">{{ requirementsLine }}</div>
    </div>

    <div
      v-if="mysticOrbLines.length"
      class="item-mystic-orbs"
      aria-label="Mystic Orbs"
    >
      <p class="item-mystic-orbs__heading is-size-7 has-text-grey mb-2">Mystic Orbs</p>
      <ul class="item-mystic-orbs__list">
        <li v-for="(line, idx) in mysticOrbLines" :key="'mo-' + idx" class="item-mystic-orbs__line">
          {{ line }}
        </li>
      </ul>
    </div>

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

<style scoped>
.item-mystic-orbs {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.item-mystic-orbs__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.item-mystic-orbs__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-mystic-orbs__line {
  font-size: 0.9rem;
  line-height: 1.35;
  color: #e8e8e8;
}

.item-mystic-orbs__line + .item-mystic-orbs__line {
  margin-top: 0.2rem;
}
</style>
