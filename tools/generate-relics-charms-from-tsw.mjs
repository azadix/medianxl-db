/**
 * Refreshes charms.json from the TSW item API
 * (https://tsw.vn.cz/stats/api_item.php).
 *
 * Charms: update modifiers/reqLevel/classRestriction for entries already in
 * charms.json (preserves id, icon, trophy, upgrades). Does not auto-add
 * Heroic / Pearl-of-Wisdom junk. Dimensional Key is stored in TSW under the
 * unique base names Arcana / Mandate / Onslaught / Primordia (and Nephalem
 * forms); the generator expands the legacy single entry into those four.
 * Catalog omits inventory fields (type/category/slot/inv size/reqStr/reqDex);
 * the store fills defaults.
 *
 * Run locally only — API requires an IP seen in-game within 24h.
 *
 * Usage:
 *   node tools/generate-relics-charms-from-tsw.mjs [version] [--charms]
 *   npm run generate-charms-tsw
 *
 * Defaults to 2.14 charms only.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_URL = 'https://tsw.vn.cz/stats/api_item.php';
const REQUEST_DELAY_MS = 1000;
const DEFAULT_VERSION = '2.14';
const SUPPORTED_FOLDER = '2_14';

const CHARM_CLASSES = new Set(['Quest Charms', 'Class Charms', 'Charms']);

/**
 * Dimensional Key is one catalog concept, but TSW stores four unique bases
 * (plus Nephalem upgraded forms with the combat bonuses).
 * @type {ReadonlyArray<{ name: string, id: string, tswNames: string[] }>}
 */
const DIMENSIONAL_KEY_VARIANTS = Object.freeze([
  {
    name: 'Dimensional Key - Arcana',
    base: 'Arcana',
    id: 'ebw',
    tswNames: ['Nephalem Arcana', 'Arcana'],
  },
  {
    name: 'Dimensional Key - Mandate',
    base: 'Mandate',
    id: 'ebw-mandate',
    tswNames: ['Nephalem Mandate', 'Mandate'],
  },
  {
    name: 'Dimensional Key - Onslaught',
    base: 'Onslaught',
    id: 'ebw-onslaught',
    tswNames: ['Nephalem Onslaught', 'Onslaught'],
  },
  {
    name: 'Dimensional Key - Primordia',
    base: 'Primordia',
    id: 'ebw-primordia',
    tswNames: ['Nephalem Primordia', 'Primordia'],
  },
]);

/**
 * Optional TSW lookup aliases when catalog name differs from API name.
 * Prefer Nephalem forms first (they carry the combat bonuses).
 * @type {Readonly<Record<string, string[]>>}
 */
const CHARM_TSW_LOOKUP = Object.freeze(
  Object.fromEntries([
    ...DIMENSIONAL_KEY_VARIANTS.map((v) => [v.name, v.tswNames]),
    ...DIMENSIONAL_KEY_VARIANTS.map((v) => [v.base, v.tswNames]),
  ])
);

/** Lines that are flavor / instructions, not planner modifiers. */
const CHARM_SKIP_LINE =
  /^(Keep in Inventory|Required Level:|Difficulty Level:|Instructions|Transmute\b|Reward can be used|Craft a |Upgrade your |Unlock rewards|Drop rate of|Increased drop rate|Level \d+\s*$|Dimensional Key\s*$|Trial of|Defeat\b|Explore\b|Complete\b|Occult Smithing|Dimensional Alchemy|Void Armor|End the Invasion)/i;

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const parts = String(version).trim().split('.');
  return `${parts[0] || '0'}_${parts[1] || '0'}`;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (flags.has('--relics')) {
    throw new Error('Relics must be generated from the Median XL wiki.');
  }
  return {
    version: positional[0] || DEFAULT_VERSION,
    resume: false,
    doRelics: false,
    doCharms: true,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} url
 * @param {{ retries?: number }} [opts]
 */
async function fetchJson(url, opts = {}) {
  const retries = opts.retries ?? 4;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 503) {
        const wait = REQUEST_DELAY_MS * (attempt + 2);
        console.warn(`  HTTP ${res.status}, retry in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.ok === false && data.error) {
        throw new Error(`TSW API: ${data.error}`);
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && /HTTP 429|HTTP 503/.test(String(err.message))) {
        await sleep(REQUEST_DELAY_MS * (attempt + 2));
        continue;
      }
      if (attempt < retries && err instanceof TypeError) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error(`Failed ${url}`);
}

/**
 * @param {string} name
 * @param {string} [quality]
 * @returns {Promise<object|null>}
 */
async function fetchExactItem(name, quality) {
  const tryQueries = quality ? [name, `${name} (${quality})`] : [name];
  for (let i = 0; i < tryQueries.length; i++) {
    const q = tryQueries[i];
    const result = await fetchJson(`${API_URL}?q=${encodeURIComponent(q)}`);
    if (i < tryQueries.length - 1) await sleep(REQUEST_DELAY_MS);

    const items = result.items ?? [];
    if (quality) {
      const exact = items.find((it) => it.name === name && it.quality === quality);
      if (exact) return exact;
    }
    const byName = items.find((it) => it.name === name);
    if (byName) return byName;

    if (result.truncated && Array.isArray(result.matches)) {
      const hit = result.matches.find(
        (m) => m.name === name && (!quality || m.quality === quality)
      );
      if (hit && i === 0 && quality) continue;
    }
  }
  return null;
}

/**
 * Resolve a catalog charm name against TSW (handles Dimensional Key aliases).
 * @param {string} catalogName
 * @returns {Promise<object|null>}
 */
async function fetchCharmFromTsw(catalogName) {
  const aliases = CHARM_TSW_LOOKUP[catalogName] || [catalogName];
  for (let i = 0; i < aliases.length; i++) {
    const match = await fetchExactItem(aliases[i]);
    if (i < aliases.length - 1) await sleep(REQUEST_DELAY_MS);
    if (!match?.stats) continue;
    const isCharmLike =
      match.quality === 'Charm' ||
      match.quality === 'Quest' ||
      CHARM_CLASSES.has(String(match.class || '')) ||
      /Dimensional Key/i.test(String(match.type || ''));
    if (isCharmLike) return match;
  }
  return null;
}

/**
 * Expand legacy "Dimensional Key" into the four TSW unique bases.
 * Also renames short base names to "Dimensional Key - …".
 * @param {object[]} existing
 * @returns {object[]}
 */
function expandDimensionalKeyCatalog(existing) {
  /** @type {Map<string, (typeof DIMENSIONAL_KEY_VARIANTS)[number]>} */
  const variantById = new Map(DIMENSIONAL_KEY_VARIANTS.map((v) => [v.id, v]));
  const hasVariants = DIMENSIONAL_KEY_VARIANTS.every((v) =>
    existing.some(
      (c) => c.id === v.id || c.name === v.name || c.name === v.base || c.name === `Relic (${v.base})`
    )
  );

  if (hasVariants) {
    return existing
      .filter((c) => c.name !== 'Dimensional Key')
      .map((c) => {
        const variant = variantById.get(c.id);
        return variant ? { ...c, name: variant.name } : c;
      });
  }

  const legacy = existing.find((c) => c.name === 'Dimensional Key' || c.id === 'ebw');
  if (!legacy) return existing;

  /** @type {object[]} */
  const out = [];
  let inserted = false;
  for (const prev of existing) {
    if (prev.name === 'Dimensional Key' || prev.id === 'ebw') {
      if (inserted) continue;
      for (const variant of DIMENSIONAL_KEY_VARIANTS) {
        out.push({
          ...prev,
          id: variant.id,
          name: variant.name,
        });
      }
      inserted = true;
      continue;
    }
    if (DIMENSIONAL_KEY_VARIANTS.some((v) => v.id === prev.id || v.base === prev.name)) {
      continue;
    }
    out.push(prev);
  }
  return out;
}

/**
 * Strip inventory-only fields the store fills from defaults.
 * @param {Record<string, unknown>} prev
 * @returns {Record<string, unknown>}
 */
function stripCatalogInventoryFields(prev) {
  /** @type {Record<string, unknown>} */
  const next = { ...prev };
  for (const key of [
    'type',
    'category',
    'slot',
    'invWidth',
    'invHeight',
    'reqStr',
    'reqDex',
  ]) {
    delete next[key];
  }
  return next;
}

/**
 * @param {string} filePath
 * @returns {object[]}
 */
function loadJsonArray(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`Could not read ${filePath}: ${err.message}`);
    return [];
  }
}

/**
 * @param {string} stats
 * @param {{ charmMode?: boolean }} [opts]
 * @returns {{ reqLevel: number, classRestriction?: string, modifiers: string[] }}
 */
function parseStatsBlock(stats, opts = {}) {
  const lines = String(stats || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let reqLevel = opts.charmMode ? 1 : 75;
  /** @type {string|undefined} */
  let classRestriction;
  /** @type {string[]} */
  const modifiers = [];

  for (const line of lines) {
    const req = /^Required Level:\s*(\d+)\s*$/i.exec(line);
    if (req) {
      reqLevel = Number(req[1]);
      continue;
    }
    const only = /^\(([^)]+Only)\)\s*$/i.exec(line);
    if (only) {
      classRestriction = only[1].trim();
      continue;
    }
    if (opts.charmMode) {
      if (CHARM_SKIP_LINE.test(line)) continue;
      // Parenthetical instructions (not class restrictions)
      if (/^\([^)]+\)\s*$/.test(line) && !/Only\)\s*$/i.test(line)) continue;
      // Dungeon / difficulty flavor: "Horror Under Tristram (Heroic)"
      if (/\(Heroic\)\s*$/i.test(line) && !/^Unlocks\b/i.test(line)) continue;
    }
    modifiers.push(line);
  }

  return { reqLevel, classRestriction, modifiers };
}

/**
 * @param {object} match
 * @param {Map<string, object>} existingByName
 * @returns {object}
 */
function relicFromMatch(match, existingByName) {
  const name = String(match.name || '').trim();
  const parsed = parseStatsBlock(match.stats || '', { charmMode: false });
  const nameMatch = /^Relic\s*\((.+)\)\s*$/i.exec(name);
  const skillHint = nameMatch ? nameMatch[1].trim() : name;
  const prev = existingByName.get(name);

  /** @type {Record<string, unknown>} */
  const entry = {
    id: prev?.id || `relic:${slugify(skillHint)}`,
    name,
    keepInInventory: true,
    rarity: 'relic',
    icon: prev?.icon || 'relic01',
    reqLevel: parsed.reqLevel,
    modifiers: parsed.modifiers,
  };
  if (parsed.classRestriction) entry.classRestriction = parsed.classRestriction;
  return entry;
}

/**
 * @param {string} outDir
 * @param {boolean} resume
 */
async function generateRelics(outDir, resume) {
  const outputPath = path.join(outDir, 'relics.json');
  const existing = loadJsonArray(outputPath);
  /** @type {Map<string, object>} */
  const existingByName = new Map(existing.map((r) => [r.name, r]));
  /** @type {Map<string, object>} */
  const existingById = new Map(existing.map((r) => [r.id, r]));

  console.log('Fetching item index for relics...');
  const index = await fetchJson(`${API_URL}?mode=index`);
  const indexItems = (index.items ?? []).filter((item) => item.quality === 'Relic');
  console.log(`${indexItems.length} Relic entries to crawl.`);

  /** @type {object[]} */
  const entries = [];
  let done = 0;
  let skipped = 0;
  let fetched = 0;

  for (const indexItem of indexItems) {
    const name = indexItem.name;
    const prev = existingByName.get(name);

    if (resume && prev?.modifiers?.length) {
      entries.push(prev);
      skipped++;
      done++;
      if (done % 25 === 0 || done === indexItems.length) {
        console.log(`  relics ${done}/${indexItems.length} (${fetched} fetched, ${skipped} resumed)`);
      }
      continue;
    }

    try {
      const match = await fetchExactItem(name, 'Relic');
      if (match?.stats) {
        const entry = relicFromMatch(match, existingByName);
        // Keep stable id if slug collided with a different prior name
        if (!prev && existingById.has(entry.id)) {
          let n = 2;
          while (existingById.has(`${entry.id}-${n}`)) n++;
          entry.id = `${entry.id}-${n}`;
        }
        entries.push(entry);
        existingById.set(entry.id, entry);
        fetched++;
      } else {
        console.warn(`  no stats for relic "${name}"`);
        if (prev) entries.push(prev);
      }
    } catch (err) {
      console.warn(`  failed relic "${name}": ${err.message}`);
      if (prev) entries.push(prev);
    }

    done++;
    if (done % 25 === 0 || done === indexItems.length) {
      console.log(`  relics ${done}/${indexItems.length} (${fetched} fetched, ${skipped} resumed)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  entries.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en'));
  writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`Wrote ${entries.length} relics → ${outputPath}`);
  return entries.length;
}

/**
 * @param {string} outDir
 */
async function generateCharms(outDir) {
  const outputPath = path.join(outDir, 'charms.json');
  const existingRaw = loadJsonArray(outputPath);
  if (!existingRaw.length) {
    console.warn(`No existing charms.json at ${outputPath}; skip charms (need local catalog for ids/icons/trophies).`);
    return 0;
  }

  const existing = expandDimensionalKeyCatalog(existingRaw);
  if (existing.length !== existingRaw.length) {
    console.log(
      `Expanded Dimensional Key → ${DIMENSIONAL_KEY_VARIANTS.map((v) => v.name).join(', ')}`
    );
  }

  console.log(`Refreshing ${existing.length} local charms from TSW...`);

  /** @type {object[]} */
  const out = [];
  let updated = 0;
  let missing = 0;

  for (let i = 0; i < existing.length; i++) {
    const prev = existing[i];
    const name = String(prev.name || '').trim();

    try {
      const match = await fetchCharmFromTsw(name);

      if (match?.stats) {
        const parsed = parseStatsBlock(match.stats, { charmMode: true });
        const next = stripCatalogInventoryFields(/** @type {Record<string, unknown>} */ ({ ...prev }));
        next.reqLevel = parsed.reqLevel;
        next.modifiers = parsed.modifiers.length ? parsed.modifiers : prev.modifiers;
        if (parsed.classRestriction) next.classRestriction = parsed.classRestriction;
        else delete next.classRestriction;
        out.push(next);
        updated++;
      } else {
        console.warn(`  no TSW charm match for "${name}"`);
        out.push(stripCatalogInventoryFields(/** @type {Record<string, unknown>} */ ({ ...prev })));
        missing++;
      }
    } catch (err) {
      console.warn(`  failed charm "${name}": ${err.message}`);
      out.push(stripCatalogInventoryFields(/** @type {Record<string, unknown>} */ ({ ...prev })));
      missing++;
    }

    if ((i + 1) % 10 === 0 || i + 1 === existing.length) {
      console.log(`  charms ${i + 1}/${existing.length} (${updated} updated, ${missing} missing)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} charms → ${outputPath}`);
  return out.length;
}

async function main() {
  const { version, resume, doRelics, doCharms } = parseArgs(process.argv.slice(2));
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER) {
    throw new Error(`Only 2.14 item data is available; received ${version}.`);
  }
  const outDir = path.join(ROOT, 'public', 'items', folder);
  mkdirSync(outDir, { recursive: true });

  console.log(`Version ${version} → ${outDir}`);
  console.log(`Mode: relics=${doRelics} charms=${doCharms} resume=${resume}`);

  // Probe API once up front
  await fetchJson(`${API_URL}?mode=index`);

  if (doRelics) {
    await generateRelics(outDir, resume);
  }
  if (doCharms) {
    await generateCharms(outDir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
