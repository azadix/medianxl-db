<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  plannerMenuNewBuild,
  plannerMenuOpenLoadSection,
  plannerMenuPrepareImport,
  plannerMenuImportBuildFromText,
  plannerMenuReadBuildJsonFile,
  plannerMenuReadPastebinBuild,
} from '@/planner/planner-dom-handlers.js';

const knownIssuesLines = ref(/** @type {string[]} */ ([]));
const knownIssuesLoadError = ref('');
const knownIssuesFetched = ref(false);

const showImportModal = ref(false);
const importJsonText = ref('');
const importFileName = ref('');
const importPastebinUrl = ref('');
const importDragOver = ref(false);
const importBusy = ref(false);
const importFileInput = ref(/** @type {HTMLInputElement | null} */ (null));
const importTextarea = ref(/** @type {HTMLTextAreaElement | null} */ (null));

onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown);
  try {
    const url = new URL('known_issues.txt', window.location.origin + import.meta.env.BASE_URL).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    knownIssuesLines.value = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    knownIssuesLoadError.value = 'Could not load known issues.';
  } finally {
    knownIssuesFetched.value = true;
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown);
});

/**
 * @param {KeyboardEvent} e
 */
function onGlobalKeydown(e) {
  if (e.key === 'Escape' && showImportModal.value) {
    closeImportModal();
  }
}

async function openImportModal() {
  await plannerMenuPrepareImport();
  importJsonText.value = '';
  importFileName.value = '';
  importPastebinUrl.value = '';
  importDragOver.value = false;
  importBusy.value = false;
  showImportModal.value = true;
  await nextTick();
  importTextarea.value?.focus();
}

function closeImportModal() {
  showImportModal.value = false;
  importDragOver.value = false;
  importBusy.value = false;
}

function openImportFilePicker() {
  const input = importFileInput.value;
  if (!input) return;
  input.value = '';
  input.click();
}

/**
 * @param {File | null | undefined} file
 */
async function loadImportFile(file) {
  if (!file || importBusy.value) return;
  if (importJsonText.value.trim() !== '') {
    const replace = window.confirm('Replace the pasted JSON with this file?');
    if (!replace) return;
  }
  importBusy.value = true;
  try {
    const text = await plannerMenuReadBuildJsonFile(file);
    if (text == null) return;
    importJsonText.value = text;
    importFileName.value = file.name || 'build.json';
  } finally {
    importBusy.value = false;
  }
}

async function loadImportPastebin() {
  if (importBusy.value || importPastebinUrl.value.trim() === '') return;
  if (importJsonText.value.trim() !== '') {
    const replace = window.confirm('Replace the current JSON with the Pastebin paste?');
    if (!replace) return;
  }
  importBusy.value = true;
  try {
    const text = await plannerMenuReadPastebinBuild(importPastebinUrl.value);
    if (text == null) return;
    importJsonText.value = text;
    importFileName.value = '';
  } finally {
    importBusy.value = false;
  }
}

/** Editing the paste field means content is no longer tied to a loaded file. */
function onImportJsonInput() {
  if (importFileName.value) {
    importFileName.value = '';
  }
}

/**
 * @param {Event} e
 */
async function onImportFileSelected(e) {
  const input = /** @type {HTMLInputElement} */ (e.target);
  const file = input.files && input.files[0] ? input.files[0] : null;
  input.value = '';
  await loadImportFile(file);
}

/**
 * @param {DragEvent} e
 */
function onImportDragOver(e) {
  e.preventDefault();
  importDragOver.value = true;
}

function onImportDragLeave() {
  importDragOver.value = false;
}

/**
 * @param {DragEvent} e
 */
async function onImportDrop(e) {
  e.preventDefault();
  importDragOver.value = false;
  const file = e.dataTransfer?.files?.[0] || null;
  await loadImportFile(file);
}

async function confirmImport() {
  if (importBusy.value) return;
  importBusy.value = true;
  try {
    const ok = await plannerMenuImportBuildFromText(importJsonText.value);
    if (ok) {
      closeImportModal();
    }
  } finally {
    importBusy.value = false;
  }
}
</script>

<template>
  <section id="menu-section">
    <div class="container" style="max-width: 600px; margin-top: 10vh">
      <div class="buttons is-flex is-flex-direction-column">
        <button id="menuNewBuildBtn" class="button is-large is-fullwidth" type="button" @click="plannerMenuNewBuild">
          <span class="icon-text">
            <span>New Build</span>
          </span>
        </button>

        <button
          id="menuImportBuildBtn"
          class="button is-large is-fullwidth"
          type="button"
          @click="openImportModal"
        >
          <span class="icon-text">
            <span>Import Build</span>
          </span>
        </button>

        <button
          id="menuLoadBuildBtn"
          class="button is-large is-fullwidth"
          type="button"
          @click="plannerMenuOpenLoadSection"
        >
          <span class="icon-text">
            <span>Load build</span>
          </span>
        </button>
      </div>

      <div class="notification mt-4">
        <div class="has-text-danger has-text-weight-bold">Work in Progress Warning</div>
        <div class="has-text-danger mt-2">
          This skill planner is currently under development. Saved builds might not load properly or may be lost during updates. Please use with caution.
        </div>
      </div>

      <div class="notification mt-4">
        <div v-if="knownIssuesLoadError" class="has-text-danger">{{ knownIssuesLoadError }}</div>
        <div v-else-if="!knownIssuesFetched" class="has-text-grey">Loading known issues</div>
        <div v-else class="content has-text-danger mt-2">
          <div class="has-text-weight-bold mb-2">Known issues</div>
          <ul v-if="knownIssuesLines.length">
            <li v-for="(line, i) in knownIssuesLines" :key="i">{{ line }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div
      v-if="showImportModal"
      id="plannerImportBuildModal"
      class="modal is-active planner-export-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plannerImportBuildModalTitle"
    >
      <div class="modal-background" @click="closeImportModal"></div>
      <div class="modal-card planner-export-modal__card planner-export-modal__card--wide">
        <header class="modal-card-head planner-export-modal__head p-4">
          <span class="icon planner-export-modal__icon">
            <i class="fa-solid fa-file-import"></i>
          </span>
          <div class="planner-export-modal__title">
            <p id="plannerImportBuildModalTitle" class="modal-card-title mb-0">Import build</p>
            <p class="is-size-7 has-text-grey-light mb-0">
              Paste JSON or load a build file, then import.
            </p>
          </div>
          <button type="button" class="delete" aria-label="Close" @click="closeImportModal"></button>
        </header>

        <section class="modal-card-body planner-export-modal__body p-4">
          <div class="field">
            <label class="label" for="plannerImportJsonTextarea">Build JSON</label>
            <div class="control">
              <textarea
                id="plannerImportJsonTextarea"
                ref="importTextarea"
                v-model="importJsonText"
                class="textarea planner-import-json-textarea"
                rows="2"
                placeholder="{ &quot;name&quot;: &quot;...&quot;, &quot;class&quot;: &quot;...&quot;, ... }"
                spellcheck="false"
                @input="onImportJsonInput"
              ></textarea>
            </div>
            <p class="help">Import uses this text. Loading a file replaces any pasted JSON.</p>
          </div>

          <div class="field">
            <label class="label" for="plannerImportPastebinUrl">Or load from Pastebin</label>
            <div class="field has-addons">
              <div class="control is-expanded">
                <input
                  id="plannerImportPastebinUrl"
                  v-model="importPastebinUrl"
                  class="input"
                  type="url"
                  placeholder="https://pastebin.com/kK11qxv0"
                  :disabled="importBusy"
                  @keyup.enter="loadImportPastebin"
                />
              </div>
              <div class="control">
                <button
                  type="button"
                  class="button is-info is-outlined"
                  :disabled="importBusy || !importPastebinUrl.trim()"
                  @click="loadImportPastebin"
                >
                  Load link
                </button>
              </div>
            </div>
            <p class="help">The paste must contain the build JSON. Only pastebin.com links are accepted.</p>
          </div>

          <div class="field mb-0">
            <label class="label">Or load a JSON file</label>
            <div
              class="planner-import-dropzone"
              :class="{ 'is-dragover': importDragOver }"
              @dragover="onImportDragOver"
              @dragleave="onImportDragLeave"
              @drop="onImportDrop"
            >
              <p class="mb-2">
                Drop a <code>.json</code> file here, or choose one from disk.
              </p>
              <button
                type="button"
                class="button is-info is-outlined is-small"
                :disabled="importBusy"
                @click="openImportFilePicker"
              >
                <span class="icon is-small"><i class="fa-solid fa-folder-open"></i></span>
                <span>Choose file</span>
              </button>
              <p v-if="importFileName" class="help mt-2 mb-0">Loaded: {{ importFileName }}</p>
            </div>
            <input
              ref="importFileInput"
              type="file"
              accept=".json,application/json"
              class="is-hidden"
              @change="onImportFileSelected"
            />
          </div>
        </section>

        <footer class="modal-card-foot planner-export-modal__foot p-4">
          <button
            type="button"
            class="button is-primary is-inverted is-outlined"
            :disabled="importBusy"
            @click="confirmImport"
          >
            <span class="icon"><i class="fa-solid fa-file-import"></i></span>
            <span>Import</span>
          </button>
          <button type="button" class="button" :disabled="importBusy" @click="closeImportModal">
            Cancel
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.planner-import-json-textarea {
  min-height: 0;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 0.82rem;
  resize: vertical;
}

.planner-import-dropzone {
  border: 1px dashed hsl(0, 0%, 32%);
  border-radius: 0.5rem;
  padding: 1rem;
  background: hsl(0, 0%, 9%);
  text-align: center;
}

.planner-import-dropzone.is-dragover {
  border-color: hsl(204, 86%, 53%);
  background: hsl(204, 30%, 14%);
}
</style>
