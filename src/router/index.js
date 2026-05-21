import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import PlannerView from '@/views/PlannerView.vue';
import PatchNotesView from '@/views/PatchNotesView.vue';
import { DEV_ROUTE_DEFS } from '@/shared/dev-routes.js';

const routes = [
  { path: '/', redirect: '/skills' },
  {
    path: '/skills',
    name: 'skills',
    component: HomeView,
    meta: { keepAlive: true },
  },
  {
    path: '/planner',
    name: 'planner',
    component: PlannerView,
    meta: { keepAlive: true },
  },
  {
    path: '/patch-notes',
    name: 'patchNotes',
    component: PatchNotesView,
    meta: { keepAlive: true },
  },
];

if (import.meta.env.DEV) {
  for (const def of DEV_ROUTE_DEFS) {
    routes.push({
      path: def.path,
      name: def.name,
      component: def.component,
      meta: {
        keepAlive: true,
        ...(def.editorMode ? { editorMode: def.editorMode } : {}),
        ...(def.editorFile ? { editorFile: def.editorFile } : {}),
      },
    });
  }
} else {
  for (const def of DEV_ROUTE_DEFS) {
    routes.push({ path: def.path, redirect: '/' });
  }
}

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
