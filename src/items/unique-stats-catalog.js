/**
 * Convert unique-stats-db.json entries into planner ItemDefs / SetDefs.
 * @module items/unique-stats-catalog
 */

/**
 * @typedef {{
 *   name: string,
 *   quality: string,
 *   stats: string,
 *   class?: string,
 *   type?: string,
 *   nameDisplay?: string,
 *   setName?: string,
 * }} UniqueStatsEntry
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {string} quality
 * @returns {{ rarity: string, uniqueKind?: string, tier?: string|number }|null}
 */
export function qualityToRarity(quality) {
  switch (quality) {
    case 'TU':
      return { rarity: 'unique', uniqueKind: 'tiered' };
    case 'SU':
      return { rarity: 'unique', uniqueKind: 'su', tier: 'sacred' };
    case 'Sacred Set':
      return { rarity: 'set' };
    default:
      return null;
  }
}

/**
 * @param {string} stats
 * @returns {boolean}
 */
export function isSetBonusStats(stats) {
  return /^\s*Set Bonus with/i.test(String(stats || ''));
}

/**
 * @param {string} stats
 * @returns {Array<{ required: number|string, modifiers: string[] }>}
 */
export function parseSetBonusStats(stats) {
  /** @type {Array<{ required: number|string, modifiers: string[] }>} */
  const bonuses = [];
  const text = String(stats || '').trim();
  if (!text) return bonuses;

  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const header = lines[0];
    let required;
    const complete = /^Set Bonus with complete set:?$/i.exec(header);
    const numbered = /^Set Bonus with (\d+) or more set items:?$/i.exec(header);
    if (complete) required = 'complete';
    else if (numbered) required = Number(numbered[1]);
    else continue;
    bonuses.push({
      required,
      modifiers: lines.slice(1),
    });
  }
  return bonuses;
}

const HEADER_LINE_RES = [
  /^(Defense|One-Hand Damage|Two-Hand Damage|Throw Damage|Chance to Block)\s*:/i,
  /^\([^)]+Only\)$/i,
  /^Required Level:\s*(-?\d+)?$/i,
  /^Required Strength:\s*(-?\d+)?$/i,
  /^Required Dexterity:\s*(-?\d+)?$/i,
  /^Item Level:\s*(-?\d+)?$/i,
  /^(Strength|Dexterity) Damage Bonus:/i,
  /^Socketed\s*\((\d+)\)\s*$/i,
];

/** Bare number (or "N to M") left on the next line after a requirement label. */
const SPLIT_HEADER_VALUE_RE = /^-?\d+(?:\s+to\s+-?\d+)?$/;

/**
 * @param {string} line
 * @returns {boolean}
 */
function isHeaderLine(line) {
  const t = line.trim();
  if (!t) return true;
  // Continuation of multi-line defense/damage ranges
  if (/^\(?-?\d/.test(t) && /(to|-)/.test(t) && !/%/.test(t) && t.length < 40) {
    return true;
  }
  return HEADER_LINE_RES.some((re) => re.test(t));
}

/**
 * @param {string} stats
 * @returns {{
 *   reqLevel?: number,
 *   reqStr?: number,
 *   reqDex?: number,
 *   qlvl?: number,
 *   sockets?: number,
 *   classRestriction?: string,
 *   defenseDisplay?: string,
 *   damage1hDisplay?: string,
 *   damage2hDisplay?: string,
 *   throwDamageDisplay?: string,
 *   modifiers: string[],
 * }}
 */
export function parseItemStats(stats) {
  const lines = String(stats || '').split('\n');
  /** @type {ReturnType<typeof parseItemStats>} */
  const out = { modifiers: [] };

  /** @type {string[]} */
  let pendingDisplay = [];
  /** @type {'defense'|'damage1h'|'damage2h'|'throw'|null} */
  let pendingKind = null;

  /**
   * @param {string} kind
   * @param {string} rest
   */
  function startDisplay(kind, rest) {
    flushDisplay();
    pendingKind = /** @type {typeof pendingKind} */ (kind);
    pendingDisplay = [rest.trim()].filter(Boolean);
  }

  function flushDisplay() {
    if (!pendingKind) return;
    const value = pendingDisplay.join(' ').replace(/\s+/g, ' ').trim();
    if (pendingKind === 'defense') out.defenseDisplay = value;
    else if (pendingKind === 'damage1h') out.damage1hDisplay = value;
    else if (pendingKind === 'damage2h') out.damage2hDisplay = value;
    else if (pendingKind === 'throw') out.throwDamageDisplay = value;
    pendingKind = null;
    pendingDisplay = [];
  }

  /**
   * Wiki dumps sometimes put the requirement value on the next line.
   * @param {string} rest
   * @param {number} index
   * @returns {{ value: number, skipNext: boolean }|null}
   */
  function takeHeaderNumber(rest, index) {
    const inline = /^\s*(-?\d+)/.exec(rest);
    if (inline) return { value: Number(inline[1]), skipNext: false };
    const next = String(lines[index + 1] || '').trim();
    if (!SPLIT_HEADER_VALUE_RE.test(next)) return null;
    return { value: Number(/^-?\d+/.exec(next)?.[0] ?? ''), skipNext: true };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushDisplay();
      continue;
    }

    const def = /^Defense:\s*(.*)$/i.exec(line);
    if (def) {
      startDisplay('defense', def[1]);
      continue;
    }
    const d1 = /^One-Hand Damage:\s*(.*)$/i.exec(line);
    if (d1) {
      startDisplay('damage1h', d1[1]);
      continue;
    }
    const d2 = /^Two-Hand Damage:\s*(.*)$/i.exec(line);
    if (d2) {
      startDisplay('damage2h', d2[1]);
      continue;
    }
    const th = /^Throw Damage:\s*(.*)$/i.exec(line);
    if (th) {
      startDisplay('throw', th[1]);
      continue;
    }

    if (pendingKind && /^\(?-?\d/.test(line) && !/%/.test(line) && line.length < 60) {
      pendingDisplay.push(line);
      continue;
    }
    flushDisplay();

    const reqLvl = /^Required Level:\s*(.*)$/i.exec(line);
    if (reqLvl) {
      const taken = takeHeaderNumber(reqLvl[1], i);
      if (taken) {
        out.reqLevel = taken.value;
        if (taken.skipNext) i += 1;
      }
      continue;
    }
    const reqStr = /^Required Strength:\s*(.*)$/i.exec(line);
    if (reqStr) {
      const taken = takeHeaderNumber(reqStr[1], i);
      if (taken) {
        out.reqStr = taken.value;
        if (taken.skipNext) i += 1;
      }
      continue;
    }
    const reqDex = /^Required Dexterity:\s*(.*)$/i.exec(line);
    if (reqDex) {
      const taken = takeHeaderNumber(reqDex[1], i);
      if (taken) {
        out.reqDex = taken.value;
        if (taken.skipNext) i += 1;
      }
      continue;
    }
    const ilvl = /^Item Level:\s*(.*)$/i.exec(line);
    if (ilvl) {
      const taken = takeHeaderNumber(ilvl[1], i);
      if (taken) {
        out.qlvl = taken.value;
        if (taken.skipNext) i += 1;
      }
      continue;
    }
    const sock = /^Socketed\s*\((\d+)\)\s*$/i.exec(line);
    if (sock) {
      out.sockets = Number(sock[1]);
      continue;
    }
    const classOnly = /^\(([^)]+Only)\)$/i.exec(line);
    if (classOnly) {
      out.classRestriction = classOnly[1];
      continue;
    }
    if (/^(Strength|Dexterity) Damage Bonus:/i.test(line)) continue;
    if (/^Chance to Block:/i.test(line)) continue;

    if (!isHeaderLine(line)) {
      out.modifiers.push(line);
    }
  }
  flushDisplay();
  return out;
}

/**
 * @param {string|null|undefined} typeName
 * @param {string} quality
 * @param {Array<{ id?: string, name?: string }>} bases
 * @returns {{ id?: string, name?: string }|null}
 */
export function findBaseForType(typeName, quality, bases) {
  const type = String(typeName || '').trim();
  if (!type || !Array.isArray(bases)) return null;

  const exact = bases.find((b) => b.name === type);
  if (exact) return exact;

  if (quality === 'SU' || quality === 'Sacred Set') {
    const sacred = bases.find((b) => b.name === `${type} (Sacred)`);
    if (sacred) return sacred;
  }

  if (quality === 'TU') {
    // Prefer highest tier (4) then lower
    for (const tier of [4, 3, 2, 1]) {
      const hit = bases.find((b) => b.name === `${type} (${tier})`);
      if (hit) return hit;
    }
    const any = bases.find((b) => String(b.name || '').startsWith(`${type} (`));
    if (any) return any;
  }

  // Already a full base name like "Short Sword (4)"
  const asIs = bases.find((b) => b.name === type);
  return asIs || null;
}

/**
 * @param {UniqueStatsEntry[]} entries
 * @returns {Array<{ id: string, name: string, bonuses: Array<{ required: number|string, modifiers: string[] }> }>}
 */
export function buildSetDefsFromEntries(entries) {
  /** @type {Array<{ id: string, name: string, bonuses: Array<{ required: number|string, modifiers: string[] }> }>} */
  const sets = [];
  for (const entry of entries || []) {
    if (entry.quality !== 'Set' || !isSetBonusStats(entry.stats)) continue;
    const bonuses = parseSetBonusStats(entry.stats);
    if (!bonuses.length) continue;
    sets.push({
      id: `set:${slugify(entry.name)}`,
      name: entry.name,
      bonuses,
    });
  }
  return sets;
}

/**
 * @param {UniqueStatsEntry} entry
 * @param {Array<object>} bases
 * @returns {object|null}
 */
export function entryToItemDef(entry, bases) {
  if (!entry?.name) return null;
  if (entry.quality === 'Set' && isSetBonusStats(entry.stats)) return null;
  const rarityInfo = qualityToRarity(entry.quality);
  if (!rarityInfo) return null;

  const parsed = parseItemStats(entry.stats || '');
  const base = findBaseForType(entry.type, entry.quality, bases);

  const idPrefix = rarityInfo.rarity === 'set' ? 's' : 'u';
  const qualitySlug = slugify(entry.quality);
  const id = `${idPrefix}:${slugify(entry.name)}:${qualitySlug}`;

  /** @type {Record<string, unknown>} */
  const def = {
    id,
    name: entry.name,
    rarity: rarityInfo.rarity,
    modifiers: parsed.modifiers,
  };

  if (rarityInfo.uniqueKind) def.uniqueKind = rarityInfo.uniqueKind;
  if (rarityInfo.tier != null) def.tier = rarityInfo.tier;
  if (entry.type) def.baseType = String(entry.type).trim();

  if (parsed.reqLevel != null) def.reqLevel = parsed.reqLevel;
  if (parsed.reqStr != null) def.reqStr = parsed.reqStr;
  if (parsed.reqDex != null) def.reqDex = parsed.reqDex;
  if (parsed.qlvl != null) def.qlvl = parsed.qlvl;
  if (parsed.sockets != null) def.sockets = parsed.sockets;
  if (parsed.classRestriction) def.classRestriction = parsed.classRestriction;
  if (parsed.defenseDisplay) def.defenseDisplay = parsed.defenseDisplay;
  if (parsed.damage1hDisplay) def.damage1hDisplay = parsed.damage1hDisplay;
  if (parsed.damage2hDisplay) def.damage2hDisplay = parsed.damage2hDisplay;
  if (parsed.throwDamageDisplay) def.throwDamageDisplay = parsed.throwDamageDisplay;

  if (entry.class) def.group = entry.class;

  if (base) {
    def.baseId = base.id;
    def.baseName = base.name;
    def.type = base.type;
    def.category = base.category;
    def.slot = base.slot;
    def.invWidth = base.invWidth ?? 1;
    def.invHeight = base.invHeight ?? 1;
    def.icon = base.icon;
    if (base.group && !def.group) def.group = base.group;
    if (base.classRestriction && !def.classRestriction) {
      def.classRestriction = base.classRestriction;
    }
    if (base.speed != null) def.speed = base.speed;
    if (base.range != null) def.range = base.range;
    if (base.strDamageBonus != null) def.strDamageBonus = base.strDamageBonus;
    if (base.dexDamageBonus != null) def.dexDamageBonus = base.dexDamageBonus;
  } else {
    // Fallback so jewelry-like items without a matched base still show in picker
    def.category = def.category || 'other';
    def.invWidth = 1;
    def.invHeight = 1;
  }

  if (rarityInfo.rarity === 'set' && entry.setName) {
    def.setName = entry.setName;
    def.setId = `set:${slugify(entry.setName)}`;
  }

  return def;
}

/**
 * @param {{ entries?: UniqueStatsEntry[] }|UniqueStatsEntry[]|null|undefined} db
 * @param {Array<object>} bases
 * @returns {{ items: object[], sets: Array<{ id: string, name: string, bonuses: Array<{ required: number|string, modifiers: string[] }> }> }}
 */
export function buildCatalogFromUniqueStats(db, bases) {
  const entries = Array.isArray(db) ? db : db?.entries ?? [];
  const sets = buildSetDefsFromEntries(entries);
  /** @type {object[]} */
  const items = [];
  for (const entry of entries) {
    const def = entryToItemDef(entry, bases);
    if (def) items.push(def);
  }
  return { items, sets };
}
