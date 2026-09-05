/**
 * @file File-backed skill data (`public/tree_data/*.json`).
 * Does not import version-config (avoid circular deps with getFileSkillStore).
 * @module shared/skill-data-store
 */

import { DEFAULT_GAME_VERSION, treeAssetFolderFromMajorMinor } from '@/shared/version-constants.js';
import { fetchJson } from '@/shared/fetch-json.js';
import { getRequestedTreeVersion, resolveGameVersion } from '@/shared/version-resolver.js';

export { getRequestedTreeVersion, resolveGameVersion };

const TREE_DATA_DIR = 'tree_data';

/** @type {SkillFileStore | null} */
let _store = null;
let _initPromise = null;

/**
 * One map for a whole sort: `class_id|tab_id` -> classTabs.tab_index.
 *
 * @param {{ classTabs?: { id: number; class_id: number; tab_index: number }[] } | null} [gameMeta]
 * @returns {Map<string, number>}
 */
export function buildTabOrderLookupFromGameMeta(gameMeta) {
    const map = new Map();
    if (!gameMeta?.classTabs?.length) return map;
    for (const ct of gameMeta.classTabs) {
        if (ct.class_id == null || ct.id == null || ct.tab_index == null) continue;
        const c = Number(ct.class_id);
        const t = Number(ct.id);
        const idx = Number(ct.tab_index);
        if (!Number.isFinite(c) || !Number.isFinite(t) || !Number.isFinite(idx)) continue;
        map.set(`${c}|${t}`, idx);
    }
    return map;
}

/**
 * @param {{ classId?: unknown; tab?: unknown }} skill
 * @param {Map<string, number>} lookup from {@link buildTabOrderLookupFromGameMeta}
 * @returns {number}
 */
export function tabOrderRankFromLookup(skill, lookup) {
    if (!skill || skill.classId == null || skill.tab == null) return Infinity;
    const c = Number(skill.classId);
    const t = Number(skill.tab);
    if (!Number.isFinite(c) || !Number.isFinite(t)) return Infinity;
    const v = lookup.get(`${c}|${t}`);
    return v != null && Number.isFinite(v) ? v : Infinity;
}

/** Variant text overrides in skills.json are stored as string[] (or null). */
function variantOverrideLinesToString(raw) {
    if (raw == null) return null;
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return null;
    return raw.map((line) => String(line)).join('\n');
}

/**
 * Optional minimum mana for `mana_cost` scaling/constants: `min_mana` (preferred) or `value3`.
 * @param {{ statKey?: string, min_mana?: unknown, value3?: unknown }} hit
 * @returns {string|null}
 */
function manaCostMinManaFromRow(hit) {
    if (String(hit?.statKey || '').toLowerCase() !== 'mana_cost') return null;
    if (hit.min_mana != null && String(hit.min_mana).trim() !== '') return String(hit.min_mana).trim();
    if (hit.value3 != null && String(hit.value3).trim() !== '') return String(hit.value3).trim();
    return null;
}

/** Balance slice expected by findScalingRow (from merged skills.json row). */
function balanceObjectFromMergedRow(row) {
    return {
        internalId: row.id,
        classId: row.classId,
        variants: row.variants ?? [],
        scalingConstants: row.scalingConstants ?? []
    };
}

export class SkillFileStore {
    constructor() {
        /** @type {Array<{id:number,major:number,minor:number,name:string,is_active:number|boolean}>} */
        this.versions = [];
        /** @type {Array<{id:number,key:string,name:string,description?:string,format:string}>} */
        this.stats = [];
        /** @type {Map<string, {id:number,key:string,name:string,description?:string,format:string}>} */
        this.statsByKeyLower = new Map();
        this.folderSeg = '';
        /** @type {object|null} */
        this.gameMeta = null;
        /** @type {Array<object>} */
        this.catalog = [];
        /** @type {Map<string, object>} internal skill id -> catalog row */
        this.catalogByInternalId = new Map();
        /** @type {Map<string, object>} */
        this.balanceCache = new Map();
        /** @type {Array<{id?:number,key:string,label:string,min?:number|null,max?:number|null,allowNegative?:boolean,default?:number,alwaysVisible?:boolean,sortOrder?:number,section?:string}>} */
        this.characterStatRegistry = [];
        /** @type {Map<string, object>} */
        this.characterStatByKeyLower = new Map();
        /** @type {Map<string, object>} stats.json key -> character stat row */
        this.characterStatByStatsKeyLower = new Map();
        /** @type {number|null} version id (from versions.json) matching loaded folder */
        this.currentVersionId = null;
            /** @type {Array<object>} conditions loaded from conditions.json */
            this.conditions = [];
            /** @type {Map<string, object>} conditions keyed by lowercase key */
            this.conditionsByKeyLower = new Map();
    }

        /**
         * Get a condition by key (case-insensitive).
         * @param {string} key
         * @returns {object|null}
         */
        getConditionByKey(key) {
            if (key == null) return null;
            return this.conditionsByKeyLower.get(String(key).toLowerCase()) ?? null;
        }

        /**
         * Get the mutual-exclusion group id for a condition key (case-insensitive).
         * @param {string} key
         * @returns {string|null}
         */
        getConditionGroup(key) {
            const c = this.getConditionByKey(key);
            if (!c || c.group == null || c.group === '') return null;
            return String(c.group).toLowerCase();
        }

        /**
         * All condition keys that share a group (case-insensitive group id).
         * @param {string} group
         * @returns {string[]}
         */
        getConditionKeysInGroup(group) {
            if (group == null || group === '') return [];
            const g = String(group).toLowerCase();
            const out = [];
            for (const c of this.conditions) {
                if (!c || !c.key || c.group == null || c.group === '') continue;
                if (String(c.group).toLowerCase() === g) out.push(String(c.key).toLowerCase());
            }
            return out;
        }

        /**
         * Collect condition keys referenced by a catalog row or raw key array.
         * @param {object|Array<string>|null} skillOrRow
         * @returns {string[]}
         */
        collectShowConditionKeys(skillOrRow) {
            if (!skillOrRow) return [];
            if (Array.isArray(skillOrRow)) {
                return skillOrRow.filter((k) => k != null).map((k) => String(k));
            }
            /** @type {string[]} */
            const keys = [];
            if (Array.isArray(skillOrRow.showCondition)) {
                for (const k of skillOrRow.showCondition) {
                    if (k != null) keys.push(String(k));
                }
            }
            if (Array.isArray(skillOrRow.scalingConstants)) {
                for (const stat of skillOrRow.scalingConstants) {
                    if (stat && Array.isArray(stat.showCondition)) {
                        for (const k of stat.showCondition) {
                            if (k != null) keys.push(String(k));
                        }
                    }
                }
            }
            return keys;
        }

        /**
         * Catalog rows that are subskills of the given parent internal id.
         * @param {string} parentInternalId
         * @returns {object[]}
         */
        getSubskillsForParent(parentInternalId) {
            const pid = parentInternalId != null ? String(parentInternalId).trim() : '';
            if (!pid || !Array.isArray(this.catalog)) return [];
            return this.catalog.filter(
                (r) =>
                    r?.parentSkillId != null &&
                    String(r.parentSkillId).trim() !== '' &&
                    String(r.parentSkillId).trim() === pid
            );
        }

        /**
         * Resolve conditions for a skill row from row-level and per-stat showCondition.
         * Also includes showCondition keys from child subskills (parentSkillId).
         * @param {object|Array<string>|null} skillOrArray
         * @returns {object[]} array of condition objects (may be empty)
         */
        getConditionsForSkill(skillOrArray) {
            if (!skillOrArray) return [];

            const seenKeys = new Set();
            const out = [];

            const addFrom = (source) => {
                for (const k of this.collectShowConditionKeys(source)) {
                    const keyStr = String(k).toLowerCase();
                    if (seenKeys.has(keyStr)) continue;
                    seenKeys.add(keyStr);
                    const c = this.getConditionByKey(k);
                    if (c) out.push(c);
                }
            };

            addFrom(skillOrArray);

            if (
                skillOrArray &&
                typeof skillOrArray === 'object' &&
                !Array.isArray(skillOrArray) &&
                skillOrArray.id != null
            ) {
                for (const sub of this.getSubskillsForParent(skillOrArray.id)) {
                    addFrom(sub);
                }
            }

            return out;
        }

    /**
     * Balance version ids to try (matches getBalanceVersionIdsForFallback).
     * @returns {number[]}
     */
    getBalanceVersionIds() {
        return this.currentVersionId != null ? [this.currentVersionId] : [];
    }

    /**
     * Row from stats.json for a scaling stat key (`key` lowercased).
     * Optional `pairedStat`: `[{ valueIndex: 0..3, stat|plannerKey }, ...]` routes value slots to planner character_stats keys; multiple entries per slot are allowed (see planner-stat-modifiers).
     * Optional `signed`: `true` (all value slots) or `[0,1,...]` — prefix `+` on non-negative numeric displays (negatives keep `-`).
     */
    getStatByKeyLower(key) {
        return this.statsByKeyLower.get(String(key).toLowerCase()) ?? null;
    }

    /**
     * Playable class ids (excludes Other / class_id 1).
     * @returns {number[]}
     */
    playablePlannerClassIds() {
        return (this.gameMeta?.classes || [])
            .map((c) => c.id)
            .filter((id) => id !== 1);
    }

    /**
     * Planner class ids for a catalog row. Supports:
     * - `classIds`: [2, 6, ...] explicit numeric ids
     * - `class`: "__all__" or "*" = every class except Other (id 1)
     * - `tabName`: "Mastery" = cloned onto every playable class (tree-data.js)
     * - `class`: ["Amazon", "Paladin", ...] multiclass by name
     * - `class`: "Amazon" single class (legacy)
     * @param {object} row
     * @returns {number[]}
     */
    computePlannerClassIdsForRow(row) {
        if (!row) return [];
        if (Array.isArray(row.classIds) && row.classIds.length) {
            return row.classIds.map((n) => Number(n)).filter((id) => Number.isFinite(id));
        }
        const cls = row.class;
        if (cls === '__all__' || cls === '*') {
            return this.playablePlannerClassIds();
        }
        // Catalog stores Mastery skills on Amazon; planner clones them onto every class.
        if (String(row.tabName || '').trim() === 'Mastery') {
            return this.playablePlannerClassIds();
        }
        if (Array.isArray(cls)) {
            const byName = new Map((this.gameMeta?.classes || []).map((c) => [c.name, c.id]));
            const out = [];
            for (const name of cls) {
                if (typeof name !== 'string') continue;
                const id = byName.get(name);
                if (id != null) out.push(id);
            }
            return out.length ? out : row.classId != null ? [row.classId] : [];
        }
        if (typeof cls === 'string' && cls.trim() !== '') {
            return row.classId != null ? [row.classId] : [];
        }
        return row.classId != null ? [row.classId] : [];
    }

    /**
     * String for icons / display (first class name when multiclass).
     * @param {object} cat
     * @returns {string}
     */
    primaryClassDisplayName(cat) {
        if (!cat) return '';
        const cls = cat.class;
        if (Array.isArray(cls)) return typeof cls[0] === 'string' ? cls[0] : '';
        if (cls === '__all__' || cls === '*') {
            const first = this.gameMeta?.classes?.find((x) => x.id !== 1);
            return first?.name || '';
        }
        if (typeof cls === 'string') return cls;
        return '';
    }

    /**
     * @param {object} row - catalog row
     * @param {number} plannerClassId - class id from planner skill card
     * @returns {boolean}
     */
    catalogRowMatchesPlannerClass(row, plannerClassId) {
        if (plannerClassId == null || !Number.isFinite(plannerClassId)) return true;
        // Shared "Other" rows (class_id 1) are cloned onto every playable class (shared Innate).
        if (Number(row.classId) === 1) return true;
        // Mastery-tab skills are cloned onto every playable class (tree-data.js).
        if (String(row.tabName || '').trim() === 'Mastery') return true;
        const ids = row._plannerClassIds ?? this.computePlannerClassIdsForRow(row);
        return ids.includes(plannerClassId);
    }

    /**
     * Full skill definition from skills.json catalog (shape matches former game_meta.skills + catalog merge).
     */
    getSkillDetail(internalName) {
        const cat = this.catalogByInternalId.get(String(internalName)) ?? null;
        if (!cat) return null;

        const normalizeText = (v) => {
            if (v == null) return null;
            if (Array.isArray(v)) {
                return v.map((x) => (x == null ? '' : String(x))).join('\n');
            }
            return String(v);
        };

        const skillEffect = normalizeText(cat.skillEffect ?? cat.skill_effect ?? null);
        return {
            id: cat.id,
            display_name: cat.displayName,
            classId: cat.classId,
            className: this.primaryClassDisplayName(cat),
            tabIndex: cat.tab,
            tabName: cat.tabName,
            tags: cat.tags ?? [],
            description: normalizeText(cat.description ?? null),
            restriction: normalizeText(cat.restriction ?? null),
            skill_effect: skillEffect,
            image: cat.image ?? null
        };
    }

    /**
     * @param {string} internalName
     * @returns {string|null}
     */
    lookupDisplayNameByInternalName(internalName) {
        const row = this.getSkillDetail(internalName);
        if (!row) return null;
        const dn = row.display_name;
        if (dn != null && String(dn).trim() !== '') return String(dn);
        return internalName;
    }

    /**
     * @param {string} refToken internal skill id
     * @param {number[]} versionIds
     */
    resolveCrossSkillRef(refToken, _versionIds) {
        if (refToken == null || String(refToken).trim() === '') return null;
        const ref = String(refToken).trim();
        const cat = this.catalogByInternalId.get(ref);
        if (!cat) return null;
        const dn = this.lookupDisplayNameByInternalName(ref) || ref;
        return { internalName: ref, displayName: dn };
    }

    /**
     * @param {string} internalName
     * @returns {Promise<object|null>}
     */
    async loadSkillBalance(internalName) {
        const safe = String(internalName).replace(/\//g, '_');
        return this.balanceCache.get(safe) ?? null;
    }

    getSkillBalanceSync(internalName) {
        const safe = String(internalName).replace(/\//g, '_');
        return this.balanceCache.get(safe) ?? null;
    }

    /**
     * @param {number[]} versionIds
     */
    findScalingRow(skillInternalName, versionIds, level, statKeyLower, occurrenceIndex, variantKey) {
        const bal = this.getSkillBalanceSync(skillInternalName);
        if (!bal?.scaling?.length) return null;
        const sk = String(statKeyLower).toLowerCase();
        const occ = occurrenceIndex ?? 0;
        const vk = variantKey != null && String(variantKey).trim() !== '' ? String(variantKey).trim() : null;

        for (const vid of versionIds) {
            const rows = bal.scaling.filter((r) => Number(r.versionId) === Number(vid));
            if (vk) {
                const hit = rows.find(
                    (r) =>
                        Number(r.level) === Number(level) &&
                        String(r.statKey).toLowerCase() === sk &&
                        Number(r.occurrenceIndex) === occ &&
                        String(r.variantKey || '') === vk
                );
                if (hit) return this._formatScalingHit(hit);
            }
            const hit = rows.find(
                (r) =>
                    Number(r.level) === Number(level) &&
                    String(r.statKey).toLowerCase() === sk &&
                    Number(r.occurrenceIndex) === occ &&
                    (!r.variantKey || String(r.variantKey).trim() === '')
            );
            if (hit) return this._formatScalingHit(hit);
        }
        return null;
    }

    _formatScalingHit(hit) {
        const st = this.getStatByKeyLower(hit.statKey);
        const slot = (n) => {
            if (n === 3 && String(hit.statKey || '').toLowerCase() === 'mana_cost') {
                const mm = manaCostMinManaFromRow(hit);
                return mm == null ? null : mm;
            }
            const k = `value${n}`;
            if (!Object.prototype.hasOwnProperty.call(hit, k) || hit[k] == null) return null;
            const s = String(hit[k]).trim();
            return s === '' ? null : String(hit[k]);
        };
        return {
            value0: slot(0),
            value1: slot(1),
            value2: slot(2),
            value3: slot(3),
            statName: st?.name ?? hit.statKey,
            format: st?.format,
            signed: st?.signed,
            value0_constant: false,
            value1_constant: false,
            value2_constant: false,
            value3_constant: false,
        };
    }

    findConstantsRow(skillInternalName, versionIds, statKeyLower, occurrenceIndex, variantKey) {
        const bal = this.getSkillBalanceSync(skillInternalName);
        if (!bal?.scalingConstants?.length) return null;
        const sk = String(statKeyLower).toLowerCase();
        const occ = occurrenceIndex ?? 0;
        const vk = variantKey != null && String(variantKey).trim() !== '' ? String(variantKey).trim() : null;

        for (const vid of versionIds) {
            const rows = bal.scalingConstants.filter(
                (r) => r.versionId == null || Number(r.versionId) === Number(vid)
            );
            if (vk) {
                const hit = rows.find(
                    (r) =>
                        String(r.statKey).toLowerCase() === sk &&
                        Number(r.occurrenceIndex) === occ &&
                        String(r.variantKey || '') === vk
                );
                if (hit) return this._formatConstHit(hit);
            }
            const hit = rows.find(
                (r) =>
                    String(r.statKey).toLowerCase() === sk &&
                    Number(r.occurrenceIndex) === occ &&
                    (!r.variantKey || String(r.variantKey).trim() === '')
            );
            if (hit) return this._formatConstHit(hit);
        }
        return null;
    }

    _formatConstHit(hit) {
        const st = this.getStatByKeyLower(hit.statKey);
        const slotStr = (n) => {
            if (n === 3 && String(hit.statKey || '').toLowerCase() === 'mana_cost') {
                const mm = manaCostMinManaFromRow(hit);
                return mm == null ? '' : mm;
            }
            const k = `value${n}`;
            if (!Object.prototype.hasOwnProperty.call(hit, k) || hit[k] == null) return '';
            return String(hit[k]).trim();
        };
        /** JSON may omit *_constant; then non-empty value slots are treated as constants. */
        const inferConst = (n) => {
            if (n === 3 && String(hit.statKey || '').toLowerCase() === 'mana_cost') {
                return manaCostMinManaFromRow(hit) != null;
            }
            const ck = `value${n}_constant`;
            if (Object.prototype.hasOwnProperty.call(hit, ck)) {
                const v = hit[ck];
                if (v === 0 || v === false || v === '0') return false;
                return Boolean(v);
            }
            return slotStr(n).length > 0;
        };
        let minCharacterLevel;
        if (Object.prototype.hasOwnProperty.call(hit, 'minCharacterLevel')) {
            const n = Number(hit.minCharacterLevel);
            if (Number.isFinite(n) && n > 0) minCharacterLevel = Math.floor(n);
        }
        return {
            value0: slotStr(0),
            value1: slotStr(1),
            value2: slotStr(2),
            value3: slotStr(3),
            value0_constant: inferConst(0),
            value1_constant: inferConst(1),
            value2_constant: inferConst(2),
            value3_constant: inferConst(3),
            statName: st?.name ?? hit.statKey,
            format: st?.format,
            signed: st?.signed,
            ...(minCharacterLevel !== undefined ? { minCharacterLevel } : {})
        };
    }

    hasScalingData(skillInternalName, versionIds) {
        const bal = this.getSkillBalanceSync(skillInternalName);
        if (!bal) return false;
        for (const vid of versionIds) {
            if (bal.scaling?.some((r) => Number(r.versionId) === Number(vid))) return true;
            if (
                bal.scalingConstants?.some(
                    (r) => r.versionId == null || Number(r.versionId) === Number(vid)
                )
            )
                return true;
        }
        return false;
    }

    getAvailableLevels(skillInternalName, versionIds) {
        const bal = this.getSkillBalanceSync(skillInternalName);
        if (!bal?.scaling?.length) return [];
        for (const vid of versionIds) {
            const levels = [
                ...new Set(
                    bal.scaling
                        .filter((r) => Number(r.versionId) === Number(vid))
                        .map((r) => Number(r.level))
                )
            ].sort((a, b) => a - b);
            if (levels.length) return levels;
        }
        return [];
    }

    getVariantTextOverrides(internalId, variantKey) {
        if (!variantKey) return null;
        const internal = internalId != null ? String(internalId) : '';
        if (!internal) return null;
        const row = this.catalogByInternalId?.get(internal);
        const list = row?.variants;
        if (!Array.isArray(list) || list.length === 0) return null;
        const v = list.find((x) => x.variant_key === variantKey);
        if (!v) return null;
        return {
            description: variantOverrideLinesToString(v.description_override),
            skill_effect: variantOverrideLinesToString(v.skill_effect_override),
            restriction: variantOverrideLinesToString(v.restriction_override)
        };
    }

    // maxLevel fields were removed from skills.json; effective max levels are computed elsewhere.
}

/**
 * Load versions.json, stats, and catalog for the requested or default patch folder.
 * @param {{ major: number, minor: number }} [defaultVersion] defaults to {@link DEFAULT_GAME_VERSION}
 * @returns {Promise<SkillFileStore>}
 */
export async function initSkillDataStore(defaultVersion = DEFAULT_GAME_VERSION) {
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const versions = await fetchJson(`${TREE_DATA_DIR}/versions.json`);
        const cur = getRequestedTreeVersion(versions, defaultVersion);
        const folderSeg = treeAssetFolderFromMajorMinor(cur.major, cur.minor);
        const stats = await fetchJson(`${TREE_DATA_DIR}/stats.json`);
        const gameMeta = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/game_meta.json`);
        const skills = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/skills.json`);
        let subskills = [];
        try {
            const rawSubskills = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/subskills.json`);
            subskills = Array.isArray(rawSubskills) ? rawSubskills : [];
        } catch (_e) {
            // Optional file; older versions may not have it.
            // Keep default [].
        }

        // Subskills file is intentionally minimal; inherit display/placement fields from the parent skill.
        const skillsById = new Map((Array.isArray(skills) ? skills : []).map((r) => [String(r?.id), r]));
        for (const ss of subskills) {
            const pid = ss?.parentSkillId != null ? String(ss.parentSkillId).trim() : '';
            if (!pid) continue;
            const parent = skillsById.get(pid);
            if (!parent) continue;
            for (const k of ['classId', 'tab', 'class', 'tabName', 'tags', 'image', 'baseMaxLevel', 'affectedBySpecialization']) {
                if (ss[k] == null) ss[k] = parent[k] ?? null;
            }
            if (ss.variants == null) ss.variants = [];
            if (ss.restriction == null) ss.restriction = [];
        }
        const characterStatRegistry = await fetchJson(
            `${TREE_DATA_DIR}/${folderSeg}/character_stats.json`
        );

        // Optional per-version conditions file. New feature: conditions.json
        let conditions = [];
        try {
            const rawConditions = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/conditions.json`);
            conditions = Array.isArray(rawConditions) ? rawConditions : [];
        } catch (_e) {
            // Optional file; keep default [] if not present.
        }

        const store = new SkillFileStore();
        store.versions = versions;
        store.stats = stats;
        // attach conditions and build lookup
        store.conditions = conditions;
        for (const c of conditions) {
            if (c && c.key) store.conditionsByKeyLower.set(String(c.key).toLowerCase(), c);
        }
        for (const s of stats) {
            if (s.key) store.statsByKeyLower.set(String(s.key).toLowerCase(), s);
        }
        store.characterStatRegistry = Array.isArray(characterStatRegistry) ? characterStatRegistry : [];
        store.characterStatByKeyLower = new Map();
        store.characterStatByStatsKeyLower = new Map();
        for (const r of store.characterStatRegistry) {
            if (r && r.key) {
                store.characterStatByKeyLower.set(String(r.key).toLowerCase(), r);
            }
            const sk = r?.statsKey;
            if (typeof sk === 'string' && sk.trim() !== '') {
                store.characterStatByStatsKeyLower.set(sk.trim().toLowerCase(), r);
            }
        }
        // Reverse map stats.json keys -> character_stats via single pairedStat target
        // (e.g. life_steal -> life_stolen_per_hit) so {{life_steal}} formulas resolve.
        for (const s of stats) {
            if (!s?.key) continue;
            const statsKeyLower = String(s.key).toLowerCase();
            if (store.characterStatByStatsKeyLower.has(statsKeyLower)) continue;
            if (store.characterStatByKeyLower.has(statsKeyLower)) continue;
            const paired = Array.isArray(s.pairedStat) ? s.pairedStat : [];
            /** @type {Set<string>} */
            const plannerKeys = new Set();
            for (const entry of paired) {
                if (!entry || typeof entry !== 'object') continue;
                const st =
                    entry.stat ??
                    entry.plannerKey ??
                    entry.key ??
                    entry.characterStat ??
                    entry.character_stat;
                if (st == null) continue;
                const token = String(st).trim().toLowerCase();
                if (!token) continue;
                let row = store.characterStatByKeyLower.get(token);
                if (!row) row = store.characterStatByStatsKeyLower.get(token);
                if (row?.key) plannerKeys.add(String(row.key).toLowerCase());
            }
            if (plannerKeys.size !== 1) continue;
            const pk = [...plannerKeys][0];
            const row = store.characterStatByKeyLower.get(pk);
            if (row) store.characterStatByStatsKeyLower.set(statsKeyLower, row);
        }
        store.folderSeg = folderSeg;
        store.gameMeta = gameMeta;
        const vRow = store.versions.find((v) => v.major === cur.major && v.minor === cur.minor);
        store.currentVersionId = vRow?.id ?? null;
        store.catalog = [...skills, ...subskills];
        store.catalogByInternalId = new Map();
        for (const row of store.catalog) {
            row._plannerClassIds = store.computePlannerClassIdsForRow(row);
            store.catalogByInternalId.set(String(row.id), row);
            const safe = String(row.id).replace(/\//g, '_');
            store.balanceCache.set(safe, balanceObjectFromMergedRow(row));
        }
        _store = store;
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('skillDataStoreInitialized', { detail: { folderSeg } }));
        }
        return store;
    })();

    return _initPromise;
}

/**
 * @returns {SkillFileStore | null} singleton after {@link initSkillDataStore}
 */
export function getFileSkillStore() {
    return _store;
}

/**
 * Accrued attribute before skill bonuses / gear % — game `stat(N,1)`.
 * Formula token {{base_dexterity}} maps to planner raw dexterity.
 */
const BASE_ATTRIBUTE_FORMULA_KEYS = Object.freeze({
    base_strength: 'strength',
    base_dexterity: 'dexterity',
    base_vitality: 'vitality',
    base_energy: 'energy',
});

/**
 * Resolve a {{token}} to a character_stats registry key.
 * Handles identity keys and stats.json aliases via statsKey / pairedStat reverse map
 * (e.g. life_steal -> life_stolen_per_hit).
 * @param {string|null|undefined} token
 * @returns {string|null} lowercased planner key, or null
 */
export function resolveCharacterStatKeyForToken(token) {
    const store = getFileSkillStore();
    if (!store || token == null) return null;
    const k = String(token).trim().toLowerCase();
    if (!k) return null;
    if (BASE_ATTRIBUTE_FORMULA_KEYS[k]) return BASE_ATTRIBUTE_FORMULA_KEYS[k];
    if (store.characterStatByKeyLower.has(k)) return k;
    const viaStatsKey = store.characterStatByStatsKeyLower.get(k);
    if (viaStatsKey?.key) return String(viaStatsKey.key).trim().toLowerCase();
    return null;
}

/**
 * Inject {{base_*}} attribute values for formula evaluation (raw accrued attrs).
 * @param {Record<string, number|string|undefined|null>} stats
 * @param {{ getRawStat?: (key: string) => number }|null} [character]
 * @returns {Record<string, number|string|undefined|null>}
 */
export function withBaseAttributeFormulaStats(stats, character = null) {
    const out = { ...(stats || {}) };
    for (const [baseKey, attrKey] of Object.entries(BASE_ATTRIBUTE_FORMULA_KEYS)) {
        if (character && typeof character.getRawStat === 'function') {
            out[baseKey] = character.getRawStat(attrKey);
        } else if (out[baseKey] === undefined && out[attrKey] !== undefined) {
            out[baseKey] = out[attrKey];
        }
    }
    // D2 stat 7/9 (max life/mana) in display points. Planner `life`/`mana` are the computed pools.
    const maxLife =
        character && typeof character.getStat === 'function'
            ? character.getStat('life')
            : Number(out.life) || 0;
    const maxMana =
        character && typeof character.getStat === 'function'
            ? character.getStat('mana')
            : Number(out.mana) || 0;
    out.base_life = Number.isFinite(maxLife) ? maxLife : 0;
    out.base_mana = Number.isFinite(maxMana) ? maxMana : 0;
    if (character && typeof character.getRawStat === 'function') {
        const currentLife = character.getRawStat('current_life');
        const currentMana = character.getRawStat('current_mana');
        if (Number.isFinite(currentLife)) out.current_life = currentLife;
        if (Number.isFinite(currentMana)) out.current_mana = currentMana;
    }
    return out;
}

/**
 * Merged display_name for internal skill name (same rules as planner lists).
 * @param {string} internalName - skills.name
 * @returns {string|null}
 */
export function lookupMergedDisplayNameByInternalName(internalName) {
    if (internalName == null || String(internalName).trim() === '') return null;
    const s = getFileSkillStore();
    if (!s) return null;
    return s.lookupDisplayNameByInternalName(String(internalName).trim());
}

/** Clear singleton so the next init reloads tree_data (version switches, tests, patch-notes). */
export function resetSkillDataStore() {
    _store = null;
    _initPromise = null;
}

/** @deprecated Use {@link resetSkillDataStore} */
export function resetSkillDataStoreForTests() {
    resetSkillDataStore();
}
