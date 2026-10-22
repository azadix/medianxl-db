/**
 * @file Pinia store for planner equipment and inventory items.
 * @module stores/items
 */

import { defineStore } from 'pinia';
import { getAssetUrl } from '@/shared/utils.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '@/shared/version-config.js';
import {
  EQUIPMENT_SLOTS,
  emptyEquipment,
  emptyInventory,
  canEquipInSlot,
  canEquipForClass,
  classEquipBlockedReason,
  canPlaceInInventory,
  isInventoryOnlyGear,
  isActiveWeaponSetSlot,
  isQuiverItem,
  isQuiverEffectActive,
  pairedWeaponSlot,
  QUIVER_INACTIVE_REASON,
} from '@/items/item-types.js';
import {
  getCharacterInstance,
  raiseCharacterLevelForItemReq,
  raiseCharacterStatsForItemReq,
} from '@/character/planner-instance.js';
import {
  canPlace,
  placeAt,
  findAnchorForClick,
  resolveOccupiedCell,
  listPlacedItems,
} from '@/items/inventory-placement.js';
import { pickItemIcon } from '@/items/item-icons.js';
import {
  charmMeetsLevel,
  getCharmRequiredLevel,
  getCharmUpgradeEntries,
  isCharmItem,
  isDimensionalKeyCharm,
} from '@/items/charm-items.js';
import { isRelicItem, MAX_RELICS, relicMeetsLevel } from '@/items/relic-items.js';
import {
  characterMeetsItemRequirements,
  formatItemRequirementsLine,
  itemAllowsMysticOrbReqLevel,
  itemRequirementsExceedCharacterLevel,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import {
  getPlannerAutoMatchHighestStatRequirements,
  getPlannerItemReqLevelCap,
} from '@/planner/planner-options.js';
import { isTswSocketedRuneDump } from '@/planner/tsw-item-rolls.js';
import {
  countEquippedSetPieces,
  resolveSetBonuses,
  setItemPieceKey,
} from '@/items/item-overlays.js';
import { buildCatalogFromUniqueStats, resolveCatalogDefId } from '@/items/unique-stats-catalog.js';
import {
  isRunewordTemplate,
  mergeRunewordWithBase,
  parseRunewordInstanceId,
  resolveRunewordTemplateId,
  runewordEntryToItemDef,
  runewordFitsEquipSlot,
} from '@/items/runeword-items.js';
import { applyCustomOverlayToDef, parseCustomPayload } from '@/items/custom-items.js';
import { normalizeRandomElement } from '@/items/random-element.js';
import { angelicBaseDisplayName } from '@/items/angelic-items.js';
import {
  isMastercraftedBaseItem,
  mastercraftedBaseDisplayName,
} from '@/items/mastercrafted-items.js';
import {
  canUseMysticOrbOnItem,
  loadMysticOrbsCatalog,
  normalizeMysticOrbs,
} from '@/items/mystic-orbs.js';
import { loadOilsCatalog } from '@/items/oils.js';
import { loadCorruptionsCatalog, normalizeCorruptions } from '@/items/corruptions.js';
import { loadHonorificBlessings, loadShrinesCatalog } from '@/items/blessings.js';
import { loadAffixTemplates } from '@/items/affix-templates.js';
import { loadItemMechanics } from '@/items/item-mechanics.js';
import { getItemUpgradeFlags } from '@/items/item-upgrades.js';
import {
  getItemSocketCount,
  loadSocketablesCatalog,
  mergeJewelItemsIntoSocketablesCatalog,
  normalizeCustomJewelRarity,
  normalizeSocketables,
  trimSocketablesToCount,
} from '@/items/socketables.js';

/** When true, equip/enable paths skip raising planner level for item reqs. */
let skipItemReqLevelSync = false;

/** @type {WeakMap<object, { folder: string, promise: Promise<void> }>} */
const catalogLoadInflight = new WeakMap();

/**
 * @param {Response|null|undefined} res
 * @returns {Promise<unknown>}
 */
async function readJsonIfOk(res) {
  if (!res?.ok) return null;
  try {
    return await res.json();
  } catch (e) {
    console.warn('Failed to parse item catalog JSON', e);
    return null;
  }
}

/**
 * @param {string} url
 * @returns {Promise<Response|null>}
 */
async function fetchCatalogFile(url) {
  try {
    return await fetch(url);
  } catch (e) {
    console.warn('Failed to fetch item catalog file', url, e);
    return null;
  }
}

/**
 * @typedef {{ location: 'equipment'|'inventory'|'charms'|'relics', slot: string|number }} SlotRef
 * @typedef {{
 *   id: string,
 *   name: string,
 *   type: string,
 *   category: string,
 *   slot: string|string[]|null,
 *   invWidth: number,
 *   invHeight: number,
 *   rarity: string,
 *   icon: string,
 *   reqLevel?: number,
 *   reqStr?: number,
 *   reqDex?: number,
 *   qlvl?: number,
 *   sockets?: number,
 *   speed?: number,
 *   range?: number,
 *   damage1h?: { min: number, max: number },
 *   damage2h?: { min: number, max: number },
 *   defense?: { min: number, max: number },
 *   block?: string,
 *   classRestriction?: string,
 *   movePenalty?: number,
 *   strDamageBonus?: number,
 *   dexDamageBonus?: number,
 *   innate?: string,
 *   adds?: string,
 *   attackModifier?: string,
 *   group?: string,
 *   keepInInventory?: boolean,
 *   dungeon?: string,
 *   modifiers?: Array<string|{ oneOf: string[] }>,
 *   upgrade?: Array<string|Record<string, string[]>>,
 *   upgrades?: string[][],
 *   trophy?: string[],
 *   baseId?: string,
 *   baseName?: string,
 *   baseType?: string,
 *   uniqueKind?: string,
 *   tier?: number|string,
 *   setId?: string,
 *   setName?: string,
 *   damage1hDisplay?: string,
 *   damage2hDisplay?: string,
 *   throwDamageDisplay?: string,
 *   defenseDisplay?: string,
 * }} ItemDef
 * @typedef {{ id: string, name: string, bonuses: Array<{ required: number|string, modifiers: string[] }> }} SetDef
 * @typedef {{
 *   quality: 'magic'|'rare'|'crafted'|'honorific'|'angelic'|'superior'|'normal',
 *   name?: string,
 *   modifiers: string[],
 *   reqLevel?: number,
 *   reqStr?: number,
 *   reqDex?: number,
 *   defenseDisplay?: string,
 *   damage1hDisplay?: string,
 *   damage2hDisplay?: string,
 *   throwDamageDisplay?: string,
 *   sockets?: number,
 *   ethereal?: boolean,
 * }} CustomItemPayload
 * @typedef {{
 *   defId: string,
 *   icon: string,
 *   rolls?: Record<string, number>,
 *   custom?: CustomItemPayload,
 *   extras?: string[],
 *   mysticOrbs?: Array<[number, string]>,
 *   socketables?: import('@/items/socketables.js').SocketableEntry[],
 *   ethereal?: boolean,
 *   corrupted?: boolean,
 *   oil?: string,
 *   corruptions?: string[],
 *   blessing?: string,
 *   shrine?: string,
 *   mechanics?: Record<string, number>,
 *   randomElement?: string,
 *   name?: string,
 * }} ItemInstance
 * @typedef {{
 *   defId: string,
 *   icon?: string,
 *   rolls?: Record<string, number>,
 *   custom?: CustomItemPayload,
 *   extras?: string[],
 *   mysticOrbs?: Array<[number, string]>,
 *   socketables?: import('@/items/socketables.js').SocketableEntry[],
 *   ethereal?: boolean,
 *   corrupted?: boolean,
 *   oil?: string,
 *   corruptions?: string[],
 *   blessing?: string,
 *   shrine?: string,
 *   mechanics?: Record<string, number>,
 *   randomElement?: string,
 *   name?: string,
 * }} ItemSnapshotEntry
 * @typedef {{
 *   weaponSet: 0|1,
 *   equipment: Record<string, string|ItemSnapshotEntry|null>,
 *   inventory: Array<{ slot: number } & ItemSnapshotEntry>,
 *   charms: Array<{ defId: string, rolls?: Record<string, number> }>,
 *   relics: Array<{ defId: string, rolls?: Record<string, number> }>,
 *   customJewels?: Array<{ id: string, name: string, modifiers: string[], rarity?: string }>,
 * }} ItemsSnapshot
 */

/**
 * Whether a toSnapshot() result should be stored on a saved build.
 * @param {Partial<ItemsSnapshot>|null|undefined} snap
 * @returns {boolean}
 */
/**
 * @param {ItemInstance|null|undefined} inst
 * @returns {ItemSnapshotEntry|string|null}
 */
/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseExtrasList(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  for (const line of raw) {
    const text = String(line || '').trim();
    if (!text || isTswSocketedRuneDump(text)) continue;
    out.push(text);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Array<[number, string]>}
 */
function parseMysticOrbsList(raw) {
  return normalizeMysticOrbs(raw);
}

/**
 * @param {unknown} raw
 * @returns {import('@/items/socketables.js').SocketableEntry[]}
 */
function parseSocketablesList(raw) {
  return normalizeSocketables(raw);
}

/**
 * @param {ItemInstance|null|undefined} inst
 * @param {{
 *   extras?: string[]|null,
 *   mysticOrbs?: Array<[number, string]>|null,
 *   socketables?: import('@/items/socketables.js').SocketableEntry[]|null,
 *   ethereal?: boolean,
 *   corrupted?: boolean,
 *   name?: string|null,
 * }|null|undefined} meta
 */
function applyInstanceMeta(inst, meta) {
  if (!inst || !meta || typeof meta !== 'object') return;
  const extras = parseExtrasList(meta.extras);
  if (extras.length) inst.extras = extras;
  else delete inst.extras;
  const mysticOrbs = parseMysticOrbsList(meta.mysticOrbs);
  if (mysticOrbs.length) inst.mysticOrbs = mysticOrbs;
  else delete inst.mysticOrbs;
  const socketables = parseSocketablesList(meta.socketables);
  if (socketables.length) inst.socketables = socketables;
  else delete inst.socketables;
  const oil = meta.oil != null ? String(meta.oil).trim() : '';
  if (oil) inst.oil = oil;
  else delete inst.oil;
  const corruptions = normalizeCorruptions(meta.corruptions);
  if (corruptions.length) inst.corruptions = corruptions;
  else delete inst.corruptions;
  const blessing = meta.blessing != null ? String(meta.blessing).trim() : '';
  if (blessing) inst.blessing = blessing;
  else delete inst.blessing;
  const shrine = meta.shrine != null ? String(meta.shrine).trim() : '';
  if (shrine) inst.shrine = shrine;
  else delete inst.shrine;
  if (meta.mechanics && typeof meta.mechanics === 'object' && !Array.isArray(meta.mechanics)) {
    /** @type {Record<string, number>} */
    const mechanics = {};
    for (const [k, v] of Object.entries(meta.mechanics)) {
      const n = Number(v);
      if (Number.isFinite(n)) mechanics[k] = n;
    }
    if (Object.keys(mechanics).length) inst.mechanics = mechanics;
    else delete inst.mechanics;
  } else {
    delete inst.mechanics;
  }
  const flags = getItemUpgradeFlags({
    oil: inst.oil,
    corruptions: inst.corruptions,
    blessing: inst.blessing,
    shrine: inst.shrine,
    mysticOrbs: inst.mysticOrbs,
  });
  if (meta.ethereal === true || flags.etherealForced) inst.ethereal = true;
  else delete inst.ethereal;
  if (meta.corrupted === true || flags.corrupted) inst.corrupted = true;
  else delete inst.corrupted;
  const randomElement = normalizeRandomElement(meta.randomElement);
  if (randomElement) inst.randomElement = randomElement;
  else delete inst.randomElement;
  const name = meta.name != null ? String(meta.name).trim() : '';
  if (name) inst.name = name;
  else delete inst.name;
}

/**
 * Stable id → def map. Rebuilt when catalog / runtime overlays change (not on every getter read).
 * @param {ItemDef[]} catalog
 * @param {ItemDef[]} runtimeOverlayDefs
 * @returns {Record<string, ItemDef>}
 */
function buildCatalogByIdMap(catalog, runtimeOverlayDefs) {
  /** @type {Record<string, ItemDef>} */
  const map = {};
  for (const d of catalog || []) {
    if (!d?.id) continue;
    map[d.id] = d;
    if (d.uniqueKind === 'tiered' && Number(d.tier) === 4 && typeof d.id === 'string') {
      const alias = d.id.replace(/:4$/, '');
      if (alias.endsWith(':tu') && map[alias] == null) map[alias] = d;
    }
  }
  for (const d of runtimeOverlayDefs || []) {
    if (d?.id) map[d.id] = d;
  }
  return map;
}

function snapshotInstanceEntry(inst) {
  const defId = inst?.defId;
  if (!defId) return null;
  const hasIcon = Boolean(inst.icon);
  const hasRolls = Boolean(inst.rolls && Object.keys(inst.rolls).length);
  const custom = parseCustomPayload(inst.custom);
  const extras = parseExtrasList(inst?.extras);
  const mysticOrbs = parseMysticOrbsList(inst?.mysticOrbs);
  const socketables = parseSocketablesList(inst?.socketables);
  const ethereal = inst?.ethereal === true;
  const corrupted = inst?.corrupted === true;
  const oil = inst?.oil != null ? String(inst.oil).trim() : '';
  const corruptions = normalizeCorruptions(inst?.corruptions);
  const blessing = inst?.blessing != null ? String(inst.blessing).trim() : '';
  const shrine = inst?.shrine != null ? String(inst.shrine).trim() : '';
  const mechanics =
    inst?.mechanics && typeof inst.mechanics === 'object' ? { ...inst.mechanics } : null;
  const name = inst?.name != null ? String(inst.name).trim() : '';
  const randomElement = normalizeRandomElement(inst?.randomElement);
  if (
    !hasIcon &&
    !hasRolls &&
    !custom &&
    !extras.length &&
    !mysticOrbs.length &&
    !socketables.length &&
    !ethereal &&
    !corrupted &&
    !oil &&
    !corruptions.length &&
    !blessing &&
    !shrine &&
    !mechanics &&
    !randomElement &&
    !name
  ) {
    return defId;
  }
  /** @type {ItemSnapshotEntry} */
  const entry = { defId };
  if (hasIcon) entry.icon = inst.icon;
  if (hasRolls) entry.rolls = { ...inst.rolls };
  if (custom) entry.custom = custom;
  if (extras.length) entry.extras = extras;
  if (mysticOrbs.length) entry.mysticOrbs = mysticOrbs;
  if (socketables.length) entry.socketables = socketables;
  if (ethereal) entry.ethereal = true;
  if (corrupted) entry.corrupted = true;
  if (oil) entry.oil = oil;
  if (corruptions.length) entry.corruptions = corruptions;
  if (blessing) entry.blessing = blessing;
  if (shrine) entry.shrine = shrine;
  if (mechanics && Object.keys(mechanics).length) entry.mechanics = mechanics;
  if (randomElement) entry.randomElement = randomElement;
  if (name) entry.name = name;
  return entry;
}

export function itemsSnapshotHasState(snap) {
  if (!snap || typeof snap !== 'object') return false;
  if (snap.weaponSet === 1) return true;
  const equipment = snap.equipment;
  if (equipment && typeof equipment === 'object' && Object.values(equipment).some((v) => v != null)) {
    return true;
  }
  if (Array.isArray(snap.inventory) && snap.inventory.length > 0) return true;
  if (Array.isArray(snap.charms) && snap.charms.length > 0) return true;
  if (Array.isArray(snap.relics) && snap.relics.length > 0) return true;
  return false;
}

export const useItemsStore = defineStore('items', {
  state: () => ({
    /** @type {ItemDef[]} */
    catalog: [],
    /** @type {SetDef[]} */
    sets: [],
    catalogLoaded: false,
    /** Version folder the catalog was fetched for, e.g. `"2_14"`. */
    catalogVersionFolder: /** @type {string|null} */ (null),
    /**
     * Merged runeword defs (`rw:name:baseId`) created at equip/load time.
     * @type {ItemDef[]}
     */
    runtimeOverlayDefs: [],
    /**
     * Persisted catalog id lookup (rebuilt on catalog / overlay changes).
     * @type {Record<string, ItemDef>}
     */
    catalogByIdMap: {},
    /** @type {Record<number, ItemInstance>} */
    instances: {},
    nextInstanceId: 1,
    /** @type {Record<string, number|null>} */
    equipment: emptyEquipment(),
    /** @type {(number|null)[]} */
    inventory: emptyInventory(),
    /**
     * Enabled dungeon charms (defId → instance id). Not placed on the inventory grid.
     * @type {Record<string, number>}
     */
    enabledCharms: {},
    /**
     * Enabled relics (defId → instance id). Cap: MAX_RELICS. Not on the inventory grid.
     * @type {Record<string, number>}
     */
    enabledRelics: {},
    /**
     * Planner class used to filter class-restricted charms/relics.
     * Kept in store state so catalog getters stay reactive across class swaps.
     * @type {string|null}
     */
    viewerClassName: null,
    /** @type {0|1} */
    weaponSet: /** @type {0|1} */ (0),
    /** @type {SlotRef|null} */
    selectedSlot: null,
    /** @type {number|null} */
    editingInstanceId: null,
    /**
     * Active HTML5 drag (getData unavailable during dragover).
     * @type {{ instanceId: number, from: SlotRef }|null}
     */
    dragPayload: null,
    /**
     * User-crafted jewels available to socket.
     * @type {Array<{ id: string, name: string, modifiers: string[] }>}
     */
    customJewels: [],
  }),

  getters: {
    isPickerOpen(state) {
      const loc = state.selectedSlot?.location;
      if (loc === 'charms' || loc === 'relics') return false;
      return state.selectedSlot != null && state.editingInstanceId == null;
    },

    isModifyOpen(state) {
      const loc = state.selectedSlot?.location;
      if (loc === 'charms' || loc === 'relics') {
        return state.selectedSlot != null && state.editingInstanceId != null;
      }
      return state.selectedSlot != null && state.editingInstanceId != null;
    },

    /**
     * @returns {(id: number) => { invWidth: number, invHeight: number }|null}
     */
    getInstanceSize() {
      return (id) => {
        const inst = this.instances[id];
        if (!inst) return null;
        const def = this.catalogById[inst.defId];
        if (!def) return null;
        return { invWidth: def.invWidth || 1, invHeight: def.invHeight || 1 };
      };
    },

    /** @returns {Record<string, ItemDef>} */
    catalogById(state) {
      // Production always keeps catalogByIdMap in sync. Fallback covers unit tests that
      // assign `catalog` without rebuilding the map.
      if (
        Object.keys(state.catalogByIdMap).length === 0 &&
        Array.isArray(state.catalog) &&
        state.catalog.length > 0
      ) {
        return buildCatalogByIdMap(state.catalog, state.runtimeOverlayDefs);
      }
      return state.catalogByIdMap;
    },

    /** @returns {Record<string, SetDef>} */
    setsById(state) {
      /** @type {Record<string, SetDef>} */
      const map = {};
      for (const s of state.sets) map[s.id] = s;
      return map;
    },

    placedInventoryItems() {
      return listPlacedItems(this.inventory, this.getInstanceSize);
    },

    /**
     * Equipped item defs for the active weapon set (and always-on slots).
     * @returns {ItemDef[]}
     */
    equippedDefs() {
      /** @type {ItemDef[]} */
      const out = [];
      for (const slot of EQUIPMENT_SLOTS) {
        if (!isActiveWeaponSetSlot(slot, this.weaponSet)) continue;
        const id = this.equipment[slot];
        if (id == null) continue;
        const def = this.getDefForInstance(id);
        if (def) out.push(def);
      }
      return out;
    },

    /**
     * Equipped defs whose level/str/dex requirements the character meets.
     * Inactive weapon-set slots are excluded.
     * @returns {ItemDef[]}
     */
    activeEquippedDefs() {
      /** @type {ItemDef[]} */
      const out = [];
      for (const slot of EQUIPMENT_SLOTS) {
        if (!this.equipmentSlotContributesBonuses(slot)) continue;
        const id = this.equipment[slot];
        if (id == null) continue;
        const def = this.getDefForInstance(id);
        if (def) out.push(def);
      }
      return out;
    },

    /**
     * Defs valid for the currently selected slot.
     * @returns {ItemDef[]}
     */
    pickerCatalog() {
      const sel = this.selectedSlot;
      if (!sel) return this.catalog;
      if (sel.location === 'equipment') {
        // List every item that fits the slot. Class restrictions only block Add/equip.
        // Jewels/socketables are inventory-only and must not appear in gear-slot lists.
        const slot = String(sel.slot);
        const otherHandDef = this.otherHandDefForEquip(slot);
        const className = this.viewerClassName;
        const equipOpts = this.equipCheckOptions(slot);
        const fits = (item, s, cls) =>
          canEquipInSlot(item, s, cls, { ...equipOpts, otherHandDef, className });
        return this.catalog.filter((d) => {
          if (isInventoryOnlyGear(d)) return false;
          if (isRunewordTemplate(d)) {
            return runewordFitsEquipSlot(d, slot, this.catalog, undefined, fits);
          }
          return fits(d, slot, undefined);
        });
      }
      if (sel.location === 'inventory') {
        // Charms/relics use dedicated enable lists — not the inventory grid.
        return this.catalog.filter((d) => canPlaceInInventory(d) && !isCharmItem(d) && !isRelicItem(d));
      }
      return this.catalog.filter((d) => canPlaceInInventory(d));
    },

    /** @returns {ItemDef[]} */
    charmCatalog() {
      const className = this.viewerClassName;
      return this.catalog
        .filter((d) => isCharmItem(d) && canEquipForClass(d, className))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    },

    /** @returns {ItemDef[]} */
    relicCatalog() {
      const className = this.viewerClassName;
      return this.catalog
        .filter((d) => isRelicItem(d) && canEquipForClass(d, className))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    },

    /** @returns {number} */
    enabledRelicCount() {
      return Object.keys(this.enabledRelics).length;
    },
    /**
     * Planner class used for equipped-item usability checks.
     * @returns {string|null}
     */
    effectiveViewerClassName() {
      return this.viewerClassName ?? getCharacterInstance()?.className ?? null;
    },

    /** Highest Required Level among active-set gear and enabled charms/relics. */
    maxActiveItemReqLevel() {
      let max = 0;
      const className = this.effectiveViewerClassName;
      const consider = (def, rolls = null, instanceId = null) => {
        if (!def || !canEquipForClass(def, className)) return;
        const req = isCharmItem(def)
          ? getCharmRequiredLevel(def, rolls)
          : instanceId != null
            ? this.getRequirementsForInstance(instanceId)?.reqLevel
            : Number(def.reqLevel);
        if (Number.isFinite(req) && req > max) max = req;
      };
      for (const slot of EQUIPMENT_SLOTS) {
        if (!isActiveWeaponSetSlot(slot, this.weaponSet)) continue;
        const id = this.equipment[slot];
        if (id == null) continue;
        const inst = this.instances[id];
        consider(inst ? this.catalogById[inst.defId] : null, inst?.rolls ?? null, id);
      }
      for (const [defId, instanceId] of Object.entries(this.enabledCharms)) {
        consider(this.catalogById[defId], this.getRollsForInstance(instanceId));
      }
      for (const defId of Object.keys(this.enabledRelics)) {
        consider(this.catalogById[defId]);
      }
      return max;
    },
    /** Highest resolved str/dex requirements among active-set gear and enabled charms/relics. */
    maxActiveItemReqStats() {
      let reqStr = 0;
      let reqDex = 0;
      const className = this.effectiveViewerClassName;
      const consider = (instanceId) => {
        if (instanceId == null) return;
        const def = this.getDefForInstance(instanceId);
        if (!def || !canEquipForClass(def, className)) return;
        const reqs = this.getRequirementsForInstance(instanceId);
        if (!reqs) return;
        if (reqs.reqStr > reqStr) reqStr = reqs.reqStr;
        if (reqs.reqDex > reqDex) reqDex = reqs.reqDex;
      };
      for (const slot of EQUIPMENT_SLOTS) {
        if (!isActiveWeaponSetSlot(slot, this.weaponSet)) continue;
        consider(this.equipment[slot]);
      }
      for (const id of Object.values(this.enabledCharms)) consider(id);
      for (const id of Object.values(this.enabledRelics)) consider(id);
      return { reqStr, reqDex };
    },
    isCatalogCurrent() {
      return (
        this.catalogLoaded &&
        this.catalogVersionFolder === versionToTreeAssetFolder(getCurrentVersion())
      );
    },
  },

  actions: {
    async loadCatalog() {
      const versionFolder = versionToTreeAssetFolder(getCurrentVersion());
      if (this.catalogLoaded && this.catalogVersionFolder === versionFolder) return;
      const inflight = catalogLoadInflight.get(this);
      if (inflight && inflight.folder === versionFolder) return inflight.promise;

      const promise = (async () => {
        const required = ['baseitems.json', 'charms.json', 'other.json'];
        const optional = [
          'relics.json',
          'unique-stats-db.json',
          'runewords.json',
          'socketables.json',
          'mystic-orbs.json',
          'oils.json',
          'corruptions.json',
          'affix-templates.json',
          'item-mechanics.json',
          'blessings.json',
          'shrines.json',
        ];
        try {
          const requiredRes = await Promise.all(
            required.map((file) => fetch(getAssetUrl(`items/${versionFolder}/${file}`)))
          );
          const failed = requiredRes.find((res) => !res?.ok);
          if (failed) throw new Error(`catalog ${failed.status}`);

          const requiredChunks = await Promise.all(requiredRes.map((res) => res.json()));
          /** @type {ItemDef[]} */
          const baseItems = Array.isArray(requiredChunks[0]) ? requiredChunks[0] : [];
          /** @type {ItemDef[]} */
          const charms = (Array.isArray(requiredChunks[1]) ? requiredChunks[1] : []).map(
            (/** @type {ItemDef} */ c) => ({
              ...c,
              type: c.type || 'charm',
              category: c.category || 'charms',
              keepInInventory: true,
              slot: c.slot ?? null,
              invWidth: c.invWidth || 1,
              invHeight: c.invHeight || 1,
              reqStr: c.reqStr ?? 0,
              reqDex: c.reqDex ?? 0,
            })
          );
          /** @type {ItemDef[]} */
          const other = Array.isArray(requiredChunks[2]) ? requiredChunks[2] : [];
          const basesForMatch = [...baseItems, ...other];

          const optionalRes = await Promise.all(
            optional.map((file) => fetchCatalogFile(getAssetUrl(`items/${versionFolder}/${file}`)))
          );
          /** @type {ItemDef[]} */
          let relics = [];
          /** @type {ItemDef[]} */
          let overlays = [];
          /** @type {SetDef[]} */
          let sets = [];
          /** @type {ItemDef[]} */
          let runewords = [];
          const relicsData = await readJsonIfOk(optionalRes[0]);
          if (relicsData) {
            relics = (Array.isArray(relicsData) ? relicsData : []).map((/** @type {ItemDef} */ r) => ({
              ...r,
              type: r.type || 'jewl',
              category: r.category || 'relics',
              rarity: r.rarity || 'relic',
              keepInInventory: true,
              slot: r.slot ?? null,
              invWidth: r.invWidth || 1,
              invHeight: r.invHeight || 1,
              reqStr: r.reqStr ?? 0,
              reqDex: r.reqDex ?? 0,
            }));
          }
          const uniqueStatsData = await readJsonIfOk(optionalRes[1]);
          if (uniqueStatsData) {
            try {
              const built = buildCatalogFromUniqueStats(uniqueStatsData, basesForMatch);
              overlays = built.items;
              sets = built.sets;
            } catch (e) {
              console.warn('Failed to build unique-stats catalog', e);
            }
          }
          const runewordsData = await readJsonIfOk(optionalRes[2]);
          if (runewordsData) {
            const entries = Array.isArray(runewordsData)
              ? runewordsData
              : /** @type {{ entries?: unknown }} */ (runewordsData).entries || [];
            runewords = (Array.isArray(entries) ? entries : [])
              .map(runewordEntryToItemDef)
              .filter(Boolean);
          }
          const socketablesData = await readJsonIfOk(optionalRes[3]);
          loadSocketablesCatalog(Array.isArray(socketablesData) ? socketablesData : []);
          const mysticOrbsData = await readJsonIfOk(optionalRes[4]);
          loadMysticOrbsCatalog(Array.isArray(mysticOrbsData) ? mysticOrbsData : []);
          loadOilsCatalog(await readJsonIfOk(optionalRes[5]));
          loadCorruptionsCatalog(await readJsonIfOk(optionalRes[6]));
          loadAffixTemplates(await readJsonIfOk(optionalRes[7]));
          loadItemMechanics(await readJsonIfOk(optionalRes[8]));
          loadHonorificBlessings(await readJsonIfOk(optionalRes[9]));
          loadShrinesCatalog(await readJsonIfOk(optionalRes[10]));

          this.catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics, ...runewords];
          mergeJewelItemsIntoSocketablesCatalog(this.catalog);
          this.sets = sets;
          this.runtimeOverlayDefs = [];
          this.catalogByIdMap = buildCatalogByIdMap(this.catalog, this.runtimeOverlayDefs);
          this.catalogVersionFolder = versionFolder;
          this.catalogLoaded = true;
        } catch (e) {
          console.error('Failed to load item catalog', e);
          // Leave a previous catalog in place. Only mark empty+loaded when nothing was loaded yet,
          // so import can retry instead of mapping against a sticky empty catalog.
          if (!this.catalogLoaded) {
            this.catalog = [];
            this.sets = [];
            this.runtimeOverlayDefs = [];
            this.catalogByIdMap = {};
            this.catalogVersionFolder = null;
            this.catalogLoaded = false;
          }
        }
      })();

      catalogLoadInflight.set(this, { folder: versionFolder, promise });
      try {
        await promise;
      } finally {
        const cur = catalogLoadInflight.get(this);
        if (cur && cur.promise === promise) catalogLoadInflight.delete(this);
      }
    },

    /** @param {0|1} set */
    setWeaponSet(set) {
      this.weaponSet = set === 1 ? 1 : 0;
    },

    /**
     * Raise planner level to cover equipped/enabled item requirements.
     * @returns {boolean}
     */
    syncCharacterLevelToItemReqs() {
      if (skipItemReqLevelSync) return false;
      return raiseCharacterLevelForItemReq({ reqLevel: this.maxActiveItemReqLevel });
    },

    /**
     * Raise planner str/dex to cover equipped/enabled item requirements (when option enabled).
     * @returns {boolean}
     */
    syncCharacterStatsToItemReqs() {
      if (skipItemReqLevelSync) return false;
      if (!getPlannerAutoMatchHighestStatRequirements()) return false;
      return raiseCharacterStatsForItemReq(this.maxActiveItemReqStats);
    },

    /**
     * Raise planner level and (optionally) str/dex for active item requirements.
     * @returns {boolean}
     */
    syncCharacterToItemReqs() {
      const levelChanged = this.syncCharacterLevelToItemReqs();
      const statsChanged = this.syncCharacterStatsToItemReqs();
      return levelChanged || statsChanged;
    },

    /**
     * Character attributes used for item requirement checks.
     * @returns {{ level: number|null, strength: number|null, dexterity: number|null }}
     */
    getCharacterRequirementStats() {
      const ch = getCharacterInstance();
      if (!ch) return { level: null, strength: null, dexterity: null };
      return {
        level: ch.level ?? null,
        strength: typeof ch.getStat === 'function' ? ch.getStat('strength') : null,
        dexterity: typeof ch.getStat === 'function' ? ch.getStat('dexterity') : null,
      };
    },

    /**
     * Resolved requirements for an equipped/inventory instance.
     * @param {number|null|undefined} instanceId
     * @returns {import('@/items/item-requirements.js').ItemRequirements|null}
     */
    getRequirementsForInstance(instanceId) {
      if (instanceId == null) return null;
      const def = this.getDefForInstance(instanceId);
      if (!def) return null;
      return resolveItemRequirements(def, {
        rolls: this.getRollsForInstance(instanceId),
        extras: this.getExtrasForInstance(instanceId),
        socketables: this.getSocketablesForInstance(instanceId),
        mysticOrbs: this.getMysticOrbsForInstance(instanceId),
        corruptions: this.instances[instanceId]?.corruptions,
      });
    },

    /**
     * Whether an equipment slot's item is active (class + level/str/dex + quiver pairing).
     * Empty slots count as met. Quivers are inactive without a matching bow/crossbow.
     * @param {string} slot
     * @returns {boolean}
     */
    equipmentSlotMeetsRequirements(slot) {
      const key = String(slot);
      const id = this.equipment[key];
      if (id == null) return true;
      const def = this.getDefForInstance(id);
      if (!def) return true;
      const className = this.effectiveViewerClassName;
      if (!canEquipForClass(def, className)) return false;
      const reqs = this.getRequirementsForInstance(id);
      const stats = this.getCharacterRequirementStats();
      if (!characterMeetsItemRequirements(reqs, stats)) return false;
      if (isQuiverItem(def)) {
        const otherSlot = pairedWeaponSlot(key);
        if (!otherSlot) return false;
        const otherId = this.equipment[otherSlot];
        if (otherId == null) return false;
        const otherDef = this.getDefForInstance(otherId);
        if (!isQuiverEffectActive(def, otherDef)) return false;
        // Partner must also meet its own requirements to "count" as equipped.
        if (!canEquipForClass(otherDef, className)) return false;
        const otherReqs = this.getRequirementsForInstance(otherId);
        if (!characterMeetsItemRequirements(otherReqs, stats)) return false;
      }
      return true;
    },

    /**
     * Whether an equipment slot applies bonuses to the character
     * (active weapon set + requirements met).
     * @param {string} slot
     * @returns {boolean}
     */
    equipmentSlotContributesBonuses(slot) {
      if (!isActiveWeaponSetSlot(slot, this.weaponSet)) return false;
      return this.equipmentSlotMeetsRequirements(slot);
    },

    /**
     * Why an equipped item is inactive for UI notices (class / quiver), or null.
     * Level/str/dex failures are shown via the requirements line instead.
     * @param {string} slot
     * @returns {string|null}
     */
    equipmentSlotInactiveReason(slot) {
      const key = String(slot);
      const id = this.equipment[key];
      if (id == null) return null;
      const def = this.getDefForInstance(id);
      if (!def) return null;
      const classReason = classEquipBlockedReason(def, this.effectiveViewerClassName);
      if (classReason) return classReason;
      return this.quiverInactiveReasonForSlot(key);
    },

    /**
     * Why an equipped quiver is inactive, or null when active / not a quiver.
     * @param {string} slot
     * @returns {string|null}
     */
    quiverInactiveReasonForSlot(slot) {
      const key = String(slot);
      const id = this.equipment[key];
      if (id == null) return null;
      const def = this.getDefForInstance(id);
      if (!isQuiverItem(def)) return null;
      if (this.equipmentSlotMeetsRequirements(key)) return null;
      // Class / level / str / dex failures are not quiver-pairing messages.
      if (!canEquipForClass(def, this.effectiveViewerClassName)) return null;
      const reqs = this.getRequirementsForInstance(id);
      if (!characterMeetsItemRequirements(reqs, this.getCharacterRequirementStats())) return null;
      return QUIVER_INACTIVE_REASON;
    },

    /**
     * Disable charms/relics whose level req exceeds character level.
     * @returns {{
     *   charms: Array<{ name: string, reqLevel: number }>,
     *   relics: Array<{ name: string, reqLevel: number }>,
     * }}
     */
    disableEnabledItemsBelowLevel() {
      /** @type {Array<{ name: string, reqLevel: number }>} */
      const charms = [];
      /** @type {Array<{ name: string, reqLevel: number }>} */
      const relics = [];
      const ch = getCharacterInstance();
      // Without a known character level, keep enables (unit tests / early load).
      // Note: Number(null) === 0, so do not coerce a missing level.
      if (!ch || ch.level == null) return { charms, relics };
      const levelNum = Number(ch.level);
      if (!Number.isFinite(levelNum)) return { charms, relics };

      for (const defId of Object.keys(this.enabledCharms)) {
        const def = this.catalogById[defId];
        const rolls = this.getRollsForInstance(this.enabledCharms[defId]);
        if (!def || charmMeetsLevel(def, levelNum, rolls)) continue;
        charms.push({
          name: String(def.name || defId),
          reqLevel: getCharmRequiredLevel(def, rolls),
        });
        this.toggleCharm(defId, false);
      }
      for (const defId of Object.keys(this.enabledRelics)) {
        const def = this.catalogById[defId];
        if (!def || relicMeetsLevel(def, levelNum)) continue;
        relics.push({
          name: String(def.name || defId),
          reqLevel: Number(def.reqLevel) || 0,
        });
        this.toggleRelic(defId, false);
      }
      return { charms, relics };
    },

    /**
     * Equipped items that fail level/str/dex requirements (for import toasts).
     * @returns {Array<{ name: string, requirementsLine: string }>}
     */
    listUnmetEquippedItems() {
      /** @type {Array<{ name: string, requirementsLine: string }>} */
      const out = [];
      for (const slot of EQUIPMENT_SLOTS) {
        const id = this.equipment[slot];
        if (id == null) continue;
        const def = this.getDefForInstance(id);
        if (!def) continue;
        if (this.equipmentSlotMeetsRequirements(slot)) continue;
        const inactiveReason = this.equipmentSlotInactiveReason(slot);
        if (inactiveReason) {
          out.push({
            name: String(def.name || def.id || slot),
            requirementsLine: inactiveReason,
          });
          continue;
        }
        const reqs = this.getRequirementsForInstance(id);
        const line = formatItemRequirementsLine(reqs).replace(/^Requires:\s*/i, '');
        out.push({
          name: String(def.name || def.id || slot),
          requirementsLine: line || 'requirements not met',
        });
      }
      return out;
    },

    /**
     * @param {SlotRef|null} slot
     * @returns {number|null}
     */
    getInstanceIdAtSlot(slot) {
      if (!slot) return null;
      if (slot.location === 'equipment') {
        return this.equipment[String(slot.slot)] ?? null;
      }
      if (slot.location === 'inventory') {
        const click = Number(slot.slot);
        const anchor = resolveOccupiedCell(this.inventory, click, this.getInstanceSize);
        const idx = anchor >= 0 ? anchor : click;
        return this.inventory[idx] ?? null;
      }
      if (slot.location === 'charms') {
        return this.enabledCharms[String(slot.slot)] ?? null;
      }
      if (slot.location === 'relics') {
        return this.enabledRelics[String(slot.slot)] ?? null;
      }
      return null;
    },

    /** @param {SlotRef|null} slot */
    selectSlot(slot) {
      this.selectedSlot = slot;
      this.editingInstanceId = slot ? this.getInstanceIdAtSlot(slot) : null;
    },

    /**
     * Keep the current slot selected but open the picker (replace item).
     */
    openPicker() {
      if (!this.selectedSlot) return;
      this.editingInstanceId = null;
    },

    clearSelection() {
      this.selectedSlot = null;
      this.editingInstanceId = null;
    },

    /**
     * @param {{ instanceId: number, from: SlotRef }|null} payload
     */
    setDragPayload(payload) {
      this.dragPayload = payload;
    },

    clearDragPayload() {
      this.dragPayload = null;
    },

    /**
     * @param {string} defId
     * @param {string|null|undefined} [icon]
     * @param {Record<string, number>|null|undefined} [rolls]
     * @param {unknown} [custom]
     * @param {{
     *   extras?: string[]|null,
     *   mysticOrbs?: Array<[number, string]>|null,
     *   socketables?: import('@/items/socketables.js').SocketableEntry[]|null,
     *   ethereal?: boolean,
     *   corrupted?: boolean,
     *   name?: string|null,
     * }|null|undefined} [meta]
     * @returns {number}
     */
    createInstance(defId, icon = null, rolls = null, custom = null, meta = null) {
      const id = this.nextInstanceId++;
      const def = this.catalogById[defId];
      /** @type {ItemInstance} */
      const inst = {
        defId,
        icon: pickItemIcon(def, icon),
      };
      if (rolls && typeof rolls === 'object' && Object.keys(rolls).length) {
        inst.rolls = { ...rolls };
      }
      const parsedCustom = parseCustomPayload(custom);
      if (parsedCustom) inst.custom = parsedCustom;
      applyInstanceMeta(inst, meta);
      this.instances[id] = inst;
      return id;
    },

    /**
     * Merge a runeword template with a base and cache the runtime def.
     * @param {string} templateId
     * @param {string} baseId
     * @returns {string|null}
     */
    ensureRunewordDef(templateId, baseId) {
      if (!templateId || !baseId) return null;
      const resolvedTemplateId = resolveRunewordTemplateId(templateId);
      const id = `${resolvedTemplateId}:${baseId}`;
      // Materialize map if tests assigned catalog without rebuilding.
      if (Object.keys(this.catalogByIdMap).length === 0 && this.catalog.length > 0) {
        this.catalogByIdMap = buildCatalogByIdMap(this.catalog, this.runtimeOverlayDefs);
      }
      if (this.catalogByIdMap[id]) return id;
      const merged = mergeRunewordWithBase(
        this.catalogByIdMap[resolvedTemplateId],
        this.catalogByIdMap[baseId]
      );
      if (!merged) return null;
      this.runtimeOverlayDefs = [...this.runtimeOverlayDefs, merged];
      // Incremental map update — avoid rescanning the full unique catalog.
      this.catalogByIdMap = { ...this.catalogByIdMap, [merged.id]: merged };
      return merged.id;
    },

    /**
     * @param {number} instanceId
     * @returns {Record<string, number>|null}
     */
    getRollsForInstance(instanceId) {
      const inst = this.instances[instanceId];
      if (!inst?.rolls || typeof inst.rolls !== 'object') return null;
      return inst.rolls;
    },

    /**
     * Extra modifier lines (MOs / jewels / corruption) on an instance.
     * @param {number} instanceId
     * @returns {string[]}
     */
    getExtrasForInstance(instanceId) {
      const inst = this.instances[instanceId];
      return parseExtrasList(inst?.extras);
    },

    /**
     * Applied mystic orbs on an instance (`[count, name]` tuples).
     * @param {number} instanceId
     * @returns {Array<[number, string]>}
     */
    getMysticOrbsForInstance(instanceId) {
      const inst = this.instances[instanceId];
      return parseMysticOrbsList(inst?.mysticOrbs);
    },

    /**
     * Socket fillers (jewels / runes / gems) on an instance.
     * @param {number} instanceId
     * @returns {import('@/items/socketables.js').SocketableEntry[]}
     */
    getSocketablesForInstance(instanceId) {
      const inst = this.instances[instanceId];
      return parseSocketablesList(inst?.socketables);
    },

    /**
     * Crafting fields used by tooltip/stat merge.
     * @param {number} instanceId
     */
    getUpgradeStateForInstance(instanceId) {
      const inst = this.instances[instanceId];
      const def = this.getDefForInstance(instanceId);
      return {
        oil: inst?.oil || '',
        corruptions: normalizeCorruptions(inst?.corruptions),
        blessing: inst?.blessing || '',
        shrine: inst?.shrine || '',
        mechanics: inst?.mechanics || null,
        honorific: def?.rarity === 'honorific' || def?.customQuality === 'honorific',
        mysticOrbs: this.getMysticOrbsForInstance(instanceId),
      };
    },

    /**
     * @param {number} instanceId
     */
    getItemBonusOptionsForInstance(instanceId) {
      const upgrades = this.getUpgradeStateForInstance(instanceId);
      return {
        extras: this.getExtrasForInstance(instanceId),
        mysticOrbs: this.getMysticOrbsForInstance(instanceId),
        socketables: this.getSocketablesForInstance(instanceId),
        oil: upgrades.oil || null,
        corruptions: upgrades.corruptions,
        blessing: upgrades.blessing || null,
        shrine: upgrades.shrine || null,
        mechanics: upgrades.mechanics,
        honorific: upgrades.honorific,
      };
    },

    /**
     * @param {number} instanceId
     * @param {Record<string, number>|null|undefined} rolls
     * @returns {boolean}
     */
    updateInstanceRolls(instanceId, rolls) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      if (rolls && typeof rolls === 'object' && Object.keys(rolls).length) {
        inst.rolls = { ...rolls };
      } else {
        delete inst.rolls;
      }
      const def = this.getDefForInstance(instanceId);
      if (def) {
        const cap = getItemSocketCount(def, inst.rolls ?? null);
        const cur = parseSocketablesList(inst.socketables);
        if (cur.length > cap) {
          const next = trimSocketablesToCount(cur, cap);
          if (next.length) inst.socketables = next;
          else delete inst.socketables;
        }
      }
      const active =
        Object.values(this.equipment).includes(instanceId) ||
        Object.values(this.enabledCharms).includes(instanceId) ||
        Object.values(this.enabledRelics).includes(instanceId);
      if (active) this.syncCharacterToItemReqs();
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {import('@/items/socketables.js').SocketableEntry[]|null|undefined} socketables
     * @returns {boolean}
     */
    updateInstanceSocketables(instanceId, socketables) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = parseSocketablesList(socketables).map((entry, i) => ({
        ...entry,
        slot: i + 1,
      }));
      if (next.length) inst.socketables = next;
      else delete inst.socketables;
      const active =
        Object.values(this.equipment).includes(instanceId) ||
        Object.values(this.enabledCharms).includes(instanceId) ||
        Object.values(this.enabledRelics).includes(instanceId);
      if (active) this.syncCharacterToItemReqs();
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {Array<[number, string]>|null|undefined} mysticOrbs
     * @returns {boolean}
     */
    updateInstanceMysticOrbs(instanceId, mysticOrbs) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = parseMysticOrbsList(mysticOrbs);
      const def = this.getDefForInstance(instanceId);
      const host = {
        shrine: inst.shrine || '',
        blessing: inst.blessing || '',
        extras: this.getExtrasForInstance(instanceId),
      };
      const reqOptions = {
        rolls: this.getRollsForInstance(instanceId),
        extras: this.getExtrasForInstance(instanceId),
        socketables: this.getSocketablesForInstance(instanceId),
        mysticOrbs: next,
        corruptions: inst.corruptions,
      };
      if (
        def &&
        next.some(
          ([count, name]) =>
            !canUseMysticOrbOnItem(name, def, count - 1, host) ||
            !itemAllowsMysticOrbReqLevel(def, reqOptions, name, count)
        )
      ) {
        return false;
      }
      if (
        def &&
        itemRequirementsExceedCharacterLevel(
          def,
          reqOptions,
          getPlannerItemReqLevelCap(this.getCharacterRequirementStats().level)
        )
      ) {
        return false;
      }
      if (next.length) inst.mysticOrbs = next;
      else delete inst.mysticOrbs;
      this.syncInstanceUpgradeFlags(instanceId);
      const active =
        Object.values(this.equipment).includes(instanceId) ||
        Object.values(this.enabledCharms).includes(instanceId) ||
        Object.values(this.enabledRelics).includes(instanceId);
      if (active) this.syncCharacterToItemReqs();
      return true;
    },

    /**
     * @param {number} instanceId
     */
    syncInstanceUpgradeFlags(instanceId) {
      const inst = this.instances[instanceId];
      if (!inst) return;
      const flags = getItemUpgradeFlags({
        oil: inst.oil,
        corruptions: inst.corruptions,
        blessing: inst.blessing,
        shrine: inst.shrine,
        mysticOrbs: inst.mysticOrbs,
      });
      if (flags.etherealForced) inst.ethereal = true;
      if (flags.corrupted) inst.corrupted = true;
      else delete inst.corrupted;
    },

    /**
     * @param {number} instanceId
     * @param {string|null|undefined} oil
     */
    updateInstanceOil(instanceId, oil) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = String(oil || '').trim();
      if (next) inst.oil = next;
      else delete inst.oil;
      this.syncInstanceUpgradeFlags(instanceId);
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {string[]|null|undefined} corruptions
     */
    updateInstanceCorruptions(instanceId, corruptions) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = normalizeCorruptions(corruptions);
      if (next.length) inst.corruptions = next;
      else delete inst.corruptions;
      this.syncInstanceUpgradeFlags(instanceId);
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {string|null|undefined} blessing
     */
    updateInstanceBlessing(instanceId, blessing) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = String(blessing || '').trim();
      if (next) inst.blessing = next;
      else delete inst.blessing;
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {string|null|undefined} shrine
     */
    updateInstanceShrine(instanceId, shrine) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = String(shrine || '').trim();
      if (next) inst.shrine = next;
      else delete inst.shrine;
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {Record<string, number>|null|undefined} mechanics
     */
    updateInstanceMechanics(instanceId, mechanics) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      if (mechanics && typeof mechanics === 'object' && Object.keys(mechanics).length) {
        inst.mechanics = { ...mechanics };
      } else {
        delete inst.mechanics;
      }
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {string|null|undefined} element
     */
    setInstanceRandomElement(instanceId, element) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const next = normalizeRandomElement(element);
      if (next) inst.randomElement = next;
      else delete inst.randomElement;
      return true;
    },

    setInstanceEthereal(instanceId, ethereal) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const flags = getItemUpgradeFlags({
        oil: inst.oil,
        corruptions: inst.corruptions,
        blessing: inst.blessing,
        shrine: inst.shrine,
        mysticOrbs: inst.mysticOrbs,
      });
      if (!ethereal && flags.etherealForced) return false;
      if (ethereal) inst.ethereal = true;
      else delete inst.ethereal;
      return true;
    },

    /**
     * @param {number} instanceId
     * @param {unknown} custom
     */
    updateInstanceCustom(instanceId, custom) {
      const inst = this.instances[instanceId];
      if (!inst) return false;
      const parsed = parseCustomPayload(custom);
      if (parsed) inst.custom = parsed;
      else delete inst.custom;
      return true;
    },

    /**
     * @param {string} baseId
     * @param {'crafted'|'angelic'|'honorific'|'rare'} quality
     * @returns {number|null}
     */
    createCustomInstance(baseId, quality) {
      const def = this.catalogById[baseId];
      if (!def) return null;
      const rarity = quality === 'angelic' ? 'rare' : quality;
      const label = rarity === 'honorific' ? 'Honorific' : rarity === 'rare' ? 'Rare' : 'Crafted';
      let baseLabel = def.baseName || def.name;
      if (quality === 'angelic') baseLabel = angelicBaseDisplayName(def);
      else if (isMastercraftedBaseItem(def)) baseLabel = mastercraftedBaseDisplayName(def);
      const custom = {
        quality: rarity,
        name: `${label} ${baseLabel}`,
        modifiers: [],
        sockets: Number(def.sockets) || 0,
      };
      if (quality === 'angelic') custom.angelic = true;
      const rolls = Number(def.sockets) > 0 ? { sockets: Number(def.sockets) } : null;
      return this.createInstance(baseId, def.icon, rolls, custom);
    },

    /**
     * @param {{ name?: string, modifiers?: string[], rarity?: string }} jewel
     */
    addCustomJewel(jewel) {
      const id = `cj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const name = String(jewel?.name || 'Custom Jewel').trim() || 'Custom Jewel';
      const modifiers = Array.isArray(jewel?.modifiers)
        ? jewel.modifiers.map((l) => String(l || '').trim()).filter(Boolean)
        : [];
      const rarity = normalizeCustomJewelRarity(jewel?.rarity);
      this.customJewels = [...this.customJewels, { id, name, modifiers, rarity }];
      return id;
    },

    /**
     * @param {string} id
     * @param {{ name?: string, modifiers?: string[], rarity?: string }} patch
     */
    updateCustomJewel(id, patch) {
      let nextJewel = null;
      this.customJewels = this.customJewels.map((row) => {
        if (row.id !== id) return row;
        nextJewel = {
          ...row,
          name: patch.name != null ? String(patch.name).trim() || row.name : row.name,
          modifiers: Array.isArray(patch.modifiers)
            ? patch.modifiers.map((l) => String(l || '').trim()).filter(Boolean)
            : row.modifiers,
          rarity: patch.rarity != null ? normalizeCustomJewelRarity(patch.rarity) : normalizeCustomJewelRarity(row.rarity),
        };
        return nextJewel;
      });
      if (!nextJewel) return;
      const quality = nextJewel.rarity.charAt(0).toUpperCase() + nextJewel.rarity.slice(1);
      const nextInstances = { ...this.instances };
      let changed = false;
      for (const [key, inst] of Object.entries(nextInstances)) {
        if (!inst || !Array.isArray(inst.socketables)) continue;
        let sockChanged = false;
        const socketables = inst.socketables.map((sock) => {
          if (!sock || sock.code !== id) return sock;
          sockChanged = true;
          return {
            ...sock,
            name: nextJewel.name,
            modifiers: nextJewel.modifiers,
            quality,
            type: 'Jewel',
          };
        });
        if (!sockChanged) continue;
        nextInstances[key] = { ...inst, socketables };
        changed = true;
      }
      if (changed) this.instances = nextInstances;
    },

    /**
     * @param {string} id
     */
    removeCustomJewel(id) {
      this.customJewels = this.customJewels.filter((row) => row.id !== id);
    },

    /**
     * @param {number} instanceId
     */
    destroyInstanceIfOrphaned(instanceId) {
      if (Object.values(this.equipment).includes(instanceId)) return;
      if (this.inventory.includes(instanceId)) return;
      if (Object.values(this.enabledCharms).includes(instanceId)) return;
      if (Object.values(this.enabledRelics).includes(instanceId)) return;
      delete this.instances[instanceId];
    },

    /**
     * Whether a charm/relic defId is currently enabled.
     * @param {'charms'|'relics'} kind
     * @param {string} defId
     * @returns {boolean}
     */
    isEnabled(kind, defId) {
      if (!defId) return false;
      if (kind === 'charms') return this.enabledCharms[defId] != null;
      if (kind === 'relics') return this.enabledRelics[defId] != null;
      return false;
    },

    /**
     * Select an enabled charm/relic for the inspector (no-op if not enabled).
     * @param {'charms'|'relics'} kind
     * @param {string} defId
     * @returns {boolean}
     */
    selectEnabledItem(kind, defId) {
      if (kind !== 'charms' && kind !== 'relics') return false;
      const map = kind === 'charms' ? this.enabledCharms : this.enabledRelics;
      const instanceId = map[defId];
      this.selectedSlot = { location: kind, slot: defId };
      this.editingInstanceId = instanceId != null ? instanceId : null;
      return instanceId != null;
    },

    /**
     * Enable or disable a dungeon charm.
     * @param {string} defId
     * @param {boolean} enabled
     * @param {Record<string, number>|null|undefined} [rolls] - seed rolls when creating
     * @param {{ select?: boolean }} [options] - select:false skips inspector (build load)
     * @returns {boolean}
     */
    toggleCharm(defId, enabled, rolls = null, options = {}) {
      const def = this.catalogById[defId];
      if (!def || !isCharmItem(def)) return false;
      const className = this.viewerClassName;
      if (enabled && !canEquipForClass(def, className)) return false;
      const existing = this.enabledCharms[defId];
      const shouldSelect = options?.select !== false;
      if (enabled) {
        if (existing != null) {
          if (shouldSelect) this.selectEnabledItem('charms', defId);
          return true;
        }
        // Only one Dimensional Key base may be active.
        if (isDimensionalKeyCharm(def)) {
          for (const otherId of Object.keys(this.enabledCharms)) {
            if (otherId === defId) continue;
            const other = this.catalogById[otherId];
            if (other && isDimensionalKeyCharm(other)) this.toggleCharm(otherId, false);
          }
        }
        const id = this.createInstance(defId, null, rolls);
        this.enabledCharms = { ...this.enabledCharms, [defId]: id };
        if (shouldSelect) this.selectEnabledItem('charms', defId);
        this.syncCharacterToItemReqs();
        return true;
      }
      if (existing == null) return true;
      const next = { ...this.enabledCharms };
      delete next[defId];
      this.enabledCharms = next;
      // Keep the row selected for preview; only drop the instance link.
      if (this.selectedSlot?.location === 'charms' && String(this.selectedSlot.slot) === defId) {
        this.editingInstanceId = null;
      }
      this.destroyInstanceIfOrphaned(existing);
      return true;
    },

    /**
     * Enable every charm in the catalog (idempotent for already-enabled).
     * Batches store writes so Vue only reacts once. At most one Dimensional Key.
     * @returns {number} How many newly enabled
     */
    enableAllCharms() {
      /** @type {Record<string, number>} */
      const nextEnabled = { ...this.enabledCharms };
      /** @type {Record<number, { defId: string, icon: string, rolls?: Record<string, number> }>} */
      const nextInstances = { ...this.instances };
      let nextId = this.nextInstanceId;
      let added = 0;
      let hasDimensionalKey = Object.keys(nextEnabled).some((id) =>
        isDimensionalKeyCharm(this.catalogById[id])
      );
      for (const def of this.charmCatalog) {
        const upgradeRolls = Object.fromEntries(
          getCharmUpgradeEntries(def, this.viewerClassName).map((entry) => [entry.key, 1])
        );
        const existingId = nextEnabled[def.id];
        if (existingId != null) {
          if (Object.keys(upgradeRolls).length && nextInstances[existingId]) {
            nextInstances[existingId] = {
              ...nextInstances[existingId],
              rolls: { ...nextInstances[existingId].rolls, ...upgradeRolls },
            };
          }
          continue;
        }
        if (isDimensionalKeyCharm(def)) {
          if (hasDimensionalKey) continue;
          hasDimensionalKey = true;
        }
        const id = nextId++;
        nextInstances[id] = {
          defId: def.id,
          icon: pickItemIcon(def),
          ...(Object.keys(upgradeRolls).length ? { rolls: upgradeRolls } : {}),
        };
        nextEnabled[def.id] = id;
        added += 1;
      }
      if (!added) return 0;
      this.nextInstanceId = nextId;
      this.instances = nextInstances;
      this.enabledCharms = nextEnabled;
      this.syncCharacterToItemReqs();
      return added;
    },

    /**
     * Sync viewer class from the planner character and drop incompatible enables.
     * @param {string|null|undefined} [className]
     * @returns {number} How many enables were pruned
     */
    syncViewerClassName(className = undefined) {
      const next =
        className !== undefined
          ? className == null || className === ''
            ? null
            : String(className)
          : getCharacterInstance()?.className ?? null;
      this.viewerClassName = next;
      return this.pruneClassRestrictedEnableList();
    },

    /**
     * Disable charms/relics that the current class cannot use (e.g. after class swap).
     * @returns {number} How many were disabled
     */
    pruneClassRestrictedEnableList() {
      const className = this.viewerClassName;
      let removed = 0;
      for (const defId of Object.keys(this.enabledCharms)) {
        const def = this.catalogById[defId];
        if (def && canEquipForClass(def, className)) continue;
        this.toggleCharm(defId, false);
        removed += 1;
      }
      for (const defId of Object.keys(this.enabledRelics)) {
        const def = this.catalogById[defId];
        if (def && canEquipForClass(def, className)) continue;
        this.toggleRelic(defId, false);
        removed += 1;
      }
      const sel = this.selectedSlot;
      if (sel?.location === 'charms' || sel?.location === 'relics') {
        const def = this.catalogById[String(sel.slot)];
        if (!def || !canEquipForClass(def, className)) this.clearSelection();
      }
      return removed;
    },

    /**
     * Enable or disable a relic (max MAX_RELICS).
     * @param {string} defId
     * @param {boolean} enabled
     * @param {Record<string, number>|null|undefined} [rolls] - seed rolls when creating
     * @returns {boolean}
     */
    toggleRelic(defId, enabled, rolls = null) {
      const def = this.catalogById[defId];
      if (!def || !isRelicItem(def)) return false;
      const className = this.viewerClassName;
      if (enabled && !canEquipForClass(def, className)) return false;
      const existing = this.enabledRelics[defId];
      if (enabled) {
        if (existing != null) {
          this.selectEnabledItem('relics', defId);
          return true;
        }
        if (Object.keys(this.enabledRelics).length >= MAX_RELICS) return false;
        const id = this.createInstance(defId, null, rolls);
        this.enabledRelics = { ...this.enabledRelics, [defId]: id };
        this.selectEnabledItem('relics', defId);
        this.syncCharacterToItemReqs();
        return true;
      }
      if (existing == null) return true;
      const next = { ...this.enabledRelics };
      delete next[defId];
      this.enabledRelics = next;
      // Keep the row selected for preview; only drop the instance link.
      if (this.selectedSlot?.location === 'relics' && String(this.selectedSlot.slot) === defId) {
        this.editingInstanceId = null;
      }
      this.destroyInstanceIfOrphaned(existing);
      return true;
    },

    /**
     * @param {string} slot
     * @returns {ItemDef|null}
     */
    getEquipmentDef(slot) {
      const id = this.equipment[slot];
      if (id == null) return null;
      return this.getDefForInstance(id);
    },

    /**
     * Item occupying the paired weapon/off-hand slot.
     * When moving from that pair onto `toSlot`, the destination occupant is the other hand (swap).
     * @param {string} toSlot
     * @param {SlotRef|null} [fromRef]
     * @returns {ItemDef|null}
     */
    otherHandDefForEquip(toSlot, fromRef = null) {
      const pair = pairedWeaponSlot(String(toSlot));
      if (!pair) return null;
      if (fromRef?.location === 'equipment' && String(fromRef.slot) === pair) {
        return this.getEquipmentDef(String(toSlot));
      }
      return this.getEquipmentDef(pair);
    },

    /**
     * Slot-fit options, including unique set-piece checks.
     * @param {string} slot
     * @param {SlotRef|null} [fromRef]
     * @returns {{ otherHandDef: ItemDef|null, equippedDefs: ItemDef[], ignoreSetPieceKeys: string[] }}
     */
    equipCheckOptions(slot, fromRef = null) {
      /** @type {string[]} */
      const ignoreSetPieceKeys = [];
      const currentKey = setItemPieceKey(this.getEquipmentDef(slot));
      if (currentKey) ignoreSetPieceKeys.push(currentKey);
      if (fromRef?.location === 'equipment') {
        const fromKey = setItemPieceKey(this.getEquipmentDef(String(fromRef.slot)));
        if (fromKey) ignoreSetPieceKeys.push(fromKey);
      }
      return {
        otherHandDef: this.otherHandDefForEquip(slot, fromRef),
        equippedDefs: this.equippedDefs,
        ignoreSetPieceKeys,
      };
    },

    /**
     * @param {string} slot
     * @returns {number|null}
     */
    getEquipmentInstanceId(slot) {
      return this.equipment[slot] ?? null;
    },

    /**
     * @param {number} instanceId
     * @returns {ItemDef|null}
     */
    getDefForInstance(instanceId) {
      const inst = this.instances[instanceId];
      if (!inst) return null;
      const def = this.catalogById[inst.defId] ?? null;
      const withCustom = applyCustomOverlayToDef(def, inst.custom);
      if (!withCustom) return null;
      /** @type {Record<string, unknown>} */
      const out = { ...withCustom };
      if (inst.ethereal === true && !withCustom.ethereal) out.ethereal = true;
      if (inst.corrupted === true && !withCustom.corrupted) out.corrupted = true;
      const randomElement = normalizeRandomElement(inst.randomElement);
      if (randomElement) out.randomElement = randomElement;
      const name = inst.name != null ? String(inst.name).trim() : '';
      if (name) {
        out.name = name;
        delete out.classRestriction;
      }
      return out;
    },

    /**
     * Resolved inventory icon stem for a placed instance.
     * @param {number} instanceId
     * @returns {string}
     */
    getIconForInstance(instanceId) {
      const inst = this.instances[instanceId];
      if (!inst) return '';
      if (inst.icon) return inst.icon;
      return pickItemIcon(this.catalogById[inst.defId]);
    },

    /**
     * Whether any inventory instance already uses this catalog defId.
     * @param {string} defId
     * @returns {boolean}
     */
    hasDefIdInInventory(defId) {
      if (!defId) return false;
      /** @type {Set<number>} */
      const seen = new Set();
      for (const id of this.inventory) {
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        if (this.instances[id]?.defId === defId) return true;
      }
      return false;
    },

    /**
     * Count distinct relic instances currently in inventory.
     * @returns {number}
     */
    countRelicsInInventory() {
      /** @type {Set<number>} */
      const seen = new Set();
      let n = 0;
      for (const id of this.inventory) {
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        const def = this.catalogById[this.instances[id]?.defId];
        if (isRelicItem(def)) n += 1;
      }
      return n;
    },

    /**
     * Tooltip extras for set items / quiver inactive state.
     * @param {object|null|undefined} def
     * @param {string|null|undefined} [equipSlot] - equipment slot key when known
     * @returns {{ className?: string|null, setBonuses?: Array<{ required: number|string, modifiers: string[], active: boolean }>, setName?: string, inactiveNotice?: string }}
     */
    getTooltipOptionsForDef(def, equipSlot = null) {
      const ch = getCharacterInstance();
      const className = this.effectiveViewerClassName;
      const characterLevel = ch?.level ?? null;
      const characterStrength = ch && typeof ch.getStat === 'function' ? ch.getStat('strength') : null;
      const characterDexterity = ch && typeof ch.getStat === 'function' ? ch.getStat('dexterity') : null;
      /** @type {Record<string, unknown>} */
      const opts = { className, characterLevel, characterStrength, characterDexterity };
      const slot =
        equipSlot != null
          ? String(equipSlot)
          : this.selectedSlot?.location === 'equipment'
            ? String(this.selectedSlot.slot)
            : '';
      if (slot && this.equipment[slot] != null) {
        const reason = this.equipmentSlotInactiveReason(slot);
        if (reason) opts.inactiveNotice = reason;
        const instanceId = this.equipment[slot];
        Object.assign(opts, this.getItemBonusOptionsForInstance(instanceId));
      }
      if (!def?.setId) return opts;
      const setDef = this.setsById[def.setId];
      if (!setDef) return { ...opts, setName: def.setName };
      const counts = countEquippedSetPieces(this.activeEquippedDefs);
      const equippedCount = counts[def.setId] || 0;
      const totalPieces = this.catalog.filter((d) => d.setId === def.setId).length;
      return {
        ...opts,
        setName: setDef.name || def.setName,
        setBonuses: resolveSetBonuses(setDef, equippedCount, totalPieces),
      };
    },

    /**
     * Equip or place a catalog item into the selected slot.
     * @param {string} defId
     * @param {Record<string, number>|null|undefined} [rolls]
     * @param {import('@/items/custom-items.js').CustomItemPayload|null} [custom]
     * @returns {boolean}
     */
    equipFromPicker(defId, rolls = null, custom = null) {
      const sel = this.selectedSlot;
      if (!sel) return false;
      const def = this.catalogById[defId];
      if (!def) return false;

      // Quivers/jewels always go on the inventory grid (even if a gear slot is selected).
      if (isInventoryOnlyGear(def) || sel.location === 'inventory') {
        if (!canPlaceInInventory(def)) return false;
        if (isCharmItem(def) || isRelicItem(def)) return false;
        const preferred = sel.location === 'inventory' ? Number(sel.slot) : 0;
        const id = this.createInstance(defId, null, rolls, custom);
        const size = { invWidth: def.invWidth || 1, invHeight: def.invHeight || 1 };
        const getSize = this.getInstanceSize;
        const anchor = findAnchorForClick(
          this.inventory,
          preferred,
          size.invWidth,
          size.invHeight,
          getSize
        );
        if (anchor < 0) {
          delete this.instances[id];
          return false;
        }
        // Evicted instances from placeAt
        const before = new Set(this.inventory.filter((v) => v != null));
        this.inventory = placeAt(this.inventory, anchor, id, getSize);
        for (const oldId of before) {
          if (!this.inventory.includes(oldId) && oldId !== id) {
            this.destroyInstanceIfOrphaned(oldId);
          }
        }
        this.selectedSlot = { location: 'inventory', slot: anchor };
        this.editingInstanceId = id;
        return true;
      }

      if (sel.location === 'equipment') {
        const slot = String(sel.slot);
        const className = this.viewerClassName ?? getCharacterInstance()?.className ?? null;
        const otherHandDef = this.otherHandDefForEquip(slot);
        if (!canEquipInSlot(def, slot, className, { ...this.equipCheckOptions(slot), otherHandDef })) {
          return false;
        }
        const prev = this.equipment[slot];
        const id = this.createInstance(defId, null, rolls, custom);
        this.equipment[slot] = id;
        if (prev != null) this.destroyInstanceIfOrphaned(prev);
        this.editingInstanceId = id;
        this.syncCharacterToItemReqs();
        return true;
      }

      return false;
    },

    /**
     * @param {SlotRef} ref
     */
    removeItem(ref) {
      if (ref.location === 'equipment') {
        const slot = String(ref.slot);
        const prev = this.equipment[slot];
        this.equipment[slot] = null;
        if (prev != null) this.destroyInstanceIfOrphaned(prev);
        return;
      }
      if (ref.location === 'inventory') {
        const click = Number(ref.slot);
        const getSize = this.getInstanceSize;
        const anchor = resolveOccupiedCell(this.inventory, click, getSize);
        const target = anchor >= 0 ? anchor : click;
        const prev = this.inventory[target];
        if (prev == null && anchor < 0) return;
        this.inventory = placeAt(this.inventory, target, null, getSize);
        if (prev != null) this.destroyInstanceIfOrphaned(prev);
        return;
      }
      if (ref.location === 'charms') {
        this.toggleCharm(String(ref.slot), false);
        return;
      }
      if (ref.location === 'relics') {
        this.toggleRelic(String(ref.slot), false);
      }
    },

    /**
     * Move or swap an item between locations.
     * @param {SlotRef} from
     * @param {SlotRef} to
     * @returns {boolean}
     */
    moveItem(from, to) {
      if (from.location === to.location && from.slot === to.slot) return false;

      const getSize = this.getInstanceSize;

      /** @returns {number|null} */
      const readId = (ref) => {
        if (ref.location === 'equipment') return this.equipment[String(ref.slot)] ?? null;
        const click = Number(ref.slot);
        const anchor = resolveOccupiedCell(this.inventory, click, getSize);
        if (anchor >= 0) return this.inventory[anchor];
        return this.inventory[click] ?? null;
      };

      /** @returns {number} */
      const readAnchor = (ref) => {
        if (ref.location !== 'inventory') return -1;
        const click = Number(ref.slot);
        const anchor = resolveOccupiedCell(this.inventory, click, getSize);
        return anchor >= 0 ? anchor : click;
      };

      const fromId = readId(from);
      if (fromId == null) return false;
      const def = this.getDefForInstance(fromId);
      if (!def) return false;

      if (to.location === 'equipment') {
        const toSlot = String(to.slot);
        const className = this.viewerClassName ?? getCharacterInstance()?.className ?? null;
        const toOther = this.otherHandDefForEquip(toSlot, from);
        if (
          !canEquipInSlot(def, toSlot, className, {
            ...this.equipCheckOptions(toSlot, from),
            otherHandDef: toOther,
          })
        ) {
          return false;
        }
        const fromOther =
          from.location === 'equipment'
            ? this.otherHandDefForEquip(String(from.slot), to)
            : null;
        const toId = this.equipment[toSlot];

        // Remove from source first
        if (from.location === 'equipment') {
          this.equipment[String(from.slot)] = null;
        } else {
          const fromAnchor = readAnchor(from);
          this.inventory = placeAt(this.inventory, fromAnchor, null, getSize);
        }

        if (toId != null) {
          const toDef = this.getDefForInstance(toId);
          if (from.location === 'equipment') {
            if (
              toDef &&
              canEquipInSlot(toDef, String(from.slot), className, {
                ...this.equipCheckOptions(String(from.slot), {
                  location: 'equipment',
                  slot: toSlot,
                }),
                otherHandDef: fromOther,
              })
            ) {
              this.equipment[String(from.slot)] = toId;
            } else {
              // Try inventory dump — or destroy if nowhere
              const size = getSize(toId);
              if (size) {
                const dump = findAnchorForClick(
                  this.inventory,
                  0,
                  size.invWidth,
                  size.invHeight,
                  getSize
                );
                if (dump >= 0) {
                  this.inventory = placeAt(this.inventory, dump, toId, getSize);
                } else {
                  this.destroyInstanceIfOrphaned(toId);
                }
              }
            }
          } else {
            // Swap into inventory at from anchor if fits
            const fromAnchor = readAnchor(from);
            const size = getSize(toId);
            if (
              size &&
              canPlace(this.inventory, fromAnchor, size.invWidth, size.invHeight, getSize)
            ) {
              this.inventory = placeAt(this.inventory, fromAnchor, toId, getSize);
            } else if (size) {
              const dump = findAnchorForClick(
                this.inventory,
                fromAnchor,
                size.invWidth,
                size.invHeight,
                getSize
              );
              if (dump >= 0) {
                this.inventory = placeAt(this.inventory, dump, toId, getSize);
              } else {
                delete this.instances[toId];
              }
            }
          }
        }

        this.equipment[toSlot] = fromId;
        this.syncCharacterToItemReqs();
        return true;
      }

      if (to.location === 'inventory') {
        if (!canPlaceInInventory(def)) return false;
        if (isCharmItem(def) || isRelicItem(def)) return false;
        const preferred = Number(to.slot);
        const size = getSize(fromId);
        if (!size) return false;

        // Temporarily remove from source for placement check
        let fromEquipSlot = null;
        let fromInvAnchor = -1;
        if (from.location === 'equipment') {
          fromEquipSlot = String(from.slot);
          this.equipment[fromEquipSlot] = null;
        } else {
          fromInvAnchor = readAnchor(from);
          this.inventory = placeAt(this.inventory, fromInvAnchor, null, getSize);
        }

        const ignore = -1;
        const anchor = findAnchorForClick(
          this.inventory,
          preferred,
          size.invWidth,
          size.invHeight,
          getSize,
          ignore
        );

        if (anchor < 0) {
          // Restore
          if (fromEquipSlot != null) this.equipment[fromEquipSlot] = fromId;
          else if (fromInvAnchor >= 0) {
            this.inventory = placeAt(this.inventory, fromInvAnchor, fromId, getSize);
          }
          return false;
        }

        // Evict overlaps
        const before = new Set(this.inventory.filter((v) => v != null));
        this.inventory = placeAt(this.inventory, anchor, fromId, getSize);
        for (const oldId of before) {
          if (!this.inventory.includes(oldId) && oldId !== fromId) {
            // Try put back on equipment source if possible
            if (fromEquipSlot != null) {
              const oldDef = this.getDefForInstance(oldId);
              const className = this.viewerClassName ?? getCharacterInstance()?.className ?? null;
              if (
                oldDef &&
                canEquipInSlot(oldDef, fromEquipSlot, className, {
                  ...this.equipCheckOptions(fromEquipSlot),
                  otherHandDef: this.otherHandDefForEquip(fromEquipSlot),
                }) &&
                this.equipment[fromEquipSlot] == null
              ) {
                this.equipment[fromEquipSlot] = oldId;
                continue;
              }
            }
            this.destroyInstanceIfOrphaned(oldId);
          }
        }
        return true;
      }

      return false;
    },

    /**
     * Compact snapshot for build save/load.
     * @returns {ItemsSnapshot}
     */
    toSnapshot() {
      /** @type {Record<string, string|ItemSnapshotEntry|null>} */
      const equipment = {};
      for (const slot of EQUIPMENT_SLOTS) {
        const id = this.equipment[slot];
        if (id == null) {
          equipment[slot] = null;
          continue;
        }
        equipment[slot] = snapshotInstanceEntry(this.instances[id]);
      }
      /** @type {Array<{ slot: number, defId: string, icon?: string, rolls?: Record<string, number> }>} */
      const inventory = [];
      for (let i = 0; i < this.inventory.length; i++) {
        const id = this.inventory[i];
        if (id == null) continue;
        const inst = this.instances[id];
        const defId = inst?.defId;
        if (!defId) continue;
        const def = this.catalogById[defId];
        // Charms/relics belong in dedicated snapshot arrays (even if still on grid mid-migrate).
        if (isCharmItem(def) || isRelicItem(def)) continue;
        const entry = snapshotInstanceEntry(inst);
        if (!entry) continue;
        if (typeof entry === 'string') {
          inventory.push({ slot: i, defId: entry });
        } else {
          inventory.push({ slot: i, ...entry });
        }
      }

      /**
       * @param {Record<string, number>} map
       * @returns {Array<{ defId: string, rolls?: Record<string, number> }>}
       */
      const enabledList = (map) => {
        /** @type {Array<{ defId: string, rolls?: Record<string, number> }>} */
        const out = [];
        for (const [defId, instanceId] of Object.entries(map)) {
          const inst = this.instances[instanceId];
          if (!inst) continue;
          /** @type {{ defId: string, rolls?: Record<string, number> }} */
          const row = { defId };
          if (inst.rolls && Object.keys(inst.rolls).length) row.rolls = { ...inst.rolls };
          out.push(row);
        }
        return out;
      };

      /** @type {ItemsSnapshot} */
      const snap = {
        weaponSet: this.weaponSet,
        equipment,
        inventory,
        charms: enabledList(this.enabledCharms),
        relics: enabledList(this.enabledRelics),
      };
      if (this.customJewels.length) snap.customJewels = this.customJewels.map((j) => ({ ...j }));
      return snap;
    },

    /**
     * Restore from build snapshot. Does not raise character level for item reqs;
     * disables charms/relics the character cannot use yet.
     * @param {unknown} raw
     * @returns {{
     *   disabledCharms: Array<{ name: string, reqLevel: number }>,
     *   disabledRelics: Array<{ name: string, reqLevel: number }>,
     *   unmetGear: Array<{ name: string, requirementsLine: string }>,
     * }}
     */
    fromSnapshot(raw) {
      /**
       * @type {{
       *   disabledCharms: Array<{ name: string, reqLevel: number }>,
       *   disabledRelics: Array<{ name: string, reqLevel: number }>,
       *   unmetGear: Array<{ name: string, requirementsLine: string }>,
        }} */
      const result = { disabledCharms: [], disabledRelics: [], unmetGear: [] };

      if (!raw || typeof raw !== 'object') {
        this.equipment = emptyEquipment();
        this.inventory = emptyInventory();
        this.enabledCharms = {};
        this.enabledRelics = {};
        this.instances = {};
        this.nextInstanceId = 1;
        this.selectedSlot = null;
        this.editingInstanceId = null;
        return result;
      }
      // Materialize map if tests assigned catalog without rebuilding.
      if (Object.keys(this.catalogByIdMap).length === 0 && this.catalog.length > 0) {
        this.catalogByIdMap = buildCatalogByIdMap(this.catalog, this.runtimeOverlayDefs);
      }
      const data = /** @type {Record<string, unknown>} */ (raw);

      /** @type {Record<string, number|null>} */
      const nextEquipment = emptyEquipment();
      /** @type {(number|null)[]} */
      let nextInventory = emptyInventory();
      /** @type {Record<string, number>} */
      const nextEnabledCharms = {};
      /** @type {Record<string, number>} */
      const nextEnabledRelics = {};
      /** @type {Record<number, ItemInstance>} */
      const nextInstances = {};
      let nextId = 1;
      let hasDimensionalKey = false;

      /**
       * @param {string} defId
       * @param {string|null} icon
       * @param {Record<string, number>|null} rolls
       * @param {CustomItemPayload|null} custom
       * @param {{
       *   extras?: string[]|null,
       *   mysticOrbs?: Array<[number, string]>|null,
       *   socketables?: import('@/items/socketables.js').SocketableEntry[]|null,
       *   ethereal?: boolean,
       *   corrupted?: boolean,
       *   name?: string|null,
       * }|null} [meta]
       * @returns {number}
       */
      const makeInstance = (defId, icon, rolls, custom, meta = null) => {
        const id = nextId++;
        const def = this.catalogByIdMap[defId];
        /** @type {ItemInstance} */
        const inst = {
          defId,
          icon: pickItemIcon(def, icon),
        };
        if (rolls && typeof rolls === 'object' && Object.keys(rolls).length) {
          inst.rolls = { ...rolls };
        }
        const parsedCustom = parseCustomPayload(custom);
        if (parsedCustom) inst.custom = parsedCustom;
        applyInstanceMeta(inst, meta);
        nextInstances[id] = inst;
        return id;
      };

      /**
       * @param {unknown} entry
       * @returns {{
       *   defId: string,
       *   icon: string|null,
       *   rolls: Record<string, number>|null,
       *   custom: CustomItemPayload|null,
       *   extras: string[],
       *   mysticOrbs: Array<[number, string]>,
       *   socketables: import('@/items/socketables.js').SocketableEntry[],
       *   ethereal: boolean,
       *   corrupted: boolean,
       *   name: string|null,
       * }|null}
       */
      const parseEntry = (entry) => {
        /** @type {string|undefined} */
        let defId;
        /** @type {unknown} */
        let icon = null;
        /** @type {unknown} */
        let rollsRaw = null;
        /** @type {unknown} */
        let customRaw = null;
        /** @type {unknown} */
        let extrasRaw = null;
        /** @type {unknown} */
        let mysticOrbsRaw = null;
        /** @type {unknown} */
        let socketablesRaw = null;
        let ethereal = false;
        let corrupted = false;
        /** @type {unknown} */
        let oilRaw = null;
        /** @type {unknown} */
        let corruptionsRaw = null;
        /** @type {unknown} */
        let blessingRaw = null;
        /** @type {unknown} */
        let shrineRaw = null;
        /** @type {unknown} */
        let mechanicsRaw = null;
        /** @type {unknown} */
        let randomElementRaw = null;
        /** @type {unknown} */
        let nameRaw = null;
        if (typeof entry === 'string') {
          defId = entry;
        } else if (entry && typeof entry === 'object') {
          const rec = /** @type {Record<string, unknown>} */ (entry);
          defId = /** @type {string|undefined} */ (rec.defId);
          icon = rec.icon;
          rollsRaw = rec.rolls;
          customRaw = rec.custom;
          extrasRaw = rec.extras;
          mysticOrbsRaw = rec.mysticOrbs;
          socketablesRaw = rec.socketables;
          ethereal = rec.ethereal === true;
          corrupted = rec.corrupted === true;
          oilRaw = rec.oil;
          corruptionsRaw = rec.corruptions;
          blessingRaw = rec.blessing;
          shrineRaw = rec.shrine;
          mechanicsRaw = rec.mechanics;
          randomElementRaw = rec.randomElement;
          nameRaw = rec.name;
        } else {
          return null;
        }
        if (typeof defId !== 'string') return null;
        defId = resolveCatalogDefId(defId, this.catalogByIdMap);
        if (!this.catalogByIdMap[defId]) {
          const parsed = parseRunewordInstanceId(defId);
          if (parsed) {
            const ensured = this.ensureRunewordDef(parsed.templateId, parsed.baseId);
            if (ensured) defId = ensured;
          }
        }
        /** @type {Record<string, number>|null} */
        let rolls = null;
        if (rollsRaw && typeof rollsRaw === 'object' && !Array.isArray(rollsRaw)) {
          rolls = {};
          for (const [k, v] of Object.entries(rollsRaw)) {
            const n = Number(v);
            if (Number.isFinite(n)) rolls[k] = n;
          }
          if (!Object.keys(rolls).length) rolls = null;
        }
        return {
          defId,
          icon: typeof icon === 'string' ? icon : null,
          rolls,
          custom: parseCustomPayload(customRaw),
          extras: parseExtrasList(extrasRaw),
          mysticOrbs: parseMysticOrbsList(mysticOrbsRaw),
          socketables: parseSocketablesList(socketablesRaw),
          ethereal,
          corrupted,
          oil: typeof oilRaw === 'string' ? oilRaw : null,
          corruptions: normalizeCorruptions(corruptionsRaw),
          blessing: typeof blessingRaw === 'string' ? blessingRaw : null,
          shrine: typeof shrineRaw === 'string' ? shrineRaw : null,
          mechanics:
            mechanicsRaw && typeof mechanicsRaw === 'object' && !Array.isArray(mechanicsRaw)
              ? /** @type {Record<string, number>} */ (mechanicsRaw)
              : null,
          randomElement: normalizeRandomElement(randomElementRaw),
          name: typeof nameRaw === 'string' ? nameRaw.trim() : null,
        };
      };

      /**
       * @param {string} defId
       * @param {Record<string, number>|null} rolls
       * @param {'charms'|'relics'} kind
       */
      const className = this.viewerClassName;
      const enableFromSnap = (defId, rolls, kind) => {
        const def = this.catalogByIdMap[defId];
        if (!def) return;
        if (kind === 'charms') {
          if (!isCharmItem(def) || nextEnabledCharms[defId] != null) return;
          // Match toggleCharm: class-restricted charms stay disabled for the wrong class.
          if (!canEquipForClass(def, className)) return;
          if (isDimensionalKeyCharm(def)) {
            if (hasDimensionalKey) return;
            hasDimensionalKey = true;
          }
          nextEnabledCharms[defId] = makeInstance(defId, null, rolls, null);
          return;
        }
        if (!isRelicItem(def) || nextEnabledRelics[defId] != null) return;
        if (!canEquipForClass(def, className)) return;
        if (Object.keys(nextEnabledRelics).length >= MAX_RELICS) return;
        nextEnabledRelics[defId] = makeInstance(defId, null, rolls, null);
      };

      /** @param {number} id */
      const getSize = (id) => {
        const inst = nextInstances[id];
        if (!inst) return null;
        const def = this.catalogByIdMap[inst.defId];
        if (!def) return null;
        return { invWidth: def.invWidth || 1, invHeight: def.invHeight || 1 };
      };

      const prevSkip = skipItemReqLevelSync;
      skipItemReqLevelSync = true;
      try {
        const eq = data.equipment;
        if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
          for (const slot of EQUIPMENT_SLOTS) {
            const parsed = parseEntry(/** @type {Record<string, unknown>} */ (eq)[slot]);
            if (!parsed || !this.catalogByIdMap[parsed.defId]) continue;
            nextEquipment[slot] = makeInstance(
              parsed.defId,
              parsed.icon,
              parsed.rolls,
              parsed.custom,
              {
                extras: parsed.extras,
                mysticOrbs: parsed.mysticOrbs,
                socketables: parsed.socketables,
                ethereal: parsed.ethereal,
                corrupted: parsed.corrupted,
                oil: parsed.oil,
                corruptions: parsed.corruptions,
                blessing: parsed.blessing,
                shrine: parsed.shrine,
                mechanics: parsed.mechanics,
                randomElement: parsed.randomElement,
                name: parsed.name,
              }
            );
          }
        }

        const charmsSnap = data.charms;
        if (Array.isArray(charmsSnap)) {
          for (const row of charmsSnap) {
            const parsed = parseEntry(row);
            if (!parsed) continue;
            enableFromSnap(parsed.defId, parsed.rolls, 'charms');
          }
        }

        const relicsSnap = data.relics;
        if (Array.isArray(relicsSnap)) {
          for (const row of relicsSnap) {
            const parsed = parseEntry(row);
            if (!parsed) continue;
            enableFromSnap(parsed.defId, parsed.rolls, 'relics');
          }
        }

        const inv = data.inventory;
        if (Array.isArray(inv)) {
          for (const row of inv) {
            if (!row || typeof row !== 'object') continue;
            const slot = Number(/** @type {{ slot?: unknown }} */ (row).slot);
            const parsed = parseEntry(row);
            if (!Number.isFinite(slot) || !parsed) continue;
            if (!this.catalogByIdMap[parsed.defId]) continue;
            const def = this.catalogByIdMap[parsed.defId];
            // Migrate legacy inventory charms/relics into enable maps.
            if (isCharmItem(def)) {
              enableFromSnap(parsed.defId, parsed.rolls, 'charms');
              continue;
            }
            if (isRelicItem(def)) {
              enableFromSnap(parsed.defId, parsed.rolls, 'relics');
              continue;
            }
            const id = makeInstance(parsed.defId, parsed.icon, parsed.rolls, parsed.custom, {
              extras: parsed.extras,
              mysticOrbs: parsed.mysticOrbs,
              socketables: parsed.socketables,
              ethereal: parsed.ethereal,
              corrupted: parsed.corrupted,
              oil: parsed.oil,
              corruptions: parsed.corruptions,
              blessing: parsed.blessing,
              shrine: parsed.shrine,
              mechanics: parsed.mechanics,
              randomElement: parsed.randomElement,
              name: parsed.name,
            });
            if (canPlace(nextInventory, slot, def.invWidth || 1, def.invHeight || 1, getSize)) {
              nextInventory = placeAt(nextInventory, slot, id, getSize);
            } else {
              delete nextInstances[id];
            }
          }
        }

        // Single store write so Vue does not re-render per charm/gear piece.
        this.weaponSet = data.weaponSet === 1 ? 1 : 0;
        this.equipment = nextEquipment;
        this.inventory = nextInventory;
        this.enabledCharms = nextEnabledCharms;
        this.enabledRelics = nextEnabledRelics;
        this.instances = nextInstances;
        this.nextInstanceId = nextId;
        this.selectedSlot = null;
        this.editingInstanceId = null;
        const jewels = Array.isArray(data.customJewels) ? data.customJewels : [];
        this.customJewels = jewels
          .filter((j) => j && typeof j === 'object' && j.id)
          .map((j) => ({
            id: String(j.id),
            name: String(j.name || 'Custom Jewel'),
            modifiers: Array.isArray(j.modifiers) ? j.modifiers.map(String) : [],
            rarity: normalizeCustomJewelRarity(j.rarity),
          }));

        const disabled = this.disableEnabledItemsBelowLevel();
        result.disabledCharms = disabled.charms;
        result.disabledRelics = disabled.relics;
        result.unmetGear = this.listUnmetEquippedItems();
      } finally {
        skipItemReqLevelSync = prevSkip;
      }
      this.selectedSlot = null;
      this.editingInstanceId = null;
      return result;
    },

    resetItems() {
      this.equipment = emptyEquipment();
      this.inventory = emptyInventory();
      this.enabledCharms = {};
      this.enabledRelics = {};
      this.instances = {};
      this.nextInstanceId = 1;
      this.weaponSet = 0;
      this.selectedSlot = null;
      this.editingInstanceId = null;
    },
  },
});
