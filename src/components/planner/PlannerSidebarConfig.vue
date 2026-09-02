<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getActiveInternalSkillIdsForConditions } from '@/character/planner-core.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
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
  const activeSkills = getActiveInternalSkillIdsForConditions();
  const used = new Set();
  if (s && Array.isArray(s.catalog)) {
    for (const row of s.catalog) {
      const id = String(row.id);
      const parentId =
        row?.parentSkillId != null && String(row.parentSkillId).trim() !== ''
          ? String(row.parentSkillId).trim()
          : null;
      // Subskills are not allocated; surface their showConditions when the parent has points.
      if (!activeSkills.has(id) && !(parentId && activeSkills.has(parentId))) continue;
      for (const k of s.collectShowConditionKeys(row)) {
        used.add(String(k).toLowerCase());
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

function formatGroupLabel(group) {
  if (!group) return '';
  return String(group)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Cluster conditions: same group id becomes one visual block (first-seen order).
 * Ungrouped conditions stay as single-item clusters.
 */
const conditionClusters = computed(() => {
  const list = conditions.value;
  /** @type {Array<{ group: string|null, items: object[] }>} */
  const clusters = [];
  /** @type {Map<string, number>} */
  const groupIndex = new Map();

  for (const c of list) {
    const g = c.group != null && c.group !== '' ? String(c.group).toLowerCase() : null;
    if (g) {
      if (groupIndex.has(g)) {
        clusters[groupIndex.get(g)].items.push(c);
      } else {
        groupIndex.set(g, clusters.length);
        clusters.push({ group: g, items: [c] });
      }
    } else {
      clusters.push({ group: null, items: [c] });
    }
  }
  return clusters;
});
</script>

<template>
  <div class="planner-sidebar-config">
    <h3 class="title is-5">Conditions</h3>
    <div v-if="conditions.length === 0" class="help">No conditions defined for this version.</div>
    <div v-else class="conditions-list">
      <section
        v-for="(cluster, ci) in conditionClusters"
        :key="cluster.group ? `g-${cluster.group}` : `i-${cluster.items[0].key}-${ci}`"
        :class="['condition-cluster', { 'is-grouped': Boolean(cluster.group) }]"
      >
        <h4 v-if="cluster.group" class="condition-cluster__title">
          {{ formatGroupLabel(cluster.group) }}
        </h4>
        <div class="condition-cluster__body">
          <div v-for="c in cluster.items" :key="c.key" class="condition-item">
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
      </section>
    </div>
  </div>
</template>

<style scoped>
.planner-sidebar-config .conditions-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.condition-cluster.is-grouped {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.45rem 0.55rem 0.5rem;
}

.condition-cluster__title {
  margin: 0 0 0.35rem;
  color: #9a9aa8;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.condition-cluster.is-grouped .condition-cluster__body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.condition-item {
  padding: 0.35rem 0.15rem;
}

.condition-cluster.is-grouped .condition-item {
  padding: 0.15rem 0;
}
</style>
