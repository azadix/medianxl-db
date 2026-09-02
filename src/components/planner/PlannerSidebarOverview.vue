<script setup>
import { usePlannerSkillPoints } from '@/composables/usePlannerSkillPoints.js';

const { spentPoints, effectiveLevel, availablePoints } = usePlannerSkillPoints({
  setupPoolTooltips: true,
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

    <section class="planner-card planner-skill-bonuses-card">
      <span class="planner-card__eyebrow">Skill bonuses</span>
      <div class="planner-card-row">
        <label class="label mb-0 has-text-info" for="allSkillsBonus">+# to All Skills</label>
        <input id="allSkillsBonus" type="number" class="input planner-compact-number" min="0" value="0" placeholder="0" />
      </div>
      <div class="planner-card-row">
        <label class="label mb-0 skill-bonus-class" id="classSkillsBonusLabel" for="classSkillsBonus">+# to Class Skills</label>
        <input id="classSkillsBonus" type="number" class="input planner-compact-number" min="0" value="0" placeholder="0" />
      </div>
    </section>

    <section id="oskillPanel" class="planner-card planner-inline-card" style="display: none">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">oSkills</span>
          <label class="label mb-0" for="oskill-hidden">Add an oSkill</label>
        </div>
        <div class="planner-card-control planner-oskill-control">
          <div id="oskill-dropdown" class="oskill-dropdown-wrapper"></div>
          <input id="oskill-hidden" type="hidden" />
        </div>
      </div>
    </section>

    <div id="devotionField" class="planner-card planner-inline-card" style="display: none">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">Devotion</span>
          <label class="label mb-0">Current devotion</label>
        </div>
        <p id="devotionDisplay" class="planner-devotion-pill">None</p>
      </div>
    </div>
  </div>
</template>
