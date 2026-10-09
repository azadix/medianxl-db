import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCatalogFromUniqueStats } from '../../src/items/unique-stats-catalog.js';

const dir = resolve('public/items/2_14');
const bases = [
  ...JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8')),
  ...JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8')),
];
const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
console.log('entries', db.entries.length);
const { items, sets } = buildCatalogFromUniqueStats(db, bases);
console.log('overlays', items.length, 'sets', sets.length);
const missing = items.filter((d) => !d?.id);
console.log('missing id', missing.length);
const seen = new Map();
const dups = [];
for (const d of items) {
  if (seen.has(d.id)) dups.push(d.id);
  seen.set(d.id, true);
}
console.log('dup ids', dups.slice(0, 20), 'count', dups.length);
const mal = items.find((d) => d.name === 'Maleficence');
console.log('maleficence', mal && { id: mal.id, slot: mal.slot, baseName: mal.baseName });
