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
  canPlaceInInventory,
} from '@/items/item-types.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import {
  canPlace,
  placeAt,
  findAnchorForClick,
  resolveOccupiedCell,
  listPlacedItems,
} from '@/items/inventory-placement.js';
import { pickItemIcon } from '@/items/item-icons.js';
import { isCharmItem, isDimensionalKeyCharm } from '@/items/charm-items.js';
import { isRelicItem, MAX_RELICS } from '@/items/relic-items.js';
import {
  countEquippedSetPieces,
  resolveSetBonuses,
} from '@/items/item-overlays.js';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';

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
 * @typedef {{ defId: string, icon: string, rolls?: Record<string, number> }} ItemInstance
 */

export const useItemsStore = defineStore('items', {
  state: () => ({
    /** @type {ItemDef[]} */
    catalog: [],
    /** @type {SetDef[]} */
    sets: [],
    catalogLoaded: false,
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
      for (const d of state.catalog) map[d.id] = d;
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
      const className = getCharacterInstance()?.className ?? null;
      if (sel.location === 'equipment') {
        return this.catalog.filter((d) => canEquipInSlot(d, String(sel.slot), className));
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
  },

  actions: {
    async loadCatalog() {
      if (this.catalogLoaded) return;
      const versionFolder = versionToTreeAssetFolder(getCurrentVersion());
      const required = ['baseitems.json', 'charms.json', 'other.json'];
      const optional = ['relics.json', 'unique-stats-db.json'];
      try {
        const requiredRes = await Promise.all(
          required.map((file) => fetch(getAssetUrl(`items/${versionFolder}/${file}`)))
        );
        const failed = requiredRes.find((res) => !res.ok);
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
          optional.map((file) => fetch(getAssetUrl(`items/${versionFolder}/${file}`)))
        );
        /** @type {ItemDef[]} */
        let relics = [];
        /** @type {ItemDef[]} */
        let overlays = [];
        /** @type {SetDef[]} */
        let sets = [];
        if (optionalRes[0]?.ok) {
          const data = await optionalRes[0].json();
          relics = (Array.isArray(data) ? data : []).map((/** @type {ItemDef} */ r) => ({
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
        if (optionalRes[1]?.ok) {
          const data = await optionalRes[1].json();
          const built = buildCatalogFromUniqueStats(data, basesForMatch);
          overlays = built.items;
          sets = built.sets;
        }

        this.catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics];
        this.sets = sets;
        this.catalogLoaded = true;
      } catch (e) {
        console.error('Failed to load item catalog', e);
        this.catalog = [];
        this.sets = [];
        this.catalogLoaded = true;
      }
    },

    /** @param {0|1} set */
    setWeaponSet(set) {
      this.weaponSet = set === 1 ? 1 : 0;
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
     * @returns {number}
     */
    createInstance(defId, icon = null, rolls = null) {
      const id = this.nextInstanceId++;
      const def = this.catalogById[defId];
      /** @type {{ defId: string, icon: string, rolls?: Record<string, number> }} */
      const inst = {
        defId,
        icon: pickItemIcon(def, icon),
      };
      if (rolls && typeof rolls === 'object' && Object.keys(rolls).length) {
        inst.rolls = { ...rolls };
      }
      this.instances[id] = inst;
      return id;
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
        if (nextEnabled[def.id] != null) continue;
        if (isDimensionalKeyCharm(def)) {
          if (hasDimensionalKey) continue;
          hasDimensionalKey = true;
        }
        const id = nextId++;
        nextInstances[id] = {
          defId: def.id,
          icon: pickItemIcon(def),
        };
        nextEnabled[def.id] = id;
        added += 1;
      }
      if (!added) return 0;
      this.nextInstanceId = nextId;
      this.instances = nextInstances;
      this.enabledCharms = nextEnabled;
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
      const inst = this.instances[id];
      if (!inst) return null;
      return this.catalogById[inst.defId] ?? null;
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
      return this.catalogById[inst.defId] ?? null;
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
     * Tooltip extras for set items (active bonuses from currently equipped pieces).
     * @param {object|null|undefined} def
     * @returns {{ setBonuses?: Array<{ required: number|string, modifiers: string[], active: boolean }>, setName?: string }}
     */
    getTooltipOptionsForDef(def) {
      if (!def?.setId) return {};
      const setDef = this.setsById[def.setId];
      if (!setDef) return { setName: def.setName };
      const counts = countEquippedSetPieces(this.equippedDefs);
      const equippedCount = counts[def.setId] || 0;
      const totalPieces = this.catalog.filter((d) => d.setId === def.setId).length;
      return {
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

      if (sel.location === 'equipment') {
        const slot = String(sel.slot);
        const className = getCharacterInstance()?.className ?? null;
        if (!canEquipInSlot(def, slot, className)) return false;
        const prev = this.equipment[slot];
        const id = this.createInstance(defId, null, rolls);
        this.equipment[slot] = id;
        if (prev != null) this.destroyInstanceIfOrphaned(prev);
        this.editingInstanceId = id;
        return true;
      }

      if (sel.location === 'inventory') {
        if (!canPlaceInInventory(def)) return false;
        if (isCharmItem(def) || isRelicItem(def)) return false;
        const preferred = Number(sel.slot);
        const id = this.createInstance(defId, null, rolls);
        const size = { invWidth: def.invWidth || 1, invHeight: def.invHeight || 1 };
        const getSize = this.getInstanceSize;
        let anchor = findAnchorForClick(
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
        const before = new Set(
          this.inventory.filter((v) => v != null)
        );
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
        const className = getCharacterInstance()?.className ?? null;
        if (!canEquipInSlot(def, toSlot, className)) return false;
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
            if (toDef && canEquipInSlot(toDef, String(from.slot), className)) {
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
              const className = getCharacterInstance()?.className ?? null;
              if (
                oldDef &&
                canEquipInSlot(oldDef, fromEquipSlot, className) &&
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
     * @returns {{
     *   weaponSet: 0|1,
     *   equipment: Record<string, string|{ defId: string, icon?: string, rolls?: Record<string, number> }|null>,
     *   inventory: Array<{ slot: number, defId: string, icon?: string, rolls?: Record<string, number> }>,
     *   charms: Array<{ defId: string, rolls?: Record<string, number> }>,
     *   relics: Array<{ defId: string, rolls?: Record<string, number> }>
     * }}
     */
    toSnapshot() {
      /** @type {Record<string, string|{ defId: string, icon?: string, rolls?: Record<string, number> }|null>} */
      const equipment = {};
      for (const slot of EQUIPMENT_SLOTS) {
        const id = this.equipment[slot];
        if (id == null) {
          equipment[slot] = null;
          continue;
        }
        const inst = this.instances[id];
        const defId = inst?.defId ?? null;
        if (!defId) {
          equipment[slot] = null;
          continue;
        }
        const hasIcon = Boolean(inst.icon);
        const hasRolls = Boolean(inst.rolls && Object.keys(inst.rolls).length);
        if (!hasIcon && !hasRolls) {
          equipment[slot] = defId;
          continue;
        }
        /** @type {{ defId: string, icon?: string, rolls?: Record<string, number> }} */
        const entry = { defId };
        if (hasIcon) entry.icon = inst.icon;
        if (hasRolls) entry.rolls = { ...inst.rolls };
        equipment[slot] = entry;
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
        /** @type {{ slot: number, defId: string, icon?: string, rolls?: Record<string, number> }} */
        const row = { slot: i, defId };
        if (inst.icon) row.icon = inst.icon;
        if (inst.rolls && Object.keys(inst.rolls).length) row.rolls = { ...inst.rolls };
        inventory.push(row);
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
     * Restore from build snapshot.
     * @param {unknown} raw
     */
    fromSnapshot(raw) {
      this.equipment = emptyEquipment();
      this.inventory = emptyInventory();
      this.enabledCharms = {};
      this.enabledRelics = {};
      this.instances = {};
      this.nextInstanceId = 1;
      this.selectedSlot = null;
      this.editingInstanceId = null;

      if (!raw || typeof raw !== 'object') return;
      const data = /** @type {Record<string, unknown>} */ (raw);

      this.weaponSet = data.weaponSet === 1 ? 1 : 0;

      /**
       * @param {unknown} entry
       * @returns {{ defId: string, icon: string|null, rolls: Record<string, number>|null }|null}
       */
      const parseEntry = (entry) => {
        if (typeof entry === 'string') return { defId: entry, icon: null, rolls: null };
        if (!entry || typeof entry !== 'object') return null;
        const defId = /** @type {{ defId?: unknown }} */ (entry).defId;
        const icon = /** @type {{ icon?: unknown }} */ (entry).icon;
        const rollsRaw = /** @type {{ rolls?: unknown }} */ (entry).rolls;
        if (typeof defId !== 'string') return null;
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

      const eq = data.equipment;
      if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
        for (const slot of EQUIPMENT_SLOTS) {
          const parsed = parseEntry(/** @type {Record<string, unknown>} */ (eq)[slot]);
          if (!parsed || !this.catalogById[parsed.defId]) continue;
          const id = this.createInstance(parsed.defId, parsed.icon, parsed.rolls);
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
          const id = this.createInstance(parsed.defId, parsed.icon, parsed.rolls);
          const getSize = this.getInstanceSize;
          if (canPlace(this.inventory, slot, def.invWidth || 1, def.invHeight || 1, getSize)) {
            this.inventory = placeAt(this.inventory, slot, id, getSize);
          } else {
            delete this.instances[id];
          }
        }
      }
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
