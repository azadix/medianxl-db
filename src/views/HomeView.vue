<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mountSkillsIndex, unmountSkillsIndex, syncSkillsIndexFromRoute } from '../skills/skillsIndex.js';
import SkillsBrowseTable from '../components/skills/SkillsBrowseTable.vue';

const skillsList = ref([]);
const skillIconFolder = ref(null);
const loadError = ref('');
const detailContentEl = ref(null);
const pageTitleEl = ref(null);

const route = useRoute();
const router = useRouter();

const hasSkillQuery = computed(() => {
  const raw = route.query.skill;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return Boolean(s);
});

function getDetailEl() {
  return detailContentEl.value;
}

onMounted(async () => {
  await nextTick();
  mountSkillsIndex({
    router,
    pageTitleEl: pageTitleEl.value,
    getDetailEl,
    setSkillsCatalog: (list, folder) => {
      skillsList.value = /** @type {unknown[]} */ (list);
      skillIconFolder.value = folder;
    },
    setLoadError: (msg) => {
      loadError.value = msg || '';
    },
    clearLoadError: () => {
      loadError.value = '';
    },
  });
});

onUnmounted(() => {
  unmountSkillsIndex();
});

watch(
  () => route.query,
  async () => {
    if (route.name === 'home') {
      await syncSkillsIndexFromRoute(router);
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="container mt-4 home-skills-page">
    <h2
      v-show="!hasSkillQuery"
      class="title mt-3 mb-2"
      ref="pageTitleEl"
      id="page-title"
    >
      All Skills
    </h2>
    <div v-if="loadError" class="notification is-danger content">
      {{ loadError }}
    </div>
    <template v-else>
      <SkillsBrowseTable
        v-show="!hasSkillQuery && skillsList.length > 0"
        :skills="skillsList"
        :icon-folder="skillIconFolder"
      />
      <p v-if="!hasSkillQuery && skillsList.length === 0" class="has-text-grey is-italic mt-2">
        Loading skills...
      </p>
      <div
        ref="detailContentEl"
        v-show="hasSkillQuery"
        id="home-skill-detail"
        class="home-skill-detail-host"
      />
    </template>
  </div>
</template>

<style scoped>
.skill-image-container {
  position: sticky;
  display: flex;
  justify-content: center;
  margin: 1rem 0;
}

:deep(.skill-image) {
  scale: 3;
  object-fit: contain;
  transform-origin: center center;
}

.filter-toggle {
  transition: all 0.3s ease;
  min-width: 15rem;
}

:deep(.home-skill-meta) {
  padding-top: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

:deep(.home-skill-meta-section .content) {
  margin-top: 0.35rem;
}

:deep(.home-skill-meta-value) {
  font-size: 1.05rem;
  line-height: 1.55;
}

:deep(.home-skill-meta-calc) {
  margin-top: 0.25rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1.45;
  overflow-x: auto;
}

@media screen and (max-width: 768px) {
  :deep(.skill-detail .columns) {
    display: flex;
    flex-direction: column;
  }

  :deep(.order-1-mobile) {
    order: 1;
  }

  :deep(.order-2-mobile) {
    order: 2;
  }

  :deep(.skill-image-container) {
    position: static;
    margin: 1rem auto;
    text-align: center;
  }
}
</style>
