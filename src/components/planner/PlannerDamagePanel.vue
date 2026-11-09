<script setup>
import { computed, onMounted, ref } from 'vue';
import { usePlannerRevisionRefresh } from '@/composables/usePlannerRevisionRefresh.js';
import { getCharacterInstance, getEffectivePlannerLevel } from '@/character/planner-core.js';
import { collectPlannerDamageSkills } from '@/character/planner-damage.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { applyDamageMitigation } from '@/skills/domain/skill-damage.js';

/** Damage skills of the current build, with the stats snapshot used for mitigation. */
const rows = ref([]);
const enemyResist = ref(50);
const usePierce = ref(true);

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
    effectiveLevel: getEffectivePlannerLevel(),
    allSkillsBonus: readBonusInput('allSkillsBonus'),
    classSkillsBonus: readBonusInput('classSkillsBonus'),
  });
}

const skills = computed(() =>
  rows.value.map((row) => ({
    ...row,
    mitigated: applyDamageMitigation(row.components, {
      stats: row.stats,
      baseEnemyResistPct: enemyResist.value,
      useCharacterPierce: usePierce.value,
    }),
  }))
);

/**
 * @param {number} min
 * @param {number} max
 */
function formatRange(min, max) {
  const low = Math.round(Number(min) || 0);
  const high = Math.round(Number(max) || 0);
  return low === high ? low.toLocaleString() : `${low.toLocaleString()}–${high.toLocaleString()}`;
}

/**
 * D2 runs at 25 frames per second; poison lengths are stored in frames.
 * @param {number|null} frames
 */
function formatDuration(frames) {
  const count = Number(frames) || 0;
  return count > 0 ? `${(count / 25).toFixed(1)}s` : 'DoT';
}

usePlannerRevisionRefresh(rebuild);
onMounted(rebuild);
</script>

<template>
  <section class="planner-card planner-damage-card">
    <div class="planner-damage-head">
      <span class="planner-card__eyebrow">Damage</span>
      <select v-model.number="enemyResist" class="input is-small planner-damage-resist" aria-label="Enemy resistance">
        <option :value="0">0% resist</option>
        <option :value="33">33% resist</option>
        <option :value="50">50% resist</option>
        <option :value="75">75% resist</option>
      </select>
    </div>
    <label class="checkbox is-size-7 planner-damage-pierce">
      <input v-model="usePierce" type="checkbox" />
      apply my pierce
    </label>

    <p v-if="skills.length === 0" class="has-text-grey is-size-7 mb-0">
      No damaging skills allocated.
    </p>

    <div v-for="skill in skills" :key="skill.id" class="planner-damage-skill">
      <div class="planner-damage-skill__head">
        <span class="planner-damage-skill__name">{{ skill.name }}</span>
        <span class="planner-damage-skill__level">{{ skill.level }}</span>
      </div>
      <div v-for="component in skill.mitigated" :key="component.key" class="planner-damage-row">
        <span class="planner-damage-type" :class="'is-' + component.type">
          {{ component.label }}<template v-if="component.dot"> ({{ formatDuration(component.durationFrames) }})</template>
        </span>
        <span class="planner-damage-base">{{ formatRange(component.min, component.max) }}</span>
        <span
          class="planner-damage-effective"
          :title="`${component.resistPct}% effective enemy resistance`"
        >{{ formatRange(component.effectiveMin, component.effectiveMax) }}</span>
      </div>
      <div v-if="skill.weaponDamagePercent" class="planner-damage-row">
        <span class="planner-damage-type">Weapon</span>
        <span class="planner-damage-base">{{ Math.round(skill.weaponDamagePercent) }}%</span>
        <span class="planner-damage-effective has-text-grey">of weapon damage</span>
      </div>
      <div v-if="skill.totalMax" class="planner-damage-row is-total">
        <span class="planner-damage-type">Total / hit</span>
        <span class="planner-damage-base">{{ formatRange(skill.totalMin, skill.totalMax) }}</span>
        <span />
      </div>
    </div>
  </section>
</template>

<style scoped>
.planner-damage-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.planner-damage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.planner-damage-resist {
  max-width: 8.5rem;
  height: 1.8rem;
  font-size: 0.75rem;
}

.planner-damage-pierce {
  margin: 0;
  color: #9a9aa8;
  font-size: 0.72rem;
}

.planner-damage-skill {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.planner-damage-skill__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.planner-damage-skill__name {
  font-size: 0.8rem;
  font-weight: 600;
}

.planner-damage-skill__level {
  font-size: 0.7rem;
  color: #9a9aa8;
}

.planner-damage-row {
  display: grid;
  grid-template-columns: 6.5rem 1fr 1fr;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.planner-damage-row.is-total {
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
  padding-top: 0.15rem;
  font-weight: 600;
}

.planner-damage-type.is-physical {
  color: #d9c58f;
}
.planner-damage-type.is-fire {
  color: #ff8a65;
}
.planner-damage-type.is-cold {
  color: #82c8ff;
}
.planner-damage-type.is-lightning {
  color: #ffe066;
}
.planner-damage-type.is-poison {
  color: #9be07a;
}
.planner-damage-type.is-magic {
  color: #c9a7ff;
}

.planner-damage-effective {
  text-align: right;
  color: #b8b8c4;
}
</style>
