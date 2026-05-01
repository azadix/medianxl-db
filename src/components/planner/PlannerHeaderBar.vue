<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  calculateArmorImageNumber,
  getCurrentBuildDisplayName,
  plannerBackToMenuFromTree,
  plannerExportBuildClick,
  plannerResetBuildClick,
  plannerSaveAsBuildClick,
  plannerSaveBuildClick,
} from '../../../tree/tree-core.js';
import {
  getCharacterInstance,
  getEffectivePlannerLevel,
  getSpentSkillPoints,
} from '../../../character/character-state.js';

const className = ref('');
const spentPoints = ref(0);
const effectiveLevel = ref(1);
const buildName = ref('Untitled build');

const displayClass = computed(() => className.value || 'No class');
const portraitSrc = computed(() => {
  if (!className.value) return '';
  return `portraits/${className.value}/${calculateArmorImageNumber(spentPoints.value)}.gif`;
});

function refreshHeaderState() {
  const ch = getCharacterInstance();
  const classSelect = document.getElementById('classSelect');
  className.value =
    ch?.className || (classSelect instanceof HTMLSelectElement ? classSelect.value : '') || '';
  spentPoints.value = getSpentSkillPoints();
  effectiveLevel.value = getEffectivePlannerLevel();
}

function onRefresh() {
  nextTick(refreshHeaderState);
}

function renameBuildLabel() {
  const currentName = buildName.value === 'Untitled build' ? '' : buildName.value;
  const nextName = prompt('Rename build:', currentName);
  if (nextName === null) return;
  const cleanName = String(nextName).trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  buildName.value = cleanName || 'Untitled build';
}

function setBuildNameLabel(name) {
  const cleanName = String(name ?? '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  buildName.value = cleanName || 'Untitled build';
}

function onBuildNameChanged(e) {
  setBuildNameLabel(e.detail?.name);
}

onMounted(() => {
  onRefresh();
  setBuildNameLabel(getCurrentBuildDisplayName());
  window.addEventListener('plannerStateChanged', onRefresh);
  window.addEventListener('skillPointsChanged', onRefresh);
  window.addEventListener('characterStatsChanged', onRefresh);
  window.addEventListener('questCompletionChanged', onRefresh);
  window.addEventListener('plannerStatsPanelRefresh', onRefresh);
  window.addEventListener('plannerBuildNameChanged', onBuildNameChanged);
});

onUnmounted(() => {
  window.removeEventListener('plannerStateChanged', onRefresh);
  window.removeEventListener('skillPointsChanged', onRefresh);
  window.removeEventListener('characterStatsChanged', onRefresh);
  window.removeEventListener('questCompletionChanged', onRefresh);
  window.removeEventListener('plannerStatsPanelRefresh', onRefresh);
  window.removeEventListener('plannerBuildNameChanged', onBuildNameChanged);
});
</script>

<template>
  <header class="planner-header-bar">
    <div class="planner-header-actions planner-header-actions--left buttons">
      <button id="backToMenuBtn" class="button is-light is-outlined" type="button" @click="plannerBackToMenuFromTree">
        <span class="icon"><i class="fa-solid fa-arrow-left"></i></span>
        <span>Menu</span>
      </button>
      <button id="saveBuildBtn" class="button is-success is-outlined" type="button" @click="plannerSaveBuildClick">
        <span class="icon"><i class="fa-solid fa-floppy-disk"></i></span>
        <span>Save</span>
      </button>
      <button id="saveAsBuildBtn" class="button is-success is-outlined" type="button" @click="plannerSaveAsBuildClick">
        <span>Save As</span>
      </button>
      <button id="exportBuildBtn" class="button is-link is-outlined" type="button" @click="plannerExportBuildClick">
        <span class="icon"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
        <span>Export</span>
      </button>
    </div>

    <div class="planner-header-center">
      <div class="planner-header-identity">
        <div class="planner-header-portrait">
          <img v-if="portraitSrc" :src="portraitSrc" :alt="displayClass" />
          <i v-else class="fa-solid fa-user"></i>
        </div>
        <div class="planner-header-title">
          <button class="planner-build-name-button" type="button" @click="renameBuildLabel">
            {{ buildName }}
          </button>
          <div class="planner-header-meta">
            <span>{{ displayClass }}</span>
            <span id="minLevelField" class="planner-header-level">
              <span id="minLevelDisplay">Level {{ effectiveLevel }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="planner-header-actions planner-header-actions--right buttons">
      <button id="resetBuildBtn" class="button is-danger is-outlined" type="button" @click="plannerResetBuildClick">
        <span class="icon"><i class="fa-solid fa-rotate-left"></i></span>
        <span>Reset</span>
      </button>
    </div>
  </header>
</template>
