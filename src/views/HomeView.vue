<script>
export default {
  name: 'HomeView',
};
</script>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mountSkillsIndex, unmountSkillsIndex, syncSkillsIndexFromRoute } from '@/skills/skills-index.js';
import SkillsBrowseTable from '@/components/skills/SkillsBrowseTable.vue';
import '@/styles/tree-styles.css';
import '@/styles/character-sheet-sidebar.css';

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

onActivated(async () => {
  if (route.name === 'skills') {
    await syncSkillsIndexFromRoute(router);
  }
});

onUnmounted(() => {
  unmountSkillsIndex();
});

watch(
  () => route.query,
  async () => {
    if (route.name === 'skills') {
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
.filter-toggle {
  transition: all 0.3s ease;
  min-width: 15rem;
}

:deep(.skill-detail-page) {
  padding-bottom: 2rem;
}

:deep(.skill-detail-toolbar) {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 0.75rem;
}

:deep(.skill-detail-shell) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  gap: 1rem;
  align-items: start;
}

:deep(.skill-detail-main),
:deep(.skill-info) {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

:deep(.skill-detail-hero) {
  background: linear-gradient(135deg, hsl(0, 0%, 14%), hsl(0, 0%, 9%));
}

:deep(.skill-detail-page-name) {
  margin-bottom: 0.75rem;
  color: #fff;
}

:deep(.skill-detail-formula-hint) {
  margin-bottom: 0;
  color: #9a9aa8;
  font-size: 0.82rem;
}

:deep(.skill-detail-section-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

:deep(.skill-effect-level-row) {
  flex-wrap: wrap;
  gap: 0.35rem 0;
}

:deep(.skill-effect-level-row .label),
:deep(.skill-effect-level-row .input) {
  color: #f1f1f1;
}

:deep(.skill-detail-copy),
:deep(.skill-effect-body) {
  color: #e8e8e8;
  line-height: 1.55;
}

:deep(.skill-detail-infobox) {
  position: sticky;
  top: calc(var(--planner-header-h, 3rem) + 0.75rem);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

:deep(.skill-detail-image-card) {
  text-align: center;
}

:deep(.skill-image-container) {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 0.6rem;
  border: 1px solid hsl(0, 0%, 24%);
  border-radius: 0.5rem;
  background: radial-gradient(circle at 50% 25%, hsl(0, 0%, 20%), hsl(0, 0%, 7%));
  overflow: hidden;
}

:deep(.skill-image-container img.skill-image) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

:deep(.skill-image-container div.skill-image) {
  flex: 0 0 auto;
  transform: scale(5);
  transform-origin: center;
  image-rendering: pixelated;
}

:deep(.skill-detail-info-card) {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

:deep(.skill-detail-info-row) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-top: 1px solid hsl(0, 0%, 20%);
}

:deep(.skill-detail-info-row span) {
  color: #9a9aa8;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:deep(.skill-detail-info-row strong) {
  color: #f1f1f1;
  text-align: right;
}

@media screen and (max-width: 768px) {
  :deep(.skill-detail-shell) {
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
  }

  :deep(.skill-detail-infobox) {
    position: static;
    width: 100%;
  }

  :deep(.skill-detail-section-head) {
    align-items: flex-start;
    flex-direction: column;
  }

  :deep(.skill-effect-level-row) {
    width: 100%;
  }
}
</style>
