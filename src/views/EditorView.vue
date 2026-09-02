<script>
export default {
  name: 'EditorView',
};
</script>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onActivated, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { mountEditor, unmountEditor, bindEditorFile } from '@/editor/editor-store.js';
import '@/editor/editor-page.css';
import '@/styles/dropdown-style.css';
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
let mounted = false;

function syncTable(skills, folder) {
  editorSkills.value = skills;
  editorFolder.value = folder ?? '';
}

async function bindCurrentFile() {
  await bindEditorFile({
    fileBasename: fileBasename.value,
    syncEditorTableView: syncTable,
  });
}

onMounted(async () => {
  await nextTick();
  await mountEditor({
    fileBasename: fileBasename.value,
    syncEditorTableView: syncTable,
  });
  mounted = true;
});

onActivated(async () => {
  if (!mounted) return;
  await bindCurrentFile();
});

watch(fileBasename, async (next, prev) => {
  if (!mounted || next === prev) return;
  await bindCurrentFile();
});

onUnmounted(() => {
  mounted = false;
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
