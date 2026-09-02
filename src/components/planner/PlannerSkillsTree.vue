<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  getFileSkillStore,
  buildTabOrderLookupFromGameMeta,
  tabOrderRankFromLookup
} from '@/shared/skill-data-store.js';
import { usePlannerStore } from '@/stores/planner.js';
import { updatePlannerUrlTab } from '@/planner/tree-url-sync.js';
import { handleSkillPointChange, setCurrentTabState } from '@/tree/tree-render.js';
import SkillCard from '@/components/skills/SkillCard.vue';
import { usePlannerSkillsTree } from '@/composables/usePlannerSkillsTree.js';
import PlannerSkillPointsBadge from './PlannerSkillPointsBadge.vue';
import { plannerResetTreeClick } from '@/planner/planner-dom-handlers.js';

const store = usePlannerStore();
let resizeFrame = 0;

function syncTabToUrl(tabName) {
  setCurrentTabState(tabName);
  const cs = document.getElementById('classSelect');
  updatePlannerUrlTab(cs ? cs.value : '', tabName);
}

const payload = ref(null);
const activeTab = ref('');

const classSkills = computed(() => {
  if (!payload.value) return [];
  return payload.value.skillsList.filter((s) => s.class === payload.value.selectedClass);
});

const sharedInnateSkills = computed(() => {
  return classSkills.value.filter((s) => s.tabName === 'Innate' && s.sharedInnate);
});

const classSpecificInnateSkills = computed(() => {
  return classSkills.value.filter((s) => s.tabName === 'Innate' && !s.sharedInnate);
});

const tabsByName = computed(() => {
  const tabs = {};
  for (const skill of classSkills.value) {
    if (!tabs[skill.tabName]) tabs[skill.tabName] = [];
    tabs[skill.tabName].push(skill);
  }
  return tabs;
});

const sortedTabNames = computed(() => {
  const tabs = tabsByName.value;
  const tabNames = Object.keys(tabs);
  const specialTabs = ['Mastery', 'Reward', 'Innate'];
  const fileStore = getFileSkillStore();
  const tabOrderLookup = buildTabOrderLookupFromGameMeta(fileStore?.gameMeta ?? null);
  return tabNames.sort((a, b) => {
    const aIsSpecial = specialTabs.includes(a);
    const bIsSpecial = specialTabs.includes(b);
    if (aIsSpecial && bIsSpecial) {
      return specialTabs.indexOf(a) - specialTabs.indexOf(b);
    }
    if (aIsSpecial) return 1;
    if (bIsSpecial) return -1;
    const listA = tabs[a];
    const listB = tabs[b];
    const orderA =
      listA?.length > 0 ? tabOrderRankFromLookup(listA[0], tabOrderLookup) : Infinity;
    const orderB =
      listB?.length > 0 ? tabOrderRankFromLookup(listB[0], tabOrderLookup) : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return String(a).localeCompare(String(b));
  });
});

function gridRange(tabName) {
  const skills = tabsByName.value[tabName];
  if (!skills || !skills.length) {
    return { minRow: 0, maxRow: -1, minCol: 0, maxCol: -1 };
  }
  const rows = skills.map((s) => Number(s.row));
  const cols = skills.map((s) => Number(s.col));
  const clean = (n) => (Number.isFinite(n) ? n : 0);
  const cleanRows = rows.map(clean);
  const cleanCols = cols.map(clean);
  return {
    minRow: Math.min(...cleanRows),
    maxRow: Math.max(...cleanRows),
    minCol: Math.min(...cleanCols),
    maxCol: Math.max(...cleanCols),
  };
}

/** Safe CSS grid repeat counts (avoid repeat(0) / NaN when data is odd). */
function gridTemplateDims(tabName) {
  const g = gridRange(tabName);
  if (g.maxRow < g.minRow) {
    return { rows: 1, cols: 1 };
  }
  const rowCount = g.maxRow - g.minRow + 1;
  const colCount = g.maxCol - g.minCol + 1;
  const rows = Number.isFinite(rowCount) && rowCount > 0 ? rowCount : 1;
  const cols = Number.isFinite(colCount) && colCount > 0 ? colCount : 1;
  return { rows, cols };
}

function skillAt(tabName, r, c) {
  const rr = Number(r);
  const cc = Number(c);
  return (
    tabsByName.value[tabName]?.find(
      (s) => Number(s.row) === rr && Number(s.col) === cc
    ) ?? null
  );
}

function cellsForTab(tabName) {
  const g = gridRange(tabName);
  const out = [];
  if (g.maxRow < g.minRow) return out;
  for (let r = g.minRow; r <= g.maxRow; r++) {
    for (let c = g.minCol; c <= g.maxCol; c++) {
      out.push({
        r,
        c,
        gr: r - g.minRow + 1,
        gc: c - g.minCol + 1,
        skill: skillAt(tabName, r, c),
      });
    }
  }
  return out;
}

const {
  cardDataForSkill,
  oskillCardRows,
  oskillGridStyle,
  oskillGridArea,
  onOskillPlus,
  onOskillMinus,
  scheduleArrows,
} = usePlannerSkillsTree({ payload, classSkills, activeTab, gridRange });

function switchTab(tabName) {
  syncTabToUrl(tabName);
  activeTab.value = tabName;
  const oskillPanel = document.getElementById('oskillPanel');
  if (oskillPanel) {
    oskillPanel.style.display = tabName === 'oSkills' ? 'flex' : 'none';
  }
  nextTick(() => scheduleArrows());
}

function onFullRender(detail) {
  payload.value = {
    selectedClass: detail.selectedClass,
    skillsList: detail.skillsList,
    preserveTab: detail.preserveTab,
    redrawArrows: detail.redrawArrows,
  };
  const names = sortedTabNames.value;
  const first = names[0];
  const next =
    detail.preserveTab && (names.includes(detail.preserveTab) || detail.preserveTab === 'oSkills')
      ? detail.preserveTab
      : first;
  activeTab.value = next || '';
  if (next) {
    syncTabToUrl(next);
  }
  const oskillPanel = document.getElementById('oskillPanel');
  if (oskillPanel) {
    oskillPanel.style.display = next === 'oSkills' ? 'flex' : 'none';
  }
  nextTick(() => scheduleArrows());
}

function onLightUpdate() {
  store.bump();
}

function onPlannerRenderRequested(e) {
  onFullRender(e.detail || {});
}

function onPlannerLight() {
  onLightUpdate();
}

function onWindowResize() {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    nextTick(() => scheduleArrows());
  });
}

function onRedrawArrows() {
  nextTick(() => scheduleArrows());
}

onMounted(() => {
  window.addEventListener('plannerSkillsRenderRequested', onPlannerRenderRequested);
  window.addEventListener('plannerSkillsLightUpdate', onPlannerLight);
  window.addEventListener('plannerSkillsRedrawArrows', onRedrawArrows);
  window.addEventListener('resize', onWindowResize, { passive: true });
});

onUnmounted(() => {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
  }
  window.removeEventListener('plannerSkillsRenderRequested', onPlannerRenderRequested);
  window.removeEventListener('plannerSkillsLightUpdate', onPlannerLight);
  window.removeEventListener('plannerSkillsRedrawArrows', onRedrawArrows);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<template>
  <div v-if="payload" class="planner-skills-tree-inner">
    <div class="tabs">
      <ul>
        <li
          v-for="tabName in sortedTabNames"
          :key="tabName"
          :class="{ 'is-active': activeTab === tabName }"
        >
          <a href="#" :data-tab="tabName" @click.prevent="switchTab(tabName)">{{ tabName }}</a>
        </li>
        <li :class="{ 'is-active': activeTab === 'oSkills' }">
          <a href="#" data-tab="oSkills" @click.prevent="switchTab('oSkills')">oSkills</a>
        </li>
      </ul>
      <div class="planner-tab-actions">
        <button
          id="resetTreeBtn"
          class="button is-danger is-outlined is-small"
          type="button"
          @click="plannerResetTreeClick"
        >
          <span class="icon"><i class="fa-solid fa-rotate-left"></i></span>
          <span>Reset tree</span>
        </button>
        <PlannerSkillPointsBadge />
      </div>
    </div>
    <div class="planner-skills-tab-panels">
      <template v-for="tabName in sortedTabNames" :key="tabName">
        <div
          v-if="tabName !== 'Innate'"
          :id="'tab-' + tabName"
          class="skills-grid"
          :style="{
            display: activeTab === tabName ? 'grid' : 'none',
            gridTemplateRows: `repeat(${gridTemplateDims(tabName).rows}, auto)`,
            gridTemplateColumns: `repeat(${gridTemplateDims(tabName).cols}, 1fr)`,
          }"
        >
          <template v-for="cell in cellsForTab(tabName)" :key="tabName + '-' + cell.r + '-' + cell.c">
            <SkillCard
              v-if="cell.skill"
              :style="{ gridRow: cell.gr, gridColumn: cell.gc }"
              :card-data="cardDataForSkill(cell.skill)"
              :planner-revision="store.revision"
              @plus="(d) => handleSkillPointChange(cell.skill, d, payload.skillsList)"
              @minus="(d) => handleSkillPointChange(cell.skill, d, payload.skillsList)"
            />
            <div
              v-else
              class="empty-skill-card"
              :style="{ gridRow: cell.gr, gridColumn: cell.gc }"
            />
          </template>
        </div>

        <div v-else class="planner-innate-sections" :style="{ display: activeTab === 'Innate' ? 'block' : 'none' }">
          <div
            v-if="classSpecificInnateSkills.length"
            class="skills-grid mb-3"
            :style="{
              display: 'grid',
              gridTemplateRows: `repeat(${Math.ceil(classSpecificInnateSkills.length / 3)}, auto)`,
              gridTemplateColumns: 'repeat(3, 1fr)',
            }"
          >
            <SkillCard
              v-for="(sk, idx) in classSpecificInnateSkills"
              :key="'class-innate-' + String(sk.id)"
              :style="{
                gridRow: Math.floor(idx / 3) + 1,
                gridColumn:
                  classSpecificInnateSkills.length === 1 ? 2 : (idx % 3) + 1,
              }"
              :card-data="cardDataForSkill(sk)"
              :planner-revision="store.revision"
            />
          </div>

          <div
            v-if="sharedInnateSkills.length"
            class="skills-grid"
            :style="{
              display: 'grid',
              gridTemplateRows: `repeat(${Math.ceil(sharedInnateSkills.length / 3)}, auto)`,
              gridTemplateColumns: 'repeat(3, 1fr)',
            }"
          >
            <SkillCard
              v-for="(sk, idx) in sharedInnateSkills"
              :key="'shared-innate-' + String(sk.id)"
              :style="{ gridRow: Math.floor(idx / 3) + 1, gridColumn: (idx % 3) + 1 }"
              :card-data="cardDataForSkill(sk)"
              :planner-revision="store.revision"
            />
          </div>
        </div>
      </template>

      <div
        id="tab-oSkills"
        class="skills-grid"
        :style="{ display: activeTab === 'oSkills' ? 'grid' : 'none', ...oskillGridStyle }"
      >
        <SkillCard
          v-for="(cd, idx) in oskillCardRows"
          :key="'os-' + idx + '-' + String(cd.skillId ?? '')"
          :style="oskillGridArea(idx)"
          :card-data="cd"
          :planner-revision="store.revision"
          @plus="(d) => onOskillPlus(cd, d)"
          @minus="(d) => onOskillMinus(cd, d)"
        />
      </div>
    </div>
  </div>
</template>
