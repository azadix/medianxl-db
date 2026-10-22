/**
 * Serialize planner builds into the TSW / NotArmory envelope used on import.
 * @module planner/tsw-build-export
 */

import { applyCustomOverlayToDef } from '@/items/custom-items.js';
import { pickItemIcon } from '@/items/item-icons.js';
import { decodeModifierLine } from '@/items/item-modifier-line.js';
import { formatOverlayBadge, isSetItem } from '@/items/item-overlays.js';
import { formatItemRarityBadge, getItemStatLines } from '@/items/item-stats.js';
import { isCharmItem } from '@/items/charm-items.js';
import { isRelicItem } from '@/items/relic-items.js';
import { isRunewordItem } from '@/items/runeword-items.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';
import { isTswEnvelope, TSW_SLOT_TO_EQUIPMENT } from '@/planner/tsw-build-import.js';

/** @type {Readonly<Record<string, string>>} */
export const EQUIPMENT_TO_TSW_SLOT = Object.freeze(
  Object.fromEntries(Object.entries(TSW_SLOT_TO_EQUIPMENT).map(([tsw, slot]) => [slot, tsw]))
);

/**
 * @param {string|null|undefined} color
 * @param {string} text
 * @returns {number}
 */
function tswColorId(color, text) {
  if (/^(Required |Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Item Level|Quality Level|Socketed \()/i.test(text)) {
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
  if (isRunewordItem(def)) return { quality: 'Runeword', display_quality: 'RW', name_color: 4 };
  if (isSetItem(def)) return { quality: 'Set', display_quality: 'Set', name_color: 2 };
  const badge = formatOverlayBadge(def?.uniqueKind, def?.tier) || formatItemRarityBadge(def);
  if (badge === 'SU' || badge === 'SSU' || badge === 'SSSU' || badge === 'TU' || badge === 'T1' || badge === 'T2' || badge === 'T3' || badge === 'T4') {
    const display = badge.startsWith('T') && badge.length === 2 ? 'TU' : badge;
    return { quality: 'Unique', display_quality: display, name_color: 4 };
  }
  if (badge === 'Unique') return { quality: 'Unique', display_quality: 'SU', name_color: 4 };
  if (badge === 'Rare' || def?.rarity === 'angelic' || def?.customQuality === 'angelic') {
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
  if (def?.rarity === 'angelic' || def?.customQuality === 'angelic') {
    return stem.includes('Angelic') ? stem : `${stem} (Angelic)`;
  }
  if (displayQuality === 'Set') return `${stem} (Set)`;
  if (displayQuality === 'TU' || displayQuality === 'SU' || displayQuality === 'SSU' || displayQuality === 'SSSU' || displayQuality === 'RW') {
    return `${stem} (${displayQuality})`;
  }
  return raw || stem;
}

/**
 * @param {string} line
 * @returns {Array<[string, number]>}
 */
function modifierToSeg(line) {
  const decoded = decodeModifierLine(line);
  const text = String(decoded.text || line || '').trim();
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
  /** @type {Record<string, unknown>} */
  const out = {
    slot: Number(sock?.slot) > 0 ? Number(sock.slot) : index + 1,
    name,
    type,
    quality,
    code,
    image,
    name_color: nameColor,
    description_lines,
  };
  return out;
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
  const name = String(inst?.name || def.name || '').trim() || 'Item';
  const relic = isRelicItem(def);
  const charm = isCharmItem(def);
  const type = tswType(def, q.display_quality);
  const rolls = inst?.rolls && typeof inst.rolls === 'object' ? inst.rolls : null;
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
    hideRollableRanges: true,
    extras,
    mysticOrbs,
    socketables,
    oil: inst?.oil,
    corruptions: inst?.corruptions,
    blessing: inst?.blessing,
    shrine: inst?.shrine,
    mechanics: inst?.mechanics,
  });
  /** @type {Array<Array<[string, number]>>} */
  const description_lines = [seg(name, q.name_color)];
  if (type) description_lines.push(seg(type, q.name_color === 2 ? 2 : 4));
  if (def.classRestriction) description_lines.push(seg(String(def.classRestriction), -1));
  for (const line of statLines) description_lines.push(modifierToSeg(line));
  if (reqs.reqLevel > 0) description_lines.push(seg(`Required Level: ${reqs.reqLevel}`, -1));
  if (reqs.reqStr > 0) description_lines.push(seg(`Required Strength: ${reqs.reqStr}`, -1));
  if (reqs.reqDex > 0) description_lines.push(seg(`Required Dexterity: ${reqs.reqDex}`, -1));
  if (eth) description_lines.push(seg('Ethereal', 1));
  if (corrupted) description_lines.push(seg('Corrupted', 1));

  /** @type {Record<string, unknown>} */
  const row = {
    item: relic ? 'Relic' : name,
    display_name: relic && !/^Relic:/i.test(name) ? `Relic: ${name}` : name,
    type,
    quality: q.quality,
    display_quality: q.display_quality,
    code: String(def.code || def.id || ''),
    image: String(inst?.icon || pickItemIcon(def) || ''),
    name_color: q.name_color,
    eth,
    corrupted,
    is_charm: charm || relic,
    is_trophy: false,
    is_class_charm: Boolean(def.isClassCharm),
    is_rw: isRunewordItem(def),
    is_upgraded: Boolean(inst?.oil),
    has_trophy: false,
    location: loc.location,
    slot: loc.slot,
    description_lines,
    socketables: socketables.map((sock, i) => socketableToTsw(sock, i)),
    mystic_orbs: mysticOrbs.map((tuple) => [Number(tuple[0]) || 1, String(tuple[1] || '')]),
    stat_ranges: [],
    charm_ranges: [],
  };
  return row;
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
    const row = plannerItemToTswRow(def, inst, {
      location: 'Gear',
      slot: EQUIPMENT_TO_TSW_SLOT[slot] || null,
    });
    if (row) out.push(row);
  }
  const pushEnabled = (map, location) => {
    for (const instanceId of Object.values(map || {})) {
      const inst = store.instances?.[instanceId];
      const def = store.getDefForInstance?.(instanceId) || store.catalogById?.[inst?.defId];
      const row = plannerItemToTswRow(def, inst, { location, slot: null });
      if (row) out.push(row);
    }
  };
  pushEnabled(store.enabledCharms, 'Inventory');
  pushEnabled(store.enabledRelics, 'Inventory');
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
    const base = byId[inst.defId];
    const def = applyCustomOverlayToDef(base, inst.custom) || base;
    const row = plannerItemToTswRow(def, inst, {
      location: 'Gear',
      slot: EQUIPMENT_TO_TSW_SLOT[slot] || null,
    });
    if (row) out.push(row);
  }
  const pushList = (list) => {
    for (const entry of Array.isArray(list) ? list : []) {
      const inst = snapshotEntryAsInst(entry);
      const base = byId[inst.defId];
      const def = applyCustomOverlayToDef(base, inst.custom) || base;
      const row = plannerItemToTswRow(def, inst, { location: 'Inventory', slot: null });
      if (row) out.push(row);
    }
  };
  pushList(snap.charms);
  pushList(snap.relics);
  return out;
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
    stats: rec.stats != null ? String(rec.stats) : '',
    savedAt: rec.savedAt != null ? String(rec.savedAt) : new Date().toISOString(),
  };
  if (rec.version) build.version = rec.version;
  if (rec.questsCompleted) build.questsCompleted = rec.questsCompleted;
  if (Number(rec.classSkillsBonus) > 0) build.classSkillsBonus = Number(rec.classSkillsBonus);
  if (Number.isFinite(Number(rec.spentPoints))) build.spentPoints = Number(rec.spentPoints);
  if (Array.isArray(rec.disabledSkills) && rec.disabledSkills.length) {
    build.disabledSkills = rec.disabledSkills;
  }
  if (Array.isArray(rec.enabledSkills) && rec.enabledSkills.length) {
    build.enabledSkills = rec.enabledSkills;
  }
  if (Array.isArray(rec.disabledOSkillSlots) && rec.disabledOSkillSlots.length) {
    build.disabledOSkillSlots = rec.disabledOSkillSlots;
  }
  if (Array.isArray(rec.enabledOSkillSlots) && rec.enabledOSkillSlots.length) {
    build.enabledOSkillSlots = rec.enabledOSkillSlots;
  }
  if (Array.isArray(rec.configConditions) && rec.configConditions.length) {
    build.configConditions = rec.configConditions;
  }
  if (rec.questCompletionOptOut) build.questCompletionOptOut = rec.questCompletionOptOut;
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
  const items = isPlannerItemsSnapshot(native.items)
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
