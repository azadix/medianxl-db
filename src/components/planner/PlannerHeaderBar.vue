<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { usePlannerRevisionRefresh } from '@/composables/usePlannerRevisionRefresh.js';
import { usePlannerSkillPoints } from '@/composables/usePlannerSkillPoints.js';
import { calculateArmorImageNumber } from '@/planner/planner-ui-updates.js';
import { getCurrentBuildDisplayName } from '@/planner/planner-session.js';
import { plannerRefreshAfterLevelOptions } from '@/planner/planner-init.js';
import {
  plannerBackToMenuFromTree,
  plannerExportBuildClick,
  plannerMenuOpenHelp,
  plannerRenameBuildClick,
  plannerResetBuildClick,
  plannerSaveAsBuildClick,
  plannerSaveBuildClick,
} from '@/planner/planner-dom-handlers.js';
import {
  getCharacterInstance,
  getCharacterLevel,
  setCharacterLevel,
  syncPlannerCharacterLevelIfAuto,
} from '@/character/planner-core.js';
import Character from '@/character/Character.js';
import {
  getPlannerAutoLevelFromSpentSkillPoints,
  setPlannerAutoLevelFromSpentSkillPoints,
} from '@/planner/planner-level-options.js';

const className = ref('');
const buildName = ref('Untitled build');

const { spentPoints, effectiveLevel } = usePlannerSkillPoints();

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
  window.addEventListener('plannerBuildNameChanged', onBuildNameChanged);
});

usePlannerRevisionRefresh(onRefresh);

onUnmounted(() => {
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
      <button id="resetBuildBtn" class="button is-danger is-outlined" type="button" @click="plannerResetBuildClick">
        <span class="icon"><i class="fa-solid fa-rotate-left"></i></span>
        <span>Reset</span>
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
      class="modal is-active planner-export-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plannerOptionsModalTitle"
    >
      <div class="modal-background" @click="closePlannerOptions"></div>
      <div class="modal-card planner-export-modal__card">
        <header class="modal-card-head planner-export-modal__head p-4">
          <span class="icon planner-export-modal__icon">
            <i class="fa-solid fa-sliders"></i>
          </span>
          <div class="planner-export-modal__title">
            <p id="plannerOptionsModalTitle" class="modal-card-title mb-0">Planner options</p>
            <p class="is-size-7 has-text-grey-light mb-0">
              Adjust how character level and skill points interact.
            </p>
          </div>
          <button type="button" class="delete" aria-label="Close" @click="closePlannerOptions"></button>
        </header>
        <section class="modal-card-body planner-export-modal__body p-4">
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
        <footer class="modal-card-foot planner-export-modal__foot p-4">
          <button type="button" class="button is-primary is-inverted is-outlined" @click="applyPlannerOptions">
            <span class="icon"><i class="fa-solid fa-check"></i></span>
            <span>Apply</span>
          </button>
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

    <div class="planner-header-actions planner-header-actions--right buttons"></div>
  </header>
</template>
