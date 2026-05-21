<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppNavBar from './components/AppNavBar.vue';
import { DEV_KEEP_ALIVE_NAMES } from './shared/dev-routes.js';

const route = useRoute();
const cachedNames = import.meta.env.DEV
  ? ['PlannerView', 'PatchNotesView', ...DEV_KEEP_ALIVE_NAMES]
  : ['PlannerView', 'PatchNotesView'];
const useKeepAlive = computed(() => Boolean(route.meta?.keepAlive));
</script>

<template>
  <AppNavBar />
  <router-view v-slot="{ Component }">
    <keep-alive v-if="useKeepAlive" :include="cachedNames">
      <component :is="Component" :key="route.name" />
    </keep-alive>
    <component v-else-if="Component" :is="Component" :key="route.name" />
  </router-view>
</template>
