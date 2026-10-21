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
import ItemOilEditor from './ItemOilEditor.vue';
import ItemCorruptionsEditor from './ItemCorruptionsEditor.vue';
import ItemShrineEditor from './ItemShrineEditor.vue';
import ItemMechanicsEditor from './ItemMechanicsEditor.vue';
import CustomItemBuilder from './CustomItemBuilder.vue';
import RandomElementPicker from './RandomElementPicker.vue';
import { isCustomItemDef } from '@/items/custom-items.js';
import { defHasRandomElementChoice } from '@/items/random-element.js';
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
  /** @type {import('vue').PropType<'base'|'sockets'|'mysticOrbs'|'oils'|'corruptions'|'effigies'|'blessing'|'shrine'|'mechanics'>} */
  activeTab: { type: String, default: 'base' },
  canEdit: { type: Boolean, default: false },
  emptyText: { type: String, default: 'Select an item to view stats' },
  characterLevel: { type: Number, default: null },
  equipSlot: { type: String, default: '' },
  oil: { type: String, default: '' },
  corruptions: { type: Array, default: () => [] },
  blessing: { type: String, default: '' },
  shrine: { type: String, default: '' },
  mechanics: { type: Object, default: () => ({}) },
  custom: { type: Object, default: null },
  ethereal: { type: Boolean, default: false },
  etherealLocked: { type: Boolean, default: false },
  randomElement: { type: String, default: 'fire' },
});

const emit = defineEmits([
  'update:rolls',
  'set-roll',
  'update:socketables',
  'update:mystic-orbs',
  'update:oil',
  'update:corruptions',
  'update:blessing',
  'update:shrine',
  'update:mechanics',
  'update:custom',
  'update:ethereal',
  'update:random-element',
]);

const subtitle = computed(() => formatItemTooltipSubtitle(props.def));
const rarityNameClass = computed(() => itemRarityNameClass(props.def?.rarity));

const requirementsLine = computed(() =>
  formatItemRequirementsLine(
    resolveItemRequirements(props.def, {
      rolls: props.effectiveRolls,
      extras: props.extras,
      socketables: props.socketables,
      mysticOrbs: props.mysticOrbs,
      corruptions: props.corruptions,
    })
  )
);

const isCustom = computed(() => isCustomItemDef(props.def));
const showRandomElement = computed(() => defHasRandomElementChoice(props.def));

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
const isEffigiesTab = computed(() => props.activeTab === 'effigies');
const isOilsTab = computed(() => props.activeTab === 'oils');
const isCorruptionsTab = computed(() => props.activeTab === 'corruptions');
const isBlessingTab = computed(() => props.activeTab === 'blessing');
const isShrineTab = computed(() => props.activeTab === 'shrine');
const isMechanicsTab = computed(() => props.activeTab === 'mechanics');

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

        <RandomElementPicker
          v-if="showRandomElement"
          class="mt-2"
          :model-value="randomElement"
          :disabled="!canEdit"
          @update:model-value="emit('update:random-element', $event)"
        />
        <label v-if="canEdit" class="checkbox is-size-7 mt-2">
          <input
            type="checkbox"
            :checked="ethereal"
            :disabled="etherealLocked"
            @change="emit('update:ethereal', $event.target.checked)"
          />
          Ethereal
        </label>
        <CustomItemBuilder
          v-if="isCustom && custom"
          class="mt-3"
          :custom="custom"
          :editable="canEdit"
          @update:custom="emit('update:custom', $event)"
        />
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
        :kinds="['mo', 'umo', 'smo']"
        :shrine="shrine"
        :blessing="blessing"
        @update:mystic-orbs="emit('update:mystic-orbs', $event)"
      />

      <ItemMysticOrbsEditor
        v-else-if="isEffigiesTab"
        :def="def"
        :rolls="rolls"
        :extras="extras"
        :socketables="socketables"
        :mystic-orbs="mysticOrbs"
        :character-level="characterLevel"
        :editable="canEdit"
        :kinds="['effigy']"
        :shrine="shrine"
        :blessing="blessing"
        heading="Occult Effigies"
        empty-text="No effigies applied."
        add-label="Add occult effigy…"
        @update:mystic-orbs="emit('update:mystic-orbs', $event)"
      />

      <ItemOilEditor
        v-else-if="isOilsTab"
        :def="def"
        :equip-slot="equipSlot"
        :oil="oil"
        :editable="canEdit"
        @update:oil="emit('update:oil', $event)"
      />

      <ItemCorruptionsEditor
        v-else-if="isCorruptionsTab"
        :def="def"
        :equip-slot="equipSlot"
        :corruptions="corruptions"
        :editable="canEdit"
        @update:corruptions="emit('update:corruptions', $event)"
      />

      <ItemShrineEditor
        v-else-if="isBlessingTab"
        :def="def"
        :shrine="blessing"
        honorific
        :editable="canEdit"
        @update:shrine="emit('update:blessing', $event)"
      />

      <ItemShrineEditor
        v-else-if="isShrineTab"
        :def="def"
        :shrine="shrine"
        :editable="canEdit"
        @update:shrine="emit('update:shrine', $event)"
      />

      <ItemMechanicsEditor
        v-else-if="isMechanicsTab"
        :def="def"
        :mechanics="mechanics"
        :editable="canEdit"
        @update:mechanics="emit('update:mechanics', $event)"
      />
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
