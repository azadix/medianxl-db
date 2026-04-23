/**
 * File-backed skill data (tree_data/*.json).
 * Does not import version-config (avoid circular deps). Duplicates minimal version helpers.
 */

const TREE_DATA_DIR = 'tree_data';
const BUILD_VERSION_OVERRIDE_KEY = 'medianxl_build_version_override';

/** @type {SkillFileStore | null} */
let _store = null;
let _initPromise = null;

function versionToFolder(major, minor) {
    return `${major}_${minor}`;
}

function parseBuildOverride() {
    const raw = localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY);
    if (!raw) return null;
    try {
        const o = JSON.parse(raw);
        if (o && typeof o.major === 'number' && typeof o.minor === 'number') {
            return { major: o.major, minor: o.minor };
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * @returns {{ major: number, minor: number }}
 */
export function getRequestedTreeVersion(versionsList, defaultVersion) {
    const ov = parseBuildOverride();
    if (ov && versionsList?.length) {
        const ok = versionsList.some((v) => v.major === ov.major && v.minor === ov.minor);
        if (ok) return ov;
    }
    const active = versionsList?.find((v) => v.is_active);
    if (active) return { major: active.major, minor: active.minor };
    if (versionsList?.length) {
        const v = versionsList[0];
        return { major: v.major, minor: v.minor };
    }
    return defaultVersion;
}

async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Failed to load ${path}: ${res.status}`);
    }
    return res.json();
}

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
        mergedSkillId: row.numericId,
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
        /** @type {Array<{id?:number,key:string,label:string,min?:number|null,max?:number|null,allowNegative?:boolean,default?:number,alwaysVisible?:boolean,sortOrder?:number}>} */
        this.characterStatRegistry = [];
        /** @type {Map<string, object>} */
        this.characterStatByKeyLower = new Map();
        /** @type {Map<string, object>} stats.json key -> character stat row */
        this.characterStatByStatsKeyLower = new Map();
        /** @type {number|null} version id (from versions.json) matching loaded folder */
        this.currentVersionId = null;
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
     * Optional `pairedStat`: `[{ valueIndex: 0..3, stat|plannerKey }]` routes value slots to planner character_stats keys (see planner-stat-modifiers).
     */
    getStatByKeyLower(key) {
        return this.statsByKeyLower.get(String(key).toLowerCase()) ?? null;
    }

    /**
     * Planner class ids for a catalog row. Supports:
     * - `classIds`: [2, 6, ...] explicit numeric ids
     * - `class`: "__all__" or "*" = every class except Other (id 1)
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
            return (this.gameMeta?.classes || [])
                .map((c) => c.id)
                .filter((id) => id !== 1);
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
            numericId: cat.numericId,
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
     * @param {number} numericId
     * @returns {{ name: string, displayName: string }|null}
     */
    lookupSkillNameAndDisplayByNumericId(numericId) {
        const id = typeof numericId === 'number' ? numericId : parseInt(String(numericId), 10);
        if (!Number.isFinite(id)) return null;
        for (const row of this.catalog) {
            if (row.numericId === id) {
                const name = String(row.id);
                const dn =
                    row.displayName != null && String(row.displayName).trim() !== ''
                        ? String(row.displayName)
                        : name;
                return { name, displayName: dn };
            }
        }
        return null;
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
     * @param {string} refToken internal name or id:123
     * @param {number[]} versionIds
     */
    resolveCrossSkillRef(refToken, _versionIds) {
        if (refToken == null || String(refToken).trim() === '') return null;
        const ref = String(refToken).trim();
        const idMatch = ref.match(/^id:(\d+)$/i);
        if (idMatch) {
            const nid = parseInt(idMatch[1], 10);
            const row = this.lookupSkillNameAndDisplayByNumericId(nid);
            if (!row) return null;
            return {
                skillId: nid,
                internalName: row.name,
                displayName: row.displayName
            };
        }
        const cat = this.catalogByInternalId.get(ref);
        if (!cat) return null;
        const nid = cat.numericId;
        if (nid == null) return null;
        const dn = this.lookupDisplayNameByInternalName(ref) || ref;
        return { skillId: Number(nid), internalName: ref, displayName: dn };
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
            value0_constant: false,
            value1_constant: false,
            value2_constant: false,
            value3_constant: false
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
            format: st?.format
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

    internalNameByNumericId(numericId) {
        const id = typeof numericId === 'number' ? numericId : parseInt(String(numericId), 10);
        if (!Number.isFinite(id)) return null;
        for (const row of this.catalog) {
            if (row.numericId === id) return String(row.id);
        }
        return null;
    }

    getVariantTextOverrides(numericId, variantKey) {
        if (!variantKey) return null;
        const internal = this.internalNameByNumericId(numericId);
        if (!internal) return null;
        const row = this.catalogByInternalId?.get(String(internal));
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
 * @param {{ major: number, minor: number }} defaultVersion
 */
export async function initSkillDataStore(defaultVersion) {
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const versions = await fetchJson(`${TREE_DATA_DIR}/versions.json`);
        const cur = getRequestedTreeVersion(versions, defaultVersion);
        const folderSeg = versionToFolder(cur.major, cur.minor);
        const stats = await fetchJson(`${TREE_DATA_DIR}/stats.json`);
        const gameMeta = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/game_meta.json`);
        const skills = await fetchJson(`${TREE_DATA_DIR}/${folderSeg}/skills.json`);
        const characterStatRegistry = await fetchJson(
            `${TREE_DATA_DIR}/${folderSeg}/character_stats.json`
        );

        const store = new SkillFileStore();
        store.versions = versions;
        store.stats = stats;
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
        store.folderSeg = folderSeg;
        store.gameMeta = gameMeta;
        const vRow = store.versions.find((v) => v.major === cur.major && v.minor === cur.minor);
        store.currentVersionId = vRow?.id ?? null;
        store.catalog = skills;
        store.catalogByInternalId = new Map();
        for (const row of skills) {
            row._plannerClassIds = store.computePlannerClassIdsForRow(row);
            store.catalogByInternalId.set(String(row.id), row);
            const safe = String(row.id).replace(/\//g, '_');
            store.balanceCache.set(safe, balanceObjectFromMergedRow(row));
        }
        _store = store;
        return store;
    })();

    return _initPromise;
}

export function getFileSkillStore() {
    return _store;
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

/**
 * Resolve a numeric skills.id to internal name and display label.
 * @returns {{ name: string, displayName: string }|null}
 */
export function lookupSkillNameAndDisplayByNumericId(numericId) {
    if (numericId == null) return null;
    return getFileSkillStore()?.lookupSkillNameAndDisplayByNumericId(numericId) ?? null;
}

export function resetSkillDataStoreForTests() {
    _store = null;
    _initPromise = null;
}
