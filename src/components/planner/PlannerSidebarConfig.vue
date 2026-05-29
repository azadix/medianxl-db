<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getFileSkillStore } from '@/tree/skill-data-store.js';
import { getAllSkillPoints } from '@/character/character-state.js';
import { toggleCondition, selectedConditions } from '@/stores/planner-config-store.js';

const refreshCount = ref(0);

function refreshConditions() {
  refreshCount.value += 1;
}

onMounted(() => {
  window.addEventListener('skillPointsChanged', refreshConditions);
  window.addEventListener('skillDataStoreInitialized', refreshConditions);
  window.addEventListener('plannerConfigChanged', refreshConditions);
});

onBeforeUnmount(() => {
  window.removeEventListener('skillPointsChanged', refreshConditions);
  window.removeEventListener('skillDataStoreInitialized', refreshConditions);
  window.removeEventListener('plannerConfigChanged', refreshConditions);
});

const conditions = computed(() => {
  // Use reactive counter to refresh when skill points change or data loads.
  refreshCount.value;
  const s = getFileSkillStore();
  const all = s && Array.isArray(s.conditions) ? s.conditions : [];
  const activeSkillPoints = getAllSkillPoints();
  const activeSkills = new Set(
    Object.entries(activeSkillPoints)
      .filter(([, points]) => Number(points) > 0)
      .map(([skillName]) => String(skillName).trim())
      .filter((key) => key !== '')
  );
  const used = new Set();
  if (s && Array.isArray(s.catalog)) {
    for (const row of s.catalog) {
      if (!activeSkills.has(String(row.id))) continue;
      if (Array.isArray(row.showCondition)) {
        for (const k of row.showCondition) {
          if (k != null) used.add(String(k).toLowerCase());
        }
      }
    }
  }
  return all.filter((c) => {
    if (!c || !c.key) return false;
    const keyLower = String(c.key).toLowerCase();
    if (used.has(keyLower)) return true;
    if (c.defaultVisible === true) return true;
    return false;
  });
});
</script>

<template>
  <div class="planner-sidebar-config">
    <h3 class="title is-5">Conditions</h3>
    <div v-if="conditions.length === 0" class="help">No conditions defined for this version.</div>
    <div v-else class="conditions-list">
      <div v-for="c in conditions" :key="c.key" class="condition-item">
        <p class="planner-quest-title">
          <label :class="['planner-quest-pill', { 'is-checked': Boolean(selectedConditions[String(c.key).toLowerCase()]) } ]">
            <input
              type="checkbox"
              class="planner-quest-cb"
              :checked="Boolean(selectedConditions[String(c.key).toLowerCase()])"
              @change="toggleCondition(c.key)"
            />
            {{ c.name || c.key }}
          </label>
        </p>
        <div v-if="c.description" class="mt-2">{{ c.description }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.planner-sidebar-config .conditions-list { display: flex; flex-direction: column; gap: 0.5rem; }
.condition-item { padding: 0.5rem; }
</style>
