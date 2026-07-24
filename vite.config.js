import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** Inject build-unique cache name into copied `public/sw.js` in dist. */
function patchServiceWorkerCacheVersion() {
  return {
    name: 'patch-sw-cache-version',
    closeBundle() {
      const distSw = fileURLToPath(new URL('dist/sw.js', import.meta.url));
      if (!existsSync(distSw)) return;
      const bust = String(Date.now());
      const body = readFileSync(distSw, 'utf8').replaceAll('__CACHE_VERSION__', bust);
      writeFileSync(distSw, body, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [vue(), patchServiceWorkerCacheVersion()],
  base: '/medianxl-db/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
});
