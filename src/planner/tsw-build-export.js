/**
 * Serialize planner builds into the TSW / NotArmory envelope used on import.
 * @module planner/tsw-build-export
 */

import Character from '@/character/Character.js';
import { isAngelicItemDef } from '@/items/angelic-items.js';
import { CHARM_ROLL_KEYS, isCharmItem, isDimensionalKeyCharm } from '@/items/charm-items.js';
import {
  dimensionalKeyTswDisplayName,
  dimensionalKeyTswProgressLines,
} from '@/items/dimensional-key.js';
import { applyCustomOverlayToDef } from '@/items/custom-items.js';
import { pickItemIcon } from '@/items/item-icons.js';
import { decodeModifierLine } from '@/items/item-modifier-line.js';
import { formatOverlayBadge, isSetItem } from '@/items/item-overlays.js';
import { parseAffixRanges } from '@/items/affix-rolls.js';
import { defaultRollsForDef, formatItemRarityBadge, getItemStatLines } from '@/items/item-stats.js';
import { isRelicItem } from '@/items/relic-items.js';
import { isRunewordItem } from '@/items/runeword-items.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';
import { isTswEnvelope, TSW_SLOT_TO_EQUIPMENT } from '@/planner/tsw-build-import.js';

/** @type {Readonly<Record<string, string>>} */
export const EQUIPMENT_TO_TSW_SLOT = Object.freeze(
  Object.fromEntries(Object.entries(TSW_SLOT_TO_EQUIPMENT).map(([tsw, slot]) => [slot, tsw]))
);

const TSW_PLANNER_PREFIX_RE = /^\[(?:Upgrade|Trophy|Awakening|Justicar|Paragon)\]\s+/i;
const KEEP_IN_INVENTORY = 'Keep in Inventory to Gain Bonus';

/**
 * @param {string|null|undefined} color
 * @param {string} text
 * @returns {number}
 */
function tswColorId(color, text) {
  if (/^(Required |Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Item Level|Quality Level|Socketed \(|Keep in Inventory)/i.test(text)) {
    return -1;
  }
  if (/^Corrupted$/i.test(text)) return 1;
  if (/^Already Upgraded$/i.test(text)) return 2;
  if (/^Ethereal$/i.test(text)) return 1;
  if (color === 'grey') return 5;
  if (color === 'orange') return 4;
  if (color === 'red') return 1;
  return 3;
}

/**
 * @param {string} text
 * @param {number} color
 * @returns {Array<[string, number]>}
 */
function seg(text, color) {
  return [[text, color]];
}

/**
 * @param {object|null|undefined} def
 * @returns {{ quality: string, display_quality: string, name_color: number }}
 */
function tswQuality(def) {
  if (isRelicItem(def)) return { quality: 'Unique', display_quality: 'Relic', name_color: 4 };
  if (isCharmItem(def)) return { quality: 'Unique', display_quality: 'Charm', name_color: 4 };
  if (isRunewordItem(def)) return { quality: 'RW', display_quality: 'RW', name_color: 4 };
  if (isSetItem(def)) return { quality: 'Set', display_quality: 'Set', name_color: 2 };
  const badge = formatOverlayBadge(def?.uniqueKind, def?.tier) || formatItemRarityBadge(def);
  if (badge === 'SU' || badge === 'SSU' || badge === 'SSSU' || badge === 'TU' || badge === 'T1' || badge === 'T2' || badge === 'T3' || badge === 'T4') {
    const display = badge.startsWith('T') && badge.length === 2 ? 'TU' : badge;
    return { quality: 'Unique', display_quality: display, name_color: 4 };
  }
  if (badge === 'Unique') return { quality: 'Unique', display_quality: 'SU', name_color: 4 };
  if (badge === 'Rare') {
    return { quality: 'Rare', display_quality: 'Rare', name_color: 9 };
  }
  if (badge === 'Magic' || def?.customQuality === 'magic') {
    return { quality: 'Magic', display_quality: 'Magic', name_color: 3 };
  }
  if (badge === 'Crafted' || def?.customQuality === 'crafted') {
    return { quality: 'Crafted', display_quality: 'Crafted', name_color: 8 };
  }
  if (badge === 'Honorific') return { quality: 'Honorific', display_quality: 'Honorific', name_color: 8 };
  return { quality: badge || 'Unique', display_quality: badge || 'SU', name_color: 4 };
}

/**
 * @param {object|null|undefined} def
 * @param {string} displayQuality
 * @returns {string}
 */
function tswType(def, displayQuality) {
  if (isCharmItem(def) || isRelicItem(def)) return 'Charm';
  const raw = String(def?.baseName || def?.type || '').trim();
  const stem = raw.replace(/\s*\((Sacred|Set|SU|SSU|SSSU|TU|Angelic|RW)\)\s*$/i, '').trim() || raw;
  if (isAngelicItemDef(def)) {
    return stem.includes('Angelic') ? stem : `${stem} (Angelic)`;
  }
  if (displayQuality === 'Set') return `${stem} (Set)`;
  if (displayQuality === 'TU' || displayQuality === 'SU' || displayQuality === 'SSU' || displayQuality === 'SSSU' || displayQuality === 'RW') {
    return `${stem} (${displayQuality})`;
  }
  return raw || stem;
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
function tswCode(def) {
  const code = String(def?.code || '').trim();
  if (code && !code.includes(':')) return code;
  const id = String(def?.id || '').trim();
  const last = id.split(':').pop() || '';
  if (last && !last.includes(':') && (/^@[0-9a-z]+$/i.test(last) || last.length <= 4)) return last;
  return code || id;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function tswRelicDisplayName(name) {
  const raw = String(name || '').trim();
  const wrapped = raw.match(/^Relic\s*\((.+)\)\s*$/i);
  if (wrapped) return `Relic: ${wrapped[1].trim()}`;
  if (/^Relic:/i.test(raw)) return raw;
  return raw ? `Relic: ${raw}` : 'Relic';
}

/**
 * @param {string} line
 * @returns {Array<[string, number]>}
 */
function modifierToSeg(line) {
  const decoded = decodeModifierLine(line);
  const text = String(decoded.text || line || '').trim().replace(TSW_PLANNER_PREFIX_RE, '');
  if (!text) return seg(String(line || ''), 3);
  return seg(text, tswColorId(decoded.color, text));
}

/**
 * @param {object|null|undefined} sock
 * @param {number} index
 * @returns {object}
 */
function socketableToTsw(sock, index) {
  const name = String(sock?.name || '').trim() || 'Jewel';
  const type = String(sock?.type || '').trim();
  const quality = String(sock?.quality || '').trim();
  const code = sock?.code != null ? String(sock.code) : '';
  const image = String(sock?.icon || sock?.image || '').trim();
  const nameColor = Number.isFinite(Number(sock?.nameColor ?? sock?.name_color))
    ? Number(sock.nameColor ?? sock.name_color)
    : 3;
  /** @type {Array<Array<[string, number]>>} */
  const description_lines = [seg(name, nameColor)];
  if (type) description_lines.push(seg(type, 0));
  const req = Number(sock?.reqLevel);
  if (Number.isFinite(req) && req > 0) description_lines.push(seg(`Required Level: ${req}`, -1));
  for (const mod of Array.isArray(sock?.modifiers) ? sock.modifiers : []) {
    description_lines.push(modifierToSeg(String(mod)));
  }
  return {
    slot: Number(sock?.slot) > 0 ? Number(sock.slot) : index + 1,
    name,
    type,
    quality,
    code,
    image,
    name_color: nameColor,
    description_lines,
  };
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {object|null|undefined} inst
 * @returns {boolean}
 */
function instanceIsUpgraded(inst, rolls) {
  if (inst?.oil) return true;
  const r = rolls && typeof rolls === 'object' ? rolls : {};
  if (Number(r[CHARM_ROLL_KEYS.paragonPath]) > 0) return true;
  for (const [key, val] of Object.entries(r)) {
    if (!Number(val)) continue;
    if (key.startsWith(CHARM_ROLL_KEYS.upgradePrefix) || key.startsWith(CHARM_ROLL_KEYS.paragonRegularPrefix)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {boolean}
 */
function instanceHasTrophy(rolls) {
  const r = rolls && typeof rolls === 'object' ? rolls : {};
  return Number(r[CHARM_ROLL_KEYS.trophy]) > 0 || Number(r[CHARM_ROLL_KEYS.trophyIndex]) > 0;
}

/**
 * @param {object|null|undefined} def
 * @returns {{ stat_ranges: object|Array, charm_ranges: object|Array }}
 */
function tswRangeBags(def) {
  /** @type {Record<string, [number, number]>} */
  const stat = {};
  /** @type {Record<string, string>} */
  const charm = {};
  const charmLike = isCharmItem(def) || isRelicItem(def);
  const mods = Array.isArray(def?.modifiers) ? def.modifiers : [];
  for (const mod of mods) {
    if (typeof mod !== 'string') continue;
    const ranges = parseAffixRanges(mod);
    if (!ranges.length) continue;
    let key = mod;
    for (const range of ranges) {
      const pct = /%/.test(mod);
      key = key.replace(range.raw, pct ? '#%' : '#');
    }
    key = key.replace(/^\+/, '').trim();
    if (!key) continue;
    if (charmLike) {
      charm[key] = ranges.map((range) => `${range.min} to ${range.max}`).join(', ');
    } else {
      stat[key] = [ranges[0].min, ranges[0].max];
    }
  }
  return {
    stat_ranges: Object.keys(stat).length ? stat : [],
    charm_ranges: Object.keys(charm).length ? charm : [],
  };
}

/**
 * @param {string} restriction
 * @returns {string}
 */
function tswClassRestriction(restriction) {
  const text = String(restriction || '').trim();
  if (!text) return '';
  if (/^\(.*\)$/.test(text)) return text;
  return `(${text})`;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function tswStatsText(text) {
  const lines = String(text || '').split('\n');
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    values[line.slice(0, i)] = line.slice(i + 1);
  }
  const skip = new Set();
  if (values['{{current_life}}'] != null && values['{{current_life}}'] === values['{{life}}']) {
    skip.add('{{current_life}}');
  }
  if (values['{{current_mana}}'] != null && values['{{current_mana}}'] === values['{{mana}}']) {
    skip.add('{{current_mana}}');
  }
  return lines
    .filter((line) => {
      const i = line.indexOf('=');
      if (i < 0) return Boolean(line);
      return !skip.has(line.slice(0, i));
    })
    .join('\n');
}

/**
 * @param {unknown} raw
 * @returns {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>|undefined}
 */
export function questsToTswExport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  /** @type {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>} */
  const out = {};
  for (const [id, val] of Object.entries(raw)) {
    const n = Character.normalizeQuestDifficultiesFromSave(val);
    if (!n) continue;
    if (!n.normal && !n.nightmare && !n.hell) continue;
    out[id] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param {object|null|undefined} def
 * @param {object|null|undefined} inst
 * @param {{ location: string, slot: string|null }} loc
 * @returns {object|null}
 */
export function plannerItemToTswRow(def, inst, loc) {
  if (!def) return null;
  const q = tswQuality(def);
  const catalogName = String(inst?.name || def.name || '').trim() || 'Item';
  const relic = isRelicItem(def);
  const charm = isCharmItem(def);
  const type = tswType(def, q.display_quality);
  const rolls =
    inst?.rolls && typeof inst.rolls === 'object' && Object.keys(inst.rolls).length
      ? inst.rolls
      : defaultRollsForDef(def);
  const displayName = relic
    ? tswRelicDisplayName(catalogName)
    : charm && isDimensionalKeyCharm(def)
      ? dimensionalKeyTswDisplayName(rolls)
      : catalogName;
  const extras = Array.isArray(inst?.extras) ? inst.extras : [];
  const mysticOrbs = Array.isArray(inst?.mysticOrbs) ? inst.mysticOrbs : [];
  const socketables = Array.isArray(inst?.socketables) ? inst.socketables : [];
  const eth = inst?.ethereal === true || def.ethereal === true;
  const corrupted = inst?.corrupted === true || def.corrupted === true;
  const reqs = resolveItemRequirements(def, {
    rolls,
    extras,
    mysticOrbs,
    socketables,
    corruptions: inst?.corruptions,
    ethereal: eth,
  });
  const statLines = getItemStatLines(def, rolls, {
    hideRollableRanges: false,
    showRollRanges: false,
    extras,
    mysticOrbs,
    oil: inst?.oil,
    corruptions: inst?.corruptions,
    blessing: inst?.blessing,
    shrine: inst?.shrine,
    mechanics: inst?.mechanics,
  });
  /** @type {Array<Array<[string, number]>>} */
  const description_lines = [seg(displayName, q.name_color)];
  if (charm || relic) {
    if (reqs.reqLevel > 0) description_lines.push(seg(`Required Level: ${reqs.reqLevel}`, -1));
    description_lines.push(seg(KEEP_IN_INVENTORY, -1));
    const restriction = tswClassRestriction(def.classRestriction);
    if (restriction) description_lines.push(seg(restriction, -1));
  } else {
    if (type) description_lines.push(seg(type, q.name_color === 2 ? 2 : 4));
    const restriction = tswClassRestriction(def.classRestriction);
    if (restriction) description_lines.push(seg(restriction, -1));
  }
  if (charm && isDimensionalKeyCharm(def)) {
    for (const text of dimensionalKeyTswProgressLines(rolls)) {
      description_lines.push(seg(text, 2));
    }
  }
  for (const line of statLines) {
    const decoded = decodeModifierLine(line);
    const text = String(decoded.text || line || '').trim().replace(TSW_PLANNER_PREFIX_RE, '');
    if (!text) continue;
    if (/^Keep in Inventory/i.test(text)) continue;
    if (/^Required Level:/i.test(text)) continue;
    if (charm || relic) {
      if (/^Charm$/i.test(text) || /^Relic$/i.test(text)) continue;
    }
    description_lines.push(modifierToSeg(text));
  }
  if (!charm && !relic) {
    if (reqs.reqLevel > 0) description_lines.push(seg(`Required Level: ${reqs.reqLevel}`, -1));
    if (reqs.reqStr > 0) description_lines.push(seg(`Required Strength: ${reqs.reqStr}`, -1));
    if (reqs.reqDex > 0) description_lines.push(seg(`Required Dexterity: ${reqs.reqDex}`, -1));
  }
  if (eth) description_lines.push(seg('Ethereal', 1));
  if (corrupted) description_lines.push(seg('Corrupted', 1));

  const bags = tswRangeBags(def);
  return {
    item: relic ? 'Relic' : displayName,
    display_name: displayName,
    type,
    quality: q.quality,
    display_quality: q.display_quality,
    code: tswCode(def),
    image: String(inst?.icon || pickItemIcon(def) || ''),
    name_color: q.name_color,
    eth,
    corrupted,
    is_charm: charm || relic,
    is_trophy: false,
    is_class_charm: Boolean(def.isClassCharm || (charm && def.classRestriction)),
    is_rw: isRunewordItem(def),
    is_upgraded: instanceIsUpgraded(inst, inst?.rolls || rolls),
    has_trophy: instanceHasTrophy(inst?.rolls || rolls),
    location: loc.location,
    slot: loc.slot,
    description_lines,
    socketables: socketables.map((sock, i) => socketableToTsw(sock, i)),
    mystic_orbs: mysticOrbs.map((tuple) => [Number(tuple[0]) || 1, String(tuple[1] || '')]),
    stat_ranges: bags.stat_ranges,
    charm_ranges: bags.charm_ranges,
  };
}

/**
 * @param {unknown} entry
 * @returns {object}
 */
function snapshotEntryAsInst(entry) {
  if (typeof entry === 'string') return { defId: entry };
  if (entry && typeof entry === 'object') return entry;
  return {};
}

/**
 * @param {object} store
 * @param {number} instanceId
 * @returns {{ location: string, slot: string|null }}
 */
export function tswLocationForInstance(store, instanceId) {
  for (const slot of EQUIPMENT_SLOTS) {
    if (store?.equipment?.[slot] === instanceId) {
      return { location: 'Gear', slot: EQUIPMENT_TO_TSW_SLOT[slot] || null };
    }
  }
  return { location: 'Inventory', slot: null };
}

/**
 * @param {object} store
 * @param {number} instanceId
 * @returns {object|null}
 */
export function syncStoreInstanceTswRow(store, instanceId) {
  const inst = store?.instances?.[instanceId];
  if (!inst) return null;
  const base = store.getDefForInstance?.(instanceId) || store.catalogById?.[inst.defId];
  const def = applyCustomOverlayToDef(base, inst.custom) || base;
  const loc = tswLocationForInstance(store, instanceId);
  const row = plannerItemToTswRow(def, inst, loc);
  if (row) inst.tswRow = row;
  else delete inst.tswRow;
  return row;
}

/**
 * @param {object} store
 * @param {{ rewrite?: boolean }} [options]
 */
export function syncStoreTswRows(store, options = {}) {
  if (!store?.instances) return;
  const rewrite = options.rewrite !== false;
  for (const key of Object.keys(store.instances)) {
    const id = Number(key);
    const inst = store.instances[id];
    if (!rewrite && inst?.tswRow && typeof inst.tswRow === 'object') {
      const loc = tswLocationForInstance(store, id);
      inst.tswRow = { ...inst.tswRow, location: loc.location, slot: loc.slot };
      continue;
    }
    syncStoreInstanceTswRow(store, id);
  }
}

/**
 * @param {object|null|undefined} inst
 * @param {object|null|undefined} def
 * @param {{ location: string, slot: string|null }} loc
 * @returns {object|null}
 */
function rowFromInstance(inst, def, loc) {
  if (inst?.tswRow && typeof inst.tswRow === 'object') {
    return { ...inst.tswRow, location: loc.location, slot: loc.slot };
  }
  return plannerItemToTswRow(def, inst, loc);
}

/**
 * @param {object} store
 * @returns {object[]}
 */
export function itemsStoreToTswItems(store) {
  if (!store) return [];
  /** @type {object[]} */
  const out = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const id = store.equipment?.[slot];
    if (id == null) continue;
    const inst = store.instances?.[id];
    const def = store.getDefForInstance?.(id) || store.catalogById?.[inst?.defId];
    const loc = { location: 'Gear', slot: EQUIPMENT_TO_TSW_SLOT[slot] || null };
    const row = rowFromInstance(inst, def, loc);
    if (row) out.push(row);
  }
  const pushEnabled = (map) => {
    for (const instanceId of Object.values(map || {})) {
      const inst = store.instances?.[instanceId];
      const def = store.getDefForInstance?.(instanceId) || store.catalogById?.[inst?.defId];
      const loc = { location: 'Inventory', slot: null };
      const row = rowFromInstance(inst, def, loc);
      if (row) out.push(row);
    }
  };
  pushEnabled(store.enabledCharms);
  pushEnabled(store.enabledRelics);
  return out;
}

/**
 * @param {object|null|undefined} snap
 * @param {object} store
 * @returns {object[]}
 */
export function plannerItemsSnapshotToTswItems(snap, store) {
  if (!snap || typeof snap !== 'object') return [];
  const byId = store?.catalogById || {};
  /** @type {object[]} */
  const out = [];
  const equipment = snap.equipment && typeof snap.equipment === 'object' ? snap.equipment : {};
  for (const slot of EQUIPMENT_SLOTS) {
    const entry = equipment[slot];
    if (!entry) continue;
    const inst = snapshotEntryAsInst(entry);
    const loc = { location: 'Gear', slot: EQUIPMENT_TO_TSW_SLOT[slot] || null };
    if (inst.tswRow && typeof inst.tswRow === 'object') {
      out.push({ ...inst.tswRow, location: loc.location, slot: loc.slot });
      continue;
    }
    const base = byId[inst.defId];
    const def = applyCustomOverlayToDef(base, inst.custom) || base;
    const row = plannerItemToTswRow(def, inst, loc);
    if (row) out.push(row);
  }
  const pushList = (list) => {
    for (const entry of Array.isArray(list) ? list : []) {
      const inst = snapshotEntryAsInst(entry);
      const loc = { location: 'Inventory', slot: null };
      if (inst.tswRow && typeof inst.tswRow === 'object') {
        out.push({ ...inst.tswRow, location: loc.location, slot: loc.slot });
        continue;
      }
      const base = byId[inst.defId];
      const def = applyCustomOverlayToDef(base, inst.custom) || base;
      const row = plannerItemToTswRow(def, inst, loc);
      if (row) out.push(row);
    }
  };
  pushList(snap.charms);
  pushList(snap.relics);
  return out;
}

/**
 * @param {object} store
 * @returns {boolean}
 */
function storeHasEquippedItems(store) {
  if (!store) return false;
  if (EQUIPMENT_SLOTS.some((slot) => store.equipment?.[slot] != null)) return true;
  if (store.enabledCharms && Object.keys(store.enabledCharms).length) return true;
  if (store.enabledRelics && Object.keys(store.enabledRelics).length) return true;
  return false;
}

/**
 * @param {object} native
 * @returns {object}
 */
export function tswBuildFieldsFromNative(native) {
  const rec = native && typeof native === 'object' ? native : {};
  /** @type {Record<string, unknown>} */
  const build = {
    name: rec.name != null ? String(rec.name) : '',
    class: rec.class != null ? String(rec.class) : '',
    level: Number(rec.level) || 1,
    skillPoints: rec.skillPoints && typeof rec.skillPoints === 'object' ? rec.skillPoints : {},
    oSkills: rec.oSkills && typeof rec.oSkills === 'object' ? rec.oSkills : {},
    allSkillsBonus: Number(rec.allSkillsBonus) || 0,
    stats: tswStatsText(rec.stats != null ? String(rec.stats) : ''),
    savedAt: rec.savedAt != null ? String(rec.savedAt) : new Date().toISOString(),
  };
  if (rec.version) build.version = rec.version;
  const quests = questsToTswExport(rec.questsCompleted);
  if (quests) build.questsCompleted = quests;
  return build;
}

/**
 * @param {object} build
 * @param {object[]} items
 * @returns {object}
 */
export function wrapTswBuildEnvelope(build, items) {
  return {
    ok: true,
    api_version: 1,
    meta: {
      realm: 'TSW',
      cached: false,
      generated_at: new Date().toISOString(),
    },
    build,
    items: Array.isArray(items) ? items : [],
  };
}

function isPlannerItemsSnapshot(raw) {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.equipment && typeof raw.equipment === 'object');
}

/**
 * Native planner snapshot or already-wrapped TSW envelope -> TSW envelope.
 * @param {object} raw
 * @param {object} [itemsStore]
 * @returns {object}
 */
export function wrapPlannerBuildForTswExport(raw, itemsStore = null) {
  if (isTswEnvelope(raw)) return raw;
  const native = raw && typeof raw === 'object' ? raw : {};
  const build = tswBuildFieldsFromNative(native);
  const items = storeHasEquippedItems(itemsStore)
    ? itemsStoreToTswItems(itemsStore)
    : isPlannerItemsSnapshot(native.items)
      ? plannerItemsSnapshotToTswItems(native.items, itemsStore)
      : [];
  return wrapTswBuildEnvelope(build, items);
}

/**
 * @param {object} envelope
 * @returns {string}
 */
export function tswExportLabel(envelope) {
  return savedBuildName(envelope);
}

/**
 * Inner `build` object for a TSW envelope, or the native record itself.
 * @param {object|null|undefined} raw
 * @returns {object}
 */
export function savedBuildInner(raw) {
  if (isTswEnvelope(raw)) return /** @type {{ build: object }} */ (raw).build;
  return raw && typeof raw === 'object' ? raw : {};
}

/**
 * @param {object|null|undefined} raw
 * @returns {string}
 */
export function savedBuildName(raw) {
  return String(savedBuildInner(raw).name ?? '');
}

/**
 * @param {object|null|undefined} raw
 * @param {string} name
 */
export function setSavedBuildName(raw, name) {
  if (isTswEnvelope(raw)) {
    /** @type {{ build: Record<string, unknown> }} */ (raw).build.name = name;
    return;
  }
  if (raw && typeof raw === 'object') raw.name = name;
}
