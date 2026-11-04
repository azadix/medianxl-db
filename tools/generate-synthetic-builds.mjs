#!/usr/bin/env node
/**
 * Generate synthetic TSW build dumps for planner stress-testing.
 *
 * Item rows are harvested from real TSW exports in `tests/fixtures/tsw-builds`
 * (game-exact description lines / requirements) and recombined, so every
 * generated build stays structurally valid for the importer + audit.
 * Class, character level, skill point spread, oSkills and all-skills bonus are
 * randomised per build.
 *
 * Usage:
 *   node tools/generate-synthetic-builds.mjs [count] [outDir]
 *
 * Deterministic: a fixed seed reproduces the same corpus.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = resolve(ROOT, 'tests/fixtures/tsw-builds');
const SKILLS_PATH = resolve(ROOT, 'public/tree_data/2_14/skills.json');
const COUNT = Number(process.argv[2] || 300);
const OUT_DIR = resolve(ROOT, process.argv[3] || 'tests/fixtures/synthetic');
const SEED = 0x5eed1234;

/* ------------------------------ PRNG (mulberry32) ------------------------------ */
let _s = SEED >>> 0;
function rand() {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------ helpers ------------------------------ */
function lineText(line) {
  if (!Array.isArray(line)) return String(line ?? '');
  return line.map((seg) => (Array.isArray(seg) ? seg[0] : seg)).join('');
}

function reqLevelOf(row) {
  for (const line of row?.description_lines || []) {
    const m = /^Required Level:\s*(\d+)\s*$/i.exec(lineText(line).trim());
    if (m) return Number(m[1]);
  }
  return 0;
}

/** Highest "Required Strength:" / "Required Dexterity:" across the row's lines. */
function reqStatOf(row, statName) {
  const re = new RegExp(`^Required ${statName}:\\s*(\\d+)\\s*$`, 'i');
  let need = 0;
  for (const line of row?.description_lines || []) {
    const m = re.exec(lineText(line).trim());
    if (m) need = Math.max(need, Number(m[1]));
  }
  return need;
}

/* ------------------------------ load sources ------------------------------ */
const skillRows = JSON.parse(readFileSync(SKILLS_PATH, 'utf8'));
const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const skillsByClass = new Map(CLASSES.map((c) => [c, []]));
for (const s of skillRows) {
  const cls = String(s.class || '');
  if (!skillsByClass.has(cls)) continue;
  if (!s.displayName) continue;
  const cap = Number(s.baseMaxLevel);
  if (!Number.isFinite(cap) || cap <= 0) continue;
  skillsByClass.get(cls).push({ name: String(s.displayName), cap: Math.min(cap, 60) });
}

const files = readdirSync(BUILD_DIR).filter((n) => n.toLowerCase().endsWith('.json'));
/** @type {{class: string, gear: Map<string, object[]>, inv: object[]}[]} */
const donors = [];
for (const file of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(resolve(BUILD_DIR, file), 'utf8'));
  } catch {
    continue;
  }
  const cls = data?.build?.class;
  if (!CLASSES.includes(cls)) continue;
  const gear = new Map();
  const inv = [];
  for (const row of data.items || []) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.location) === 'Gear' && row.slot) {
      if (!gear.has(row.slot)) gear.set(row.slot, []);
      gear.get(row.slot).push(row);
    } else if (String(row.location) === 'Inventory') {
      inv.push(row);
    }
  }
  donors.push({ class: cls, gear, inv });
}
if (donors.length === 0) {
  console.error('No usable donor builds found in', BUILD_DIR);
  process.exit(1);
}

const GEAR_SLOTS = [
  'Head', 'Neck', 'Torso', 'Waist', 'Hands', 'Feet',
  'RightFinger', 'LeftFinger',
];
// Weapons are taken as one coherent block from a single donor: quivers require a
// matching bow/crossbow in the other hand, so slots must not be sampled independently.
const WEAPON_SLOTS = ['RightHandMain', 'RightHandAlternate', 'LeftHandMain', 'LeftHandAlternate'];
const RELIC_CAP = 3;

function isRelicRow(row) {
  const item = String(row?.item ?? '');
  const display = String(row?.display_name ?? '');
  return /relic/i.test(item) || /relic/i.test(display);
}

const STATS_KEYS = [
  'life', 'mana', 'strength', 'dexterity', 'vitality', 'energy',
  'fire_resistance', 'cold_resistance', 'lightning_resistance', 'poison_resistance',
  'physical_resistance', 'magic_resistance', 'maximum_life', 'movement_speed',
  'hit_recovery', 'block_speed', 'fire_spell_damage', 'lightning_spell_damage',
  'cold_spell_damage', 'enemy_fire_resistance', 'enemy_lightning_resistance',
  'enemy_cold_resistance',
];

/* ------------------------------ generation ------------------------------ */
mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
for (let n = 1; n <= COUNT; n++) {
  const cls = pick(CLASSES);
  const classSkills = skillsByClass.get(cls) || [];
  const classDonors = donors.filter((d) => d.class === cls);
  const pool = classDonors.length ? classDonors : donors;

  // --- gear: one donor per slot family, keeps class restrictions coherent ---
  const gearRows = [];
  for (const slot of GEAR_SLOTS) {
    const candidates = pool.filter((d) => d.gear.has(slot) && (d.gear.get(slot) || []).length);
    if (!candidates.length) continue;
    if (rand() < 0.12) continue; // deliberately leave some slots empty
    const donor = pick(candidates);
    gearRows.push(structuredClone(pick(donor.gear.get(slot))));
  }

  // --- weapons: whole hand block from one donor (keeps quiver/bow pairing valid) ---
  const weaponDonors = pool.filter((d) => WEAPON_SLOTS.some((s) => (d.gear.get(s) || []).length));
  if (weaponDonors.length) {
    const donor = pick(weaponDonors);
    for (const slot of WEAPON_SLOTS) {
      const rows = donor.gear.get(slot) || [];
      if (!rows.length) continue;
      gearRows.push(structuredClone(pick(rows)));
    }
  }

  // --- inventory: charms + relics sampled from donors of this class ---
  const invCandidates = pool.flatMap((d) => d.inv);
  const shuffledInv = shuffle(invCandidates);
  const invTarget = randInt(5, 40);
  const invRows = [];
  let relicCount = 0;
  const relicSeen = new Set();
  for (const row of shuffledInv) {
    if (invRows.length >= invTarget) break;
    // The planner equips at most MAX_RELICS *distinct* relics; a repeated relic is
    // skipped as "relic-cap", so dedupe by display name before counting.
    if (isRelicRow(row)) {
      const key = String(row?.display_name || row?.item || '').trim();
      if (relicSeen.has(key)) continue;
      if (relicCount >= RELIC_CAP) continue;
      relicSeen.add(key);
      relicCount += 1;
    }
    invRows.push(structuredClone(row));
  }

  const allRows = [...gearRows, ...invRows];
  const maxReq = allRows.reduce((m, r) => Math.max(m, reqLevelOf(r)), 0);
  const level = Math.min(150, Math.max(randInt(20, 150), maxReq, 1));
  // Attribute requirements must be satisfiable, otherwise the item is flagged "unmet".
  const needStr = allRows.reduce((m, r) => Math.max(m, reqStatOf(r, 'Strength')), 0);
  const needDex = allRows.reduce((m, r) => Math.max(m, reqStatOf(r, 'Dexterity')), 0);

  // --- skills: spend a plausible budget across this class's skills ---
  const budget = Math.max(1, Math.min(level + 12, 150));
  /** @type {Record<string, number>} */
  const skillPoints = {};
  let left = budget;
  for (const sk of shuffle(classSkills)) {
    if (left <= 0) break;
    if (rand() < 0.35) continue;
    const pts = Math.min(sk.cap, left, randInt(1, sk.cap));
    if (pts <= 0) continue;
    skillPoints[sk.name] = pts;
    left -= pts;
  }

  // --- oSkills: occasionally borrow a couple from another class ---
  /** @type {Record<string, number>} */
  const oSkills = {};
  if (rand() < 0.4) {
    const other = shuffle(CLASSES.filter((c) => c !== cls));
    for (const oc of other.slice(0, randInt(1, 2))) {
      const list = skillsByClass.get(oc) || [];
      if (!list.length) continue;
      const sk = pick(list);
      oSkills[sk.name] = randInt(1, Math.min(sk.cap, 10));
    }
  }

  /** @type {Record<string, number>} */
  const stats = {};
  for (const k of STATS_KEYS) stats[k] = 0;
  stats.life = randInt(1000, 20000);
  stats.mana = randInt(500, 6000);
  stats.strength = Math.max(randInt(10, 800), needStr);
  stats.dexterity = Math.max(randInt(10, 800), needDex);
  stats.vitality = randInt(10, 1000);
  stats.energy = randInt(10, 800);

  const stamp = new Date(Date.UTC(2026, 0, 1) + n * 3600_000).toISOString();
  const envelope = {
    ok: true,
    api_version: 1,
    meta: { realm: 'TSW', cached: true, generated_at: stamp, marker_warmed_at: null },
    build: {
      name: `synthetic_${String(n).padStart(3, '0')}`,
      version: '2.14',
      class: cls,
      level,
      skillPoints,
      oSkills,
      allSkillsBonus: randInt(0, 40),
      stats: STATS_KEYS.map((k) => `{{${k}}}=${stats[k]}`).join('\n'),
      questsCompleted: {
        den_of_evil: { normal: true, nightmare: true, hell: true },
        radament: { normal: true, nightmare: true, hell: true },
        izual: { normal: true, nightmare: true, hell: true },
        "lam_essen's_tome": { normal: true, nightmare: true, hell: true },
        golden_bird: { normal: true, nightmare: true, hell: true },
      },
      savedAt: stamp,
    },
    items: allRows,
  };

  const outName = `synthetic_${String(n).padStart(3, '0')}.json`;
  writeFileSync(resolve(OUT_DIR, outName), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  written += 1;
}

console.log(`wrote ${written} synthetic builds -> ${OUT_DIR}`);
