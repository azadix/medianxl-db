<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  calculateArmorImageNumber,
  getCurrentBuildDisplayName,
  plannerBackToMenuFromTree,
  plannerExportBuildClick,
  plannerMenuOpenHelp,
  plannerRefreshAfterLevelOptions,
  plannerRenameBuildClick,
  plannerResetBuildClick,
  plannerSaveAsBuildClick,
  plannerSaveBuildClick,
} from '../../../tree/tree-core.js';
import {
  getCharacterInstance,
  getCharacterLevel,
  getEffectivePlannerLevel,
  getSpentSkillPoints,
  setCharacterLevel,
  syncPlannerCharacterLevelIfAuto,
} from '../../../character/character-state.js';
import Character from '../../../character/Character.js';
import {
  getPlannerAutoLevelFromSpentSkillPoints,
  setPlannerAutoLevelFromSpentSkillPoints,
} from '../../planner/planner-level-options.js';

const className = ref('');
const spentPoints = ref(0);
const effectiveLevel = ref(1);
const buildName = ref('Untitled build');

const showOptionsModal = ref(false);
const draftAutoLevelFromSp = ref(true);
const draftCharacterLevel = ref(1);

const minLv = Character.MIN_LEVEL;
const maxLv = Character.MAX_LEVEL;

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

function openPlannerOptions() {
  draftAutoLevelFromSp.value = getPlannerAutoLevelFromSpentSkillPoints();
  draftCharacterLevel.value = getCharacterLevel();
  showOptionsModal.value = true;
}

function closePlannerOptions() {
  showOptionsModal.value = false;
}

function applyPlannerOptions() {
  setPlannerAutoLevelFromSpentSkillPoints(draftAutoLevelFromSp.value);
  if (draftAutoLevelFromSp.value) {
    syncPlannerCharacterLevelIfAuto();
  } else {
    const n = Math.round(Number(draftCharacterLevel.value));
    const clamped = Number.isFinite(n)
      ? Math.max(minLv, Math.min(maxLv, n))
      : Character.clampLevel(getCharacterLevel());
    setCharacterLevel(clamped);
  }
  plannerRefreshAfterLevelOptions();
  closePlannerOptions();
}

function onRefresh() {
  nextTick(refreshHeaderState);
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
      <button
        id="plannerOptionsBtn"
        class="button is-light is-outlined"
        type="button"
        title="Planner options"
        aria-label="Planner options"
        @click="openPlannerOptions"
      >
        <span class="icon"><i class="fa-solid fa-gear"></i></span>
      </button>
      <button
        id="plannerHelpBtn"
        class="button is-info is-outlined"
        type="button"
        title="Planner help"
        aria-label="Planner help"
        @click="plannerMenuOpenHelp"
      >
        <span>?</span>
      </button>
    </div>

    <div
      v-if="showOptionsModal"
      id="plannerOptionsModal"
      class="modal is-active"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plannerOptionsModalTitle"
    >
      <div class="modal-background" @click="closePlannerOptions"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p id="plannerOptionsModalTitle" class="modal-card-title">Planner options</p>
          <button type="button" class="delete" aria-label="close" @click="closePlannerOptions"></button>
        </header>
        <section class="modal-card-body">
          <div class="field">
            <label class="checkbox">
              <input v-model="draftAutoLevelFromSp" type="checkbox" />
              Automatically set level from skill points spent
            </label>
            <p class="help">
              When on, level is at least the minimum required by your build (default). When off, set level manually;
              available skill points follow that level.
            </p>
          </div>
          <div class="field">
            <label class="label" for="plannerManualLevelInput">Character level</label>
            <div class="control">
              <input
                id="plannerManualLevelInput"
                v-model.number="draftCharacterLevel"
                class="input"
                type="number"
                :min="minLv"
                :max="maxLv"
                :disabled="draftAutoLevelFromSp"
              />
            </div>
            <p class="help">Allowed range: {{ minLv }} to {{ maxLv }}.</p>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button type="button" class="button is-primary" @click="applyPlannerOptions">Apply</button>
          <button type="button" class="button" @click="closePlannerOptions">Cancel</button>
        </footer>
      </div>
    </div>

    <div class="planner-header-center">
      <div class="planner-header-identity">
        <div class="planner-header-portrait">
          <img v-if="portraitSrc" :src="portraitSrc" :alt="displayClass" />
          <i v-else class="fa-solid fa-user"></i>
        </div>
        <div class="planner-header-title">
          <button class="planner-build-name-button" type="button" @click="plannerRenameBuildClick">
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
