import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const index = join(dist, 'index.html');
const notFound = join(dist, '404.html');

if (!existsSync(index)) {
  console.error('copy-spa-404: dist/index.html missing; run vite build first');
  process.exit(1);
}
copyFileSync(index, notFound);
console.log('copy-spa-404: wrote dist/404.html for GitHub Pages SPA');
