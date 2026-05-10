import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const baseRaw = import.meta.env.BASE_URL || '/';
  const scope = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  const swUrl = `${scope}sw.js`;
  navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
}
