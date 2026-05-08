<script>
export default {
  name: 'SubskillsEditorView',
};
</script>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { mountEditor, unmountEditor } from '../editor/editor.js';
import '../editor/editor-page.css';
import '../../tree/dropdown-style.css';
import SubskillsListSection from '../components/editor/SubskillsListSection.vue';
import SubskillsEditSection from '../components/editor/SubskillsEditSection.vue';

const editorSkills = ref([]);
const editorFolder = ref('');

onMounted(async () => {
  await nextTick();
  await mountEditor({
    fileBasename: 'subskills.json',
    syncEditorTableView(skills, folder) {
      editorSkills.value = skills;
      editorFolder.value = folder ?? '';
    },
  });
});

onUnmounted(() => {
  unmountEditor();
});
</script>

<template>
  <div class="container editor-page">
    <div id="editor-toast" class="notification is-hidden is-fixed editor-toast" role="status"></div>
    <SubskillsListSection :skills="editorSkills" :folder-seg="editorFolder" />
    <SubskillsEditSection />
  </div>
</template>

