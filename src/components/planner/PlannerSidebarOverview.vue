<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { setupPlannerMinLevelSkillPoolTooltips } from '../../../character/planner-stats-panel.js';
import {
  getEffectivePlannerLevel,
  getSpentSkillPoints,
  getTotalQuestSkillPoints,
} from '../../../character/character-state.js';
import Character from '../../../character/Character.js';

const spentPoints = ref(0);
const effectiveLevel = ref(1);
const availablePoints = ref(0);

function refreshSummary() {
  spentPoints.value = getSpentSkillPoints();
  effectiveLevel.value = getEffectivePlannerLevel();
  availablePoints.value =
    Character.getBaseSkillPoints(effectiveLevel.value) + getTotalQuestSkillPoints(effectiveLevel.value);
}

function onRefresh() {
  nextTick(refreshSummary);
}

onMounted(() => {
  nextTick(() => {
    setupPlannerMinLevelSkillPoolTooltips();
    refreshSummary();
  });
  window.addEventListener('plannerStateChanged', onRefresh);
  window.addEventListener('skillPointsChanged', onRefresh);
  window.addEventListener('characterStatsChanged', onRefresh);
  window.addEventListener('questCompletionChanged', onRefresh);
});

onUnmounted(() => {
  window.removeEventListener('plannerStateChanged', onRefresh);
  window.removeEventListener('skillPointsChanged', onRefresh);
  window.removeEventListener('characterStatsChanged', onRefresh);
  window.removeEventListener('questCompletionChanged', onRefresh);
});
</script>

<template>
  <div id="sidebarPaneOther">
    <section class="planner-card planner-character-card">
      <div class="planner-character-card__body">
        <span class="planner-card__eyebrow">Character</span>
        <div class="select is-fullwidth">
          <select id="classSelect"></select>
        </div>
        <p class="planner-character-card__meta">
          <span>Level {{ effectiveLevel }}</span>
          <span>{{ spentPoints }} / {{ availablePoints }} points</span>
        </p>
      </div>
    </section>

    <section class="planner-card">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">Skill bonuses</span>
          <label class="label mb-0" for="allSkillsBonus">+# to All Skills</label>
        </div>
        <input id="allSkillsBonus" type="number" class="input planner-compact-number" min="0" value="0" placeholder="0" />
      </div>
    </section>

    <section id="oskillPanel" class="planner-card" style="display: none">
      <span class="planner-card__eyebrow">oSkills</span>
      <label class="label" for="oskill-hidden">Add an oSkill</label>
      <div id="oskill-dropdown" class="oskill-dropdown-wrapper"></div>
      <input id="oskill-hidden" type="hidden" />
      <p class="help is-size-7 mt-2 mb-0">Add item-granted skills to compare them beside your tree skills.</p>
    </section>

    <div id="devotionField" class="planner-card" style="display: none">
      <span class="planner-card__eyebrow">Devotion</span>
      <div class="planner-card-row">
        <label class="label mb-0">Current devotion</label>
        <p id="devotionDisplay" class="planner-devotion-pill">None</p>
      </div>
    </div>
  </div>
</template>
