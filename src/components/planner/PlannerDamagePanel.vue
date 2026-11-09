<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { usePlannerRevisionRefresh } from '@/composables/usePlannerRevisionRefresh.js';
import { getCharacterInstance, getEffectivePlannerLevel } from '@/character/planner-core.js';
import { collectPlannerDamageSkills } from '@/character/planner-damage.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { useItemsStore } from '@/stores/items.js';
import { refreshPinnedHosts } from '@/shared/tooltip-pinning.js';
import {
  destroyDamageTooltip,
  hideDamageTooltip,
  initDamageTooltip,
  moveDamageTooltip,
  setDamageTooltipProvider,
  showDamageTooltip,
} from '@/planner/damage-tooltip.js';

const itemsStore = useItemsStore();

/** Damage skills of the current build (base values; no monster resists/pierce). */
const rows = ref([]);

/** @param {string} id */
function readBonusInput(id) {
  if (typeof document === 'undefined') return 0;
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) return 0;
  return Math.max(0, Math.floor(parseInt(el.value, 10) || 0));
}

/** Rebuild the damage list from the live character. */
function rebuild() {
  const character = getCharacterInstance();
  const store = getFileSkillStore();
  if (!character || !store) {
    rows.value = [];
    return;
  }
  rows.value = collectPlannerDamageSkills({
    character,
    store,
    itemsStore,
    effectiveLevel: getEffectivePlannerLevel(),
    allSkillsBonus: readBonusInput('allSkillsBonus'),
    classSkillsBonus: readBonusInput('classSkillsBonus'),
  });
  // Keep pinned damage tooltips in sync with the new numbers.
  void refreshPinnedHosts((host) => host.kind === 'damage');
}

const skills = computed(() => rows.value);

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeTooltip(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
function formatRange(min, max) {
  const low = Math.round(Number(min) || 0);
  const high = Math.round(Number(max) || 0);
  return low === high ? formatAmount(low) : `${formatAmount(low)}–${formatAmount(high)}`;
}

/**
 * Group thousands with a space so 1 000–9 999 reads like 10 531.
 * @param {number} value
 * @returns {string}
 */
function formatAmount(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * D2 runs at 25 frames per second; poison lengths are stored in frames.
 * @param {number|null} frames
 * @returns {string}
 */
function formatDuration(frames) {
  const count = Number(frames) || 0;
  return count > 0 ? `${(count / 25).toFixed(1)}s` : 'DoT';
}

/**
 * Base per-hit total (DoT components excluded, no resists/pierce).
 * @param {object} skill
 * @returns {{ min: number, max: number }|null}
 */
function perHitTotal(skill) {
  const perHit = (skill.components || []).filter((component) => !component.dot);
  if (perHit.length === 0) return null;
  return {
    min: perHit.reduce((sum, component) => sum + component.min, 0),
    max: perHit.reduce((sum, component) => sum + component.max, 0),
  };
}

/**
 * @param {object} skill
 * @returns {string}
 */
function totalLabel(skill) {
  const total = perHitTotal(skill);
  return total ? formatRange(total.min, total.max) : '—';
}

/**
 * Detailed breakdown shown on hover: base damage per type plus the per-hit total.
 * Monster resists and pierce are ignored (both treated as 0).
 * @param {object} skill
 * @returns {string}
 */
function buildDamageTooltipHtml(skill) {
  const components = skill.components || [];
  const entries = components.map((component) => {
    const suffix = component.dot ? ` (${formatDuration(component.durationFrames)})` : '';
    return `<div class="damage-tooltip-entry"><div class="damage-tooltip-row">
        <span class="tooltip-damage-type is-${escapeTooltip(component.type)}">${escapeTooltip(
      component.label
    )}${suffix}</span>
        <span class="damage-tooltip-value">${formatRange(component.min, component.max)}</span>
      </div></div>`;
  });

  const total = perHitTotal(skill);
  const totalRow = total
    ? `<div class="damage-tooltip-row is-total">
        <span class="damage-tooltip-type">Total / hit</span>
        <span class="damage-tooltip-value">${formatRange(total.min, total.max)}</span>
      </div>`
    : '';

  const hasWeaponHit = components.some((component) => component.key === 'weapon_damage');
  const weaponRow =
    skill.weaponDamagePercent > 0 && !hasWeaponHit
      ? `<div class="damage-tooltip-row">
          <span class="damage-tooltip-type">Weapon</span>
          <span class="damage-tooltip-value damage-tooltip-muted">${Math.round(
            skill.weaponDamagePercent
          )}% of weapon damage</span>
        </div>`
      : '';

  const level = skill.innate ? 'innate' : `level ${skill.level}`;
  return `<div class="damage-tooltip-head">
      <span class="damage-tooltip-name">${escapeTooltip(skill.name)}</span>
      <span class="damage-tooltip-level">${level}</span>
    </div>
    <div class="damage-tooltip-columns"><span></span><span>base</span></div>
    ${entries.join('')}${weaponRow}${totalRow}`;
}

/**
 * @param {string} id
 * @returns {string}
 */
function damageTooltipHtml(id) {
  const skill = skills.value.find((entry) => entry.id === id);
  return skill ? buildDamageTooltipHtml(skill) : '';
}

/**
 * @param {MouseEvent} event
 * @param {object} skill
 */
function onEnter(event, skill) {
  showDamageTooltip(skill.id, event.clientX, event.clientY);
}

/** @param {MouseEvent} event */
function onMove(event) {
  moveDamageTooltip(event.clientX, event.clientY);
}

function onLeave() {
  hideDamageTooltip();
}

/**
 * @param {FocusEvent} event
 * @param {object} skill
 */
function onFocus(event, skill) {
  const el = /** @type {HTMLElement|null} */ (event.currentTarget);
  const rect = el ? el.getBoundingClientRect() : null;
  showDamageTooltip(skill.id, rect ? rect.right : 0, rect ? rect.top : 0);
}

usePlannerRevisionRefresh(rebuild);
onMounted(() => {
  initDamageTooltip();
  setDamageTooltipProvider(damageTooltipHtml);
  rebuild();
});
onBeforeUnmount(() => {
  destroyDamageTooltip();
});
</script>

<template>
  <section class="planner-card planner-damage-card">
    <div class="planner-damage-head">
      <span class="planner-card__eyebrow">Damage</span>
      <span class="planner-damage-hint">hover for details</span>
    </div>

    <div class="planner-damage-list">
      <button
        v-for="skill in skills"
        :key="skill.id"
        type="button"
        class="planner-damage-list-item"
        @mouseenter="onEnter($event, skill)"
        @mousemove="onMove"
        @mouseleave="onLeave"
        @focus="onFocus($event, skill)"
        @blur="onLeave"
      >
        <span class="planner-damage-list-name">{{ skill.name }}</span>
        <span class="planner-damage-list-total">{{ totalLabel(skill) }}</span>
      </button>
    </div>

    <p v-if="skills.length === 0" class="has-text-grey is-size-7 mb-0">
      No damaging skills.
    </p>
  </section>
</template>

<style scoped>
.planner-damage-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.planner-damage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.planner-damage-hint {
  font-size: 0.68rem;
  color: #7f7f8c;
}

.planner-damage-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.planner-damage-list-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.2rem 0.2rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}

.planner-damage-list-item:hover,
.planner-damage-list-item:focus-visible {
  background: rgba(255, 255, 255, 0.06);
}

.planner-damage-list-name {
  font-size: 0.78rem;
}

.planner-damage-list-total {
  font-size: 0.72rem;
  color: #b8b8c4;
  font-variant-numeric: tabular-nums;
}
</style>
