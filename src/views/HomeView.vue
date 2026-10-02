<script>
export default {
  name: 'HomeView',
};
</script>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  mountSkillsIndex,
  unmountSkillsIndex,
  syncSkillsIndexFromRoute,
  mergeHomeQuery,
  readHomeViewFromRoute,
  SKILLS_ROUTE_NAME,
} from '@/skills/skills-index.js';
import SkillsBrowseTable from '@/components/skills/SkillsBrowseTable.vue';
import SkillsProcsTable from '@/components/skills/SkillsProcsTable.vue';
import SkillsPageTooltipHost from '@/components/skills/SkillsPageTooltipHost.vue';
import { useSkillsPageTooltips } from '@/composables/useSkillsPageTooltips.js';
import { hideSkillsPageTooltips } from '@/skills/skills-page-tooltip-runtime.js';
import { useItemsStore } from '@/stores/items.js';
import { getItemProcRows } from '@/items/item-procs.js';
import '@/styles/tree-styles.css';
import '@/styles/character-sheet-sidebar.css';

const skillsList = ref([]);
const skillIconFolder = ref(null);
const loadError = ref('');
const detailContentEl = ref(null);
const pageTitleEl = ref(null);
const pageRootEl = ref(null);

const route = useRoute();
const router = useRouter();
const itemsStore = useItemsStore();

const hasSkillQuery = computed(() => {
  const raw = route.query.skill;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return Boolean(s);
});

const isProcsView = computed(() => readHomeViewFromRoute(router) === 'procs');

const procRows = computed(() => {
  void itemsStore.catalog;
  void itemsStore.sets;
  void skillsList.value;
  if (!itemsStore.catalogLoaded || !skillsList.value.length) return [];
  return getItemProcRows(itemsStore);
});

useSkillsPageTooltips({ rootEl: pageRootEl });

function getDetailEl() {
  return detailContentEl.value;
}

function setBrowseView(view) {
  mergeHomeQuery(router, { view: view === 'procs' ? 'procs' : '' });
}

onMounted(async () => {
  await nextTick();
  void itemsStore.loadCatalog();
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
  if (route.name === SKILLS_ROUTE_NAME) {
    await syncSkillsIndexFromRoute(router);
  }
});

onUnmounted(() => {
  unmountSkillsIndex();
});

watch(
  () => route.query,
  async () => {
    hideSkillsPageTooltips();
    if (route.name === SKILLS_ROUTE_NAME) {
      await syncSkillsIndexFromRoute(router);
    }
  },
  { deep: true }
);
</script>

<template>
  <div ref="pageRootEl" class="container mt-4 home-skills-page">
    <span ref="pageTitleEl" id="page-title" class="is-sr-only" aria-hidden="true"></span>
    <div
      v-show="!hasSkillQuery"
      class="tabs is-toggle mt-3 mb-3 home-skills-view-tabs"
      role="navigation"
      aria-label="Skills views"
    >
      <ul>
        <li :class="{ 'is-active': !isProcsView }">
          <a href="#" @click.prevent="setBrowseView('skills')">Skills</a>
        </li>
        <li :class="{ 'is-active': isProcsView }">
          <a href="#" @click.prevent="setBrowseView('procs')">Procs</a>
        </li>
      </ul>
    </div>
    <div v-if="loadError" class="notification is-danger content">
      {{ loadError }}
    </div>
    <template v-else>
      <SkillsBrowseTable
        v-show="!hasSkillQuery && !isProcsView && skillsList.length > 0"
        :skills="skillsList"
        :icon-folder="skillIconFolder"
      />
      <SkillsProcsTable
        v-show="!hasSkillQuery && isProcsView && itemsStore.catalogLoaded"
        :rows="procRows"
        :icon-folder="skillIconFolder"
      />
      <p
        v-if="!hasSkillQuery && !isProcsView && skillsList.length === 0"
        class="has-text-grey is-italic mt-2"
      >
        Loading skills...
      </p>
      <p
        v-else-if="!hasSkillQuery && isProcsView && !itemsStore.catalogLoaded"
        class="has-text-grey is-italic mt-2"
      >
        Loading procs...
      </p>
      <div
        ref="detailContentEl"
        v-show="hasSkillQuery"
        id="home-skill-detail"
        class="home-skill-detail-host"
      />
    </template>
    <SkillsPageTooltipHost />
  </div>
</template>

<style scoped>
.filter-toggle {
  transition: all 0.3s ease;
  min-width: 15rem;
}

.home-skills-view-tabs {
  margin-bottom: 0.75rem;
}

.home-skills-view-tabs :deep(a) {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.125;
  padding-left: 1.1em;
  padding-right: 1.1em;
}

.is-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

:deep(.skill-proc-sources-table) {
  font-size: 0.95rem;
}

:deep(.skill-proc-sources-table td) {
  vertical-align: top;
}

:deep(.skill-proc-sources-table .js-proc-source) {
  display: block;
  cursor: pointer;
  font-weight: 600;
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
