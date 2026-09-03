<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlannerStore } from '@/stores/planner.js';
import { getSavedBuilds } from '@/planner/saved-builds-storage.js';
import { calculateArmorImageNumber } from '@/planner/planner-ui-updates.js';
import {
  loadBuild,
  deleteBuild,
  renameBuild,
  downloadSavedBuildAsJson,
  exportBuild,
  ensureCharacterForBuildList,
} from '@/planner/saved-builds-ui.js';
import { getSpentSkillPoints } from '@/character/planner-core.js';

const { activeSection } = storeToRefs(usePlannerStore());

const builds = ref([]);
/** Bumps when current class/points change so portrait URLs re-evaluate without re-reading storage. */
const portraitTick = ref(0);
/** Index of the row whose Export dropdown is open, or null. */
const openExportIndex = ref(/** @type {number | null} */ (null));

function refreshFromStorage() {
  ensureCharacterForBuildList();
  builds.value = getSavedBuilds();
  openExportIndex.value = null;
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

/**
 * @param {number} index
 */
function toggleExportDropdown(index) {
  openExportIndex.value = openExportIndex.value === index ? null : index;
}

/**
 * @param {number} index
 */
function exportToFile(index) {
  openExportIndex.value = null;
  downloadSavedBuildAsJson(index);
}

/**
 * @param {number} index
 */
function copyJson(index) {
  openExportIndex.value = null;
  exportBuild(index);
}

/**
 * @param {Event} e
 */
function onGlobalPointerDown(e) {
  const el = /** @type {HTMLElement | null} */ (e.target);
  if (!el?.closest) return;
  if (el.closest('.planner-export-dd')) return;
  openExportIndex.value = null;
}

/**
 * @param {KeyboardEvent} e
 */
function onGlobalKeydown(e) {
  if (e.key === 'Escape') {
    openExportIndex.value = null;
  }
}

onMounted(() => {
  window.addEventListener('savedBuildsListRefresh', onSavedBuildsListRefresh);
  window.addEventListener('skillPointsChanged', bumpPortraitsIfLoad);
  window.addEventListener('characterStatsChanged', bumpPortraitsIfLoad);
  document.addEventListener('pointerdown', onGlobalPointerDown, true);
  document.addEventListener('keydown', onGlobalKeydown);
  refreshFromStorage();
});

onUnmounted(() => {
  window.removeEventListener('savedBuildsListRefresh', onSavedBuildsListRefresh);
  window.removeEventListener('skillPointsChanged', bumpPortraitsIfLoad);
  window.removeEventListener('characterStatsChanged', bumpPortraitsIfLoad);
  document.removeEventListener('pointerdown', onGlobalPointerDown, true);
  document.removeEventListener('keydown', onGlobalKeydown);
});

watch(activeSection, (s) => {
  if (s === 'load') {
    refreshFromStorage();
  } else {
    openExportIndex.value = null;
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
            <div
              class="dropdown planner-export-dd is-right"
              :class="{ 'is-active': openExportIndex === index }"
            >
              <div class="dropdown-trigger">
                <button
                  type="button"
                  class="button is-link is-outlined"
                  aria-haspopup="true"
                  :aria-expanded="openExportIndex === index"
                  @click.stop="toggleExportDropdown(index)"
                >
                  <span>Export</span>
                  <span class="icon is-small">
                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                  </span>
                </button>
              </div>
              <div class="dropdown-menu" role="menu">
                <div class="dropdown-content">
                  <a
                    class="dropdown-item"
                    role="menuitem"
                    href="#"
                    @click.prevent="exportToFile(index)"
                  >
                    Export to file
                  </a>
                  <a
                    class="dropdown-item"
                    role="menuitem"
                    href="#"
                    @click.prevent="copyJson(index)"
                  >
                    Copy JSON text
                  </a>
                </div>
              </div>
            </div>
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

<style scoped>
/* .buttons already uses gap; extra margin shifts the dropdown trigger up. */
.planner-export-dd {
  margin: 0;
}

.planner-export-dd.is-active {
  z-index: 30;
}

.planner-export-dd .dropdown-content {
  z-index: 30;
  border: 1px solid var(--bulma-link);
}
</style>
