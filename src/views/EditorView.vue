<script>
export default {
  name: 'EditorView',
};
</script>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { mountEditor, unmountEditor } from '@/editor/editor-store.js';
import '@/editor/editor-page.css';
import '@/tree/dropdown-style.css';
import EditorListSection from '@/components/editor/EditorListSection.vue';
import EditorEditSection from '@/components/editor/EditorEditSection.vue';

const route = useRoute();

const editorMode = computed(() =>
  route.meta.editorMode === 'subskills' ? 'subskills' : 'skills'
);
const fileBasename = computed(() =>
  typeof route.meta.editorFile === 'string' ? route.meta.editorFile : 'skills.json'
);

const editorSkills = ref([]);
const editorFolder = ref('');

onMounted(async () => {
  await nextTick();
  await mountEditor({
    fileBasename: fileBasename.value,
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
    <EditorListSection :mode="editorMode" :skills="editorSkills" :folder-seg="editorFolder" />
    <EditorEditSection :mode="editorMode" />
  </div>
</template>
