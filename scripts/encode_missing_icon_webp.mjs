/**
 * One-off / CI: encode public/icons/icons-shared_missing.webp from the PNG.
 * Run: node scripts/encode_missing_icon_webp.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'public', 'icons', 'icons-shared_missing.png');
const webpPath = path.join(root, 'public', 'icons', 'icons-shared_missing.webp');

await sharp(pngPath).webp({ quality: 90 }).toFile(webpPath);
console.log('Wrote', webpPath);
