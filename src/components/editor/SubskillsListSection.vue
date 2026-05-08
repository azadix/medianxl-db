<script setup>
import EditorSubskillsTable from './EditorSubskillsTable.vue';
import { editorOpenSkillAtIndex } from '../../editor/editor.js';

defineProps({
  skills: { type: Array, default: () => [] },
  folderSeg: { type: String, default: '' },
});
</script>

<template>
  <div id="list-view">
    <h1 class="title is-4 mt-4">Subskills editor</h1>
    <p class="subtitle is-6">
      Edit <code>subskills.json</code> fields (one row per subskill). For now, this uses the same
      edit form as regular skills (full parity).
    </p>

    <div class="field is-grouped is-grouped-multiline mb-4">
      <div class="control">
        <button type="button" class="button is-info" id="btn-reload">Reload from server</button>
      </div>
      <div class="control">
        <button type="button" class="button is-success" id="btn-add-skill">
          Add new skill
        </button>
      </div>
      <div class="control">
        <button type="button" class="button is-primary" id="btn-download" disabled>
          Download subskills.json
        </button>
      </div>
      <div class="control">
        <span id="dirty-badge" class="tag is-warning is-hidden">Unsaved changes (in memory only)</span>
      </div>
    </div>

    <div id="load-error" class="notification is-danger is-hidden"></div>

    <div class="box p-2">
      <EditorSubskillsTable :skills="skills" :folder-seg="folderSeg" @edit-index="editorOpenSkillAtIndex" />
    </div>
  </div>
</template>

