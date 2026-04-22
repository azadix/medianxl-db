<script>
export default {
  name: 'EditorView',
};
</script>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { mountEditor, unmountEditor } from '../../editor.js';
import '../../editor-page.css';
import '../../tree/dropdown-style.css';
import EditorListSection from '../components/editor/EditorListSection.vue';
import EditorEditSection from '../components/editor/EditorEditSection.vue';

const editorSkills = ref([]);
const editorFolder = ref('');

onMounted(async () => {
  await nextTick();
  await mountEditor({
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
    <EditorListSection :skills="editorSkills" :folder-seg="editorFolder" />
    <EditorEditSection />
  </div>
</template>
