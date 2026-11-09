#!/usr/bin/env node
/**
 * Promote a local TSW build dump into the committed fixture folder.
 *
 *   npm run fixture:add -- "Miss_Peeled_04_11_2026_10_45.json"
 *   npm run fixture:add -- --remove "Miss_Peeled_04_11_2026_10_45.json"
 *
 * Local dumps live in tests/fixtures/tsw-builds (git-ignored); the committed subset
 * lives in tests/fixtures/tsw-builds-committed so CI can run the fixture-backed tests.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const LOCAL_DIR = resolve(ROOT, 'tests/fixtures/tsw-builds');
const COMMITTED_DIR = resolve(ROOT, 'tests/fixtures/tsw-builds-committed');

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const names = args.filter((arg) => arg !== '--remove');

if (names.length === 0) {
  console.error(
    'Usage: npm run fixture:add -- [--remove] "<build>.json" [more.json ...]'
  );
  process.exit(1);
}

mkdirSync(COMMITTED_DIR, { recursive: true });
let failed = 0;
for (const raw of names) {
  const name = raw.replace(/^.*[\\/]/, '').trim();
  if (!name.toLowerCase().endsWith('.json')) {
    console.error(`✗ ${raw}: expected a .json build dump`);
    failed += 1;
    continue;
  }
  const target = resolve(COMMITTED_DIR, name);

  if (remove) {
    if (!existsSync(target)) {
      console.error(`✗ ${name}: not in the committed folder`);
      failed += 1;
      continue;
    }
    rmSync(target);
    console.log(`removed ${name}`);
    continue;
  }

  const source = resolve(LOCAL_DIR, name);
  if (!existsSync(source)) {
    console.error(`✗ ${name}: not found in ${LOCAL_DIR}`);
    failed += 1;
    continue;
  }
  try {
    JSON.parse(readFileSync(source, 'utf8'));
  } catch (error) {
    console.error(`✗ ${name}: invalid JSON (${error.message})`);
    failed += 1;
    continue;
  }
  copyFileSync(source, target);
  const kb = Math.round(statSync(target).size / 1024);
  console.log(`added ${name} (${kb} KB)`);
}

if (failed > 0) process.exit(1);
console.log(`\nNext: git add ${COMMITTED_DIR.replace(/\\/g, '/')}`);
