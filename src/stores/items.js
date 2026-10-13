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
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import { getPlannerAutoMatchHighestStatRequirements } from '@/planner/planner-options.js';
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
import { normalizeMysticOrbs } from '@/items/mystic-orbs.js';

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
 *   ethereal?: boolean,
 * }} ItemInstance
 * @typedef {{
 *   defId: string,
 *   icon?: string,
 *   rolls?: Record<string, number>,
 *   custom?: CustomItemPayload,
 *   extras?: string[],
 *   mysticOrbs?: Array<[number, string]>,
 *   ethereal?: boolean,
 * }} ItemSnapshotEntry
 * @typedef {{
 *   weaponSet: 0|1,
 *   equipment: Record<string, string|ItemSnapshotEntry|null>,
 *   inventory: Array<{ slot: number } & ItemSnapshotEntry>,
 *   charms: Array<{ defId: string, rolls?: Record<string, number> }>,
 *   relics: Array<{ defId: string, rolls?: Record<string, number> }>
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
 * @param {ItemInstance|null|undefined} inst
 * @param {{
 *   extras?: string[]|null,
 *   mysticOrbs?: Array<[number, string]>|null,
 *   ethereal?: boolean,
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
  if (meta.ethereal === true) inst.ethereal = true;
  else delete inst.ethereal;
}

function snapshotInstanceEntry(inst) {
  const defId = inst?.defId;
  if (!defId) return null;
  const hasIcon = Boolean(inst.icon);
  const hasRolls = Boolean(inst.rolls && Object.keys(inst.rolls).length);
  const custom = parseCustomPayload(inst.custom);
  const extras = parseExtrasList(inst?.extras);
  const mysticOrbs = parseMysticOrbsList(inst?.mysticOrbs);
  const ethereal = inst?.ethereal === true;
  if (!hasIcon && !hasRolls && !custom && !extras.length && !mysticOrbs.length && !ethereal) {
    return defId;
  }
  /** @type {ItemSnapshotEntry} */
  const entry = { defId };
  if (hasIcon) entry.icon = inst.icon;
  if (hasRolls) entry.rolls = { ...inst.rolls };
  if (custom) entry.custom = custom;
  if (extras.length) entry.extras = extras;
  if (mysticOrbs.length) entry.mysticOrbs = mysticOrbs;
  if (ethereal) entry.ethereal = true;
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
      /** @type {Record<string, ItemDef>} */
      const map = {};
      for (const d of state.catalog) {
        map[d.id] = d;
        if (d.uniqueKind === 'tiered' && Number(d.tier) === 4 && typeof d.id === 'string') {
          const alias = d.id.replace(/:4$/, '');
          if (alias.endsWith(':tu') && map[alias] == null) map[alias] = d;
        }
      }
      for (const d of state.runtimeOverlayDefs) {
        if (d?.id) map[d.id] = d;
      }
      return map;
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
      const consider = (def, rolls = null) => {
        if (!def || !canEquipForClass(def, className)) return;
        const req = isCharmItem(def)
          ? getCharmRequiredLevel(def, rolls)
          : Number(def.reqLevel);
        if (Number.isFinite(req) && req > max) max = req;
      };
      for (const slot of EQUIPMENT_SLOTS) {
        if (!isActiveWeaponSetSlot(slot, this.weaponSet)) continue;
        const id = this.equipment[slot];
        if (id == null) continue;
        const inst = this.instances[id];
        consider(inst ? this.catalogById[inst.defId] : null, inst?.rolls ?? null);
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
        const optional = ['relics.json', 'unique-stats-db.json', 'runewords.json'];
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

          this.catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics, ...runewords];
          this.sets = sets;
          this.runtimeOverlayDefs = [];
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
     *   ethereal?: boolean,
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
      if (this.catalogById[id]) return id;
      const merged = mergeRunewordWithBase(
        this.catalogById[resolvedTemplateId],
        this.catalogById[baseId]
      );
      if (!merged) return null;
      this.runtimeOverlayDefs = [...this.runtimeOverlayDefs, merged];
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
     * @returns {boolean}
     */
    toggleCharm(defId, enabled, rolls = null) {
      const def = this.catalogById[defId];
      if (!def || !isCharmItem(def)) return false;
      const className = this.viewerClassName;
      if (enabled && !canEquipForClass(def, className)) return false;
      const existing = this.enabledCharms[defId];
      if (enabled) {
        if (existing != null) {
          this.selectEnabledItem('charms', defId);
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
        this.selectEnabledItem('charms', defId);
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
      if (inst.ethereal === true && !withCustom.ethereal) {
        return { ...withCustom, ethereal: true };
      }
      return withCustom;
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
        const instanceExtras = this.getExtrasForInstance(instanceId);
        if (instanceExtras.length) opts.extras = instanceExtras;
        const mysticOrbs = this.getMysticOrbsForInstance(instanceId);
        if (mysticOrbs.length) opts.mysticOrbs = mysticOrbs;
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
     * @returns {boolean}
     */
    equipFromPicker(defId, rolls = null) {
      const sel = this.selectedSlot;
      if (!sel) return false;
      const def = this.catalogById[defId];
      if (!def) return false;

      // Quivers/jewels always go on the inventory grid (even if a gear slot is selected).
      if (isInventoryOnlyGear(def) || sel.location === 'inventory') {
        if (!canPlaceInInventory(def)) return false;
        if (isCharmItem(def) || isRelicItem(def)) return false;
        const preferred = sel.location === 'inventory' ? Number(sel.slot) : 0;
        const id = this.createInstance(defId, null, rolls);
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
        const id = this.createInstance(defId, null, rolls);
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

      return {
        weaponSet: this.weaponSet,
        equipment,
        inventory,
        charms: enabledList(this.enabledCharms),
        relics: enabledList(this.enabledRelics),
      };
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

      this.equipment = emptyEquipment();
      this.inventory = emptyInventory();
      this.enabledCharms = {};
      this.enabledRelics = {};
      this.instances = {};
      this.nextInstanceId = 1;
      this.selectedSlot = null;
      this.editingInstanceId = null;

      if (!raw || typeof raw !== 'object') return result;
      const data = /** @type {Record<string, unknown>} */ (raw);

      this.weaponSet = data.weaponSet === 1 ? 1 : 0;

      /**
       * @param {unknown} entry
       * @returns {{
       *   defId: string,
       *   icon: string|null,
       *   rolls: Record<string, number>|null,
       *   custom: CustomItemPayload|null,
       *   extras: string[],
       *   mysticOrbs: Array<[number, string]>,
       *   ethereal: boolean,
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
        let ethereal = false;
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
          ethereal = rec.ethereal === true;
        } else {
          return null;
        }
        if (typeof defId !== 'string') return null;
        defId = resolveCatalogDefId(defId, this.catalogById);
        if (!this.catalogById[defId]) {
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
          ethereal,
        };
      };

      /**
       * @param {string} defId
       * @param {Record<string, number>|null} rolls
       * @param {'charms'|'relics'} kind
       */
      const enableFromSnap = (defId, rolls, kind) => {
        const def = this.catalogById[defId];
        if (!def) return;
        if (kind === 'charms') {
          if (!isCharmItem(def) || this.enabledCharms[defId] != null) return;
          // Use toggleCharm so Dimensional Key exclusivity applies.
          this.toggleCharm(defId, true, rolls);
          return;
        }
        if (!isRelicItem(def) || this.enabledRelics[defId] != null) return;
        if (Object.keys(this.enabledRelics).length >= MAX_RELICS) return;
        const id = this.createInstance(defId, null, rolls);
        this.enabledRelics = { ...this.enabledRelics, [defId]: id };
      };

      const prevSkip = skipItemReqLevelSync;
      skipItemReqLevelSync = true;
      try {
        const eq = data.equipment;
        if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
          for (const slot of EQUIPMENT_SLOTS) {
            const parsed = parseEntry(/** @type {Record<string, unknown>} */ (eq)[slot]);
            if (!parsed || !this.catalogById[parsed.defId]) continue;
            const id = this.createInstance(parsed.defId, parsed.icon, parsed.rolls, parsed.custom, {
              extras: parsed.extras,
              mysticOrbs: parsed.mysticOrbs,
              ethereal: parsed.ethereal,
            });
            this.equipment[slot] = id;
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
            if (!this.catalogById[parsed.defId]) continue;
            const def = this.catalogById[parsed.defId];
            // Migrate legacy inventory charms/relics into enable maps.
            if (isCharmItem(def)) {
              enableFromSnap(parsed.defId, parsed.rolls, 'charms');
              continue;
            }
            if (isRelicItem(def)) {
              enableFromSnap(parsed.defId, parsed.rolls, 'relics');
              continue;
            }
            const id = this.createInstance(parsed.defId, parsed.icon, parsed.rolls, parsed.custom, {
              extras: parsed.extras,
              mysticOrbs: parsed.mysticOrbs,
              ethereal: parsed.ethereal,
            });
            const getSize = this.getInstanceSize;
            if (canPlace(this.inventory, slot, def.invWidth || 1, def.invHeight || 1, getSize)) {
              this.inventory = placeAt(this.inventory, slot, id, getSize);
            } else {
              delete this.instances[id];
            }
          }
        }

        const disabled = this.disableEnabledItemsBelowLevel();
        result.disabledCharms = disabled.charms;
        result.disabledRelics = disabled.relics;
        result.unmetGear = this.listUnmetEquippedItems();
      } finally {
        skipItemReqLevelSync = prevSkip;
      }
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
