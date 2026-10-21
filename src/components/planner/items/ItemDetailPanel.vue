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
import { formatRunewordBadge, isRunewordItem } from '@/items/runeword-items.js';
import ItemSocketsEditor from './ItemSocketsEditor.vue';
import ItemMysticOrbsEditor from './ItemMysticOrbsEditor.vue';
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
  /** @type {import('vue').PropType<'base'|'sockets'|'mysticOrbs'|'oils'|'corruptions'|'effigies'>} */
  activeTab: { type: String, default: 'base' },
  canEdit: { type: Boolean, default: false },
  emptyText: { type: String, default: 'Select an item to view stats' },
  characterLevel: { type: Number, default: null },
});

const emit = defineEmits(['update:rolls', 'set-roll', 'update:socketables', 'update:mystic-orbs']);

const subtitle = computed(() => formatItemTooltipSubtitle(props.def));
const rarityNameClass = computed(() => itemRarityNameClass(props.def?.rarity));

const requirementsLine = computed(() =>
  formatItemRequirementsLine(
    resolveItemRequirements(props.def, {
      rolls: props.effectiveRolls,
      extras: props.extras,
      socketables: props.socketables,
      mysticOrbs: props.mysticOrbs,
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

const isBaseTab = computed(() => props.activeTab === 'base');
const isSocketsTab = computed(() => props.activeTab === 'sockets');
const isMysticOrbsTab = computed(() => props.activeTab === 'mysticOrbs');
const isPlaceholderTab = computed(() =>
  props.activeTab === 'oils' ||
  props.activeTab === 'corruptions' ||
  props.activeTab === 'effigies'
);

const placeholderCopy = computed(() => {
  if (props.activeTab === 'oils') return 'No oils applied.';
  if (props.activeTab === 'corruptions') return 'No corruptions applied.';
  if (props.activeTab === 'effigies') return 'No effigies applied.';
  return '';
});

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

      <template v-if="isBaseTab">
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
      </template>

      <ItemSocketsEditor
        v-else-if="isSocketsTab"
        :def="def"
        :rolls="rolls"
        :socketables="socketables"
        :editable="canEdit"
        @update:socketables="emit('update:socketables', $event)"
        @set-roll="(key, min, max, raw) => emit('set-roll', key, min, max, raw)"
      />

      <ItemMysticOrbsEditor
        v-else-if="isMysticOrbsTab"
        :def="def"
        :rolls="rolls"
        :extras="extras"
        :socketables="socketables"
        :mystic-orbs="mysticOrbs"
        :character-level="characterLevel"
        :editable="canEdit"
        @update:mystic-orbs="emit('update:mystic-orbs', $event)"
      />

      <div
        v-else-if="isPlaceholderTab"
        class="item-upgrade-section"
        :aria-label="activeTab"
      >
        <p class="item-upgrade-section__empty is-size-7 has-text-grey">
          {{ placeholderCopy }}
        </p>
      </div>
    </div>

    <CharmExtrasControls
      v-if="def && isBaseTab"
      :def="def"
      :rolls="rolls"
      @update:rolls="emit('update:rolls', $event)"
    />
    <OverlayExtrasControls
      v-if="def && isBaseTab"
      :def="def"
      :rolls="rolls"
      @update:rolls="emit('update:rolls', $event)"
    />
  </div>
</template>
