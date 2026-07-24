/**
 * Load active tree_data fixtures for data tests (Node / Vitest).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_ROOT, getActiveTreeDataDir } from './mock-fetch-tree-data.js';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((x) => (x == null ? '' : String(x))).join('\n');
  return String(value);
}

export function loadActiveTreeData() {
  const dataDir = getActiveTreeDataDir();
  const skills = readJson(join(dataDir, 'skills.json'));
  let subskills = [];
  const subPath = join(dataDir, 'subskills.json');
  if (existsSync(subPath)) {
    subskills = readJson(subPath);
  }
  const treeStructPath = join(dataDir, 'tree_struct.json');
  const treeStruct = existsSync(treeStructPath) ? readJson(treeStructPath) : null;
  const characterStatsPath = join(dataDir, 'character_stats.json');
  const characterStats = existsSync(characterStatsPath) ? readJson(characterStatsPath) : [];
  const gameMeta = readJson(join(dataDir, 'game_meta.json'));
  const stats = readJson(join(PUBLIC_ROOT, 'tree_data', 'stats.json'));
  const statsMap = new Map();
  for (const row of stats) {
    if (row?.key) statsMap.set(String(row.key).toLowerCase(), row);
  }

  const mergedSkills = [...skills, ...subskills].map((row) => ({
    numeric_id: row.numericId,
    name: String(row.id),
    display_name: row.displayName || String(row.id),
    description: asText(row.description),
    skill_effect: asText(row.skillEffect ?? row.skill_effect),
    restriction: asText(row.restriction),
    class_name: row.class,
    scalingConstants: [...(row.scalingConstants || [])],
  }));

  return {
    dataDir,
    skills,
    subskills,
    treeStruct,
    characterStats,
    gameMeta,
    stats,
    statsMap,
    mergedSkills,
  };
}

export function catalogLookups(skills, subskills) {
  const rows = [...skills, ...subskills];
  const internalIds = new Set(rows.map((r) => String(r.id)));
  const numericIds = new Set(
    rows.map((r) => r.numericId).filter((n) => n != null)
  );
  return { internalIds, numericIds };
}

export function refExists(ref, internalIds, numericIds) {
  if (String(ref).startsWith('id:')) {
    const n = Number.parseInt(String(ref).slice(3), 10);
    return Number.isFinite(n) && numericIds.has(n);
  }
  return internalIds.has(ref);
}
