<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlannerStore } from '../../stores/planner.js';
import { getSavedBuilds } from '../../planner/saved-builds-storage.js';
import {
  calculateArmorImageNumber,
  loadBuild,
  deleteBuild,
  renameBuild,
  ensureCharacterForBuildList,
} from '../../../tree/tree-core.js';
import { getSpentSkillPoints } from '../../../character/character-state.js';

const { activeSection } = storeToRefs(usePlannerStore());

const builds = ref([]);
/** Bumps when current class/points change so portrait URLs re-evaluate without re-reading storage. */
const portraitTick = ref(0);

function refreshFromStorage() {
  ensureCharacterForBuildList();
  builds.value = getSavedBuilds();
}

function onSavedBuildsListRefresh() {
  refreshFromStorage();
}

function bumpPortraitsIfLoad() {
  if (activeSection.value === 'load') {
    portraitTick.value++;
  }
}

function portraitSrc(build) {
  void portraitTick.value;
  const cs = document.getElementById('classSelect');
  const currentClass = cs ? cs.value : '';
  const spent = getSpentSkillPoints();
  if (build.class === currentClass) {
    return `portraits/${build.class}/${calculateArmorImageNumber(spent)}.gif`;
  }
  return `portraits/${build.class}/${calculateArmorImageNumber(build.spentPoints)}.gif`;
}

onMounted(() => {
  window.addEventListener('savedBuildsListRefresh', onSavedBuildsListRefresh);
  window.addEventListener('skillPointsChanged', bumpPortraitsIfLoad);
  window.addEventListener('characterStatsChanged', bumpPortraitsIfLoad);
  refreshFromStorage();
});

onUnmounted(() => {
  window.removeEventListener('savedBuildsListRefresh', onSavedBuildsListRefresh);
  window.removeEventListener('skillPointsChanged', bumpPortraitsIfLoad);
  window.removeEventListener('characterStatsChanged', bumpPortraitsIfLoad);
});

watch(activeSection, (s) => {
  if (s === 'load') {
    refreshFromStorage();
  }
});
</script>

<template>
  <div id="saved-builds-list">
    <p v-if="builds.length === 0" class="has-text-grey-light">No saved builds found</p>
    <div v-for="(build, index) in builds" :key="`${build.savedAt || 'legacy'}-${index}`" class="box mb-3">
      <div class="columns is-vcentered">
        <div class="column is-narrow py-0">
          <img
            :src="portraitSrc(build)"
            :alt="build.class"
            class="image is-64x64"
            style="object-fit: contain"
          />
        </div>
        <div class="column p-0">
          <p class="title is-4 has-text-weight-bold mb-2">
            <span v-if="String(build.name || '').trim() !== ''">{{ build.name }}</span>
            <span v-else class="has-text-grey">Unnamed build</span>
          </p>
          <p class="subtitle is-6 mb-1">
            <span class="tag has-text-info">Level {{ build.level }} {{ build.class }}</span>
            <span class="tag">{{ build.spentPoints }} points spent</span>
            <span class="tag">v{{ build.version || 'unknown' }}</span>
          </p>
        </div>
        <div class="column is-narrow">
          <div class="buttons">
            <button
              type="button"
              class="button is-primary is-outlined"
              @click="loadBuild(index)"
            >
              Load
            </button>
            <button
              type="button"
              class="button is-info is-outlined"
              @click="renameBuild(index)"
            >
              Rename
            </button>
            <button
              type="button"
              class="button is-danger is-outlined"
              @click="deleteBuild(index)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
