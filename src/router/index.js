import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PlannerView from '../views/PlannerView.vue';

const routes = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/planner',
    name: 'planner',
    component: PlannerView,
    meta: { keepAlive: true },
  },
];

if (import.meta.env.DEV) {
  routes.push({
    path: '/editor',
    name: 'editor',
    component: () => import('../views/EditorView.vue'),
    meta: { keepAlive: true },
  });
} else {
  routes.push({ path: '/editor', redirect: '/' });
}

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
