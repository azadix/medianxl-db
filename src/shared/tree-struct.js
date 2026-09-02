/**
 * Planner grid layout from versioned JSON under tree_data/.
 *
 * Path: tree_data/<major>_<minor>/tree_struct.json
 *
 * Schema (root = class name -> tab name -> block):
 * {
 *   "Sorceress": {
 *     "Fire": {
 *       "skill_details": [
 *         {
 *           "id": "warmth",
 *           "row": 1,
 *           "col": 1,
 *           "layoutParents": ["fire_bolt"],
 *           "prerequisites": {
 *             "character_level": 10,
 *             "skill_level": ["fire_bolt", 1],
 *             "tree_points": ["Warmonger", 30],
 *             "skill_blocked_by": ["stormcall", 0]
 *           }
 *         }
 *       ]
 *     }
 *   }
 * }
 *
 * `layoutParents`: visual tree arrows (parent skill ids), derived at load time.
 * Multiple skill_level / skill_blocked_by entries use an array of pairs (AND):
 *   `"skill_level": [["a", 1], ["b", 1]]`
 * OR groups are nested arrays of pairs (AND across groups, OR within):
 *   `"skill_level": [[["a", 15], ["b", 15]], [["c", 15], ["d", 15]]]`
 * Mixed AND pairs and OR groups may appear in the same skill_level list.
 */

export const TREE_DATA_DIR = 'tree_data';

export function treeStructJsonPath(major, minor) {
    const seg = `${major}_${minor}`;
    return `${TREE_DATA_DIR}/${seg}/tree_struct.json`;
}

/**
 * @param {object|null} raw
 * @param {number} major
 * @param {number} minor
 * @returns {object|null}
 */
function unwrapVersionedTreeRoot(raw, major, minor) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const a = raw[`${major}.${minor}`];
    const b = raw[`${major}_${minor}`];
    if (a && typeof a === 'object' && !Array.isArray(a)) return a;
    if (b && typeof b === 'object' && !Array.isArray(b)) return b;
    return raw;
}

/**
 * @param {object|null} raw
 * @param {number} major
 * @param {number} minor
 * @returns {object|null}
 */
export function normalizeTreeStructPayload(raw, major, minor) {
    const root = unwrapVersionedTreeRoot(raw, major, minor);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    return root;
}

export async function fetchTreeStructJson(major, minor) {
    try {
        const res = await fetch(treeStructJsonPath(major, minor));
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return normalizeTreeStructPayload(data, major, minor);
    } catch (e) {
        console.warn('fetchTreeStructJson:', e.message);
        return null;
    }
}

/**
 * @param {object|null} treeStruct
 * @returns {object|null}
 */
export function getTreeLayoutRoot(treeStruct) {
    if (!treeStruct || typeof treeStruct !== 'object' || Array.isArray(treeStruct)) return null;
    return treeStruct;
}

/** @type {Map<string, Map<string, [string, string][]>>} classLower -> tabLower -> pairs */
const treeStructArrowCache = new Map();

export function clearTreeStructArrowsCache() {
    treeStructArrowCache.clear();
}

function isTabLayoutBlock(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

/** @param {object|null|undefined} tabBlock */
function getSkillDetailsList(tabBlock) {
    if (!tabBlock || typeof tabBlock !== 'object') return null;
    const arr = tabBlock.skill_details;
    return Array.isArray(arr) ? arr : null;
}

/**
 * @param {object|null} layoutRoot
 */
export function cacheTreeStructArrowsFromLayoutRoot(layoutRoot) {
    treeStructArrowCache.clear();
    if (!layoutRoot || typeof layoutRoot !== 'object' || Array.isArray(layoutRoot)) return;
    for (const [classKey, classObj] of Object.entries(layoutRoot)) {
        if (!isTabLayoutBlock(classObj)) continue;
        const cLow = String(classKey).toLowerCase();
        let tabMap = treeStructArrowCache.get(cLow);
        if (!tabMap) {
            tabMap = new Map();
            treeStructArrowCache.set(cLow, tabMap);
        }
        for (const [tabName, tabBlock] of Object.entries(classObj)) {
            if (!isTabLayoutBlock(tabBlock)) continue;
            const details = getSkillDetailsList(tabBlock);
            if (!details) continue;
            const pairs = deriveArrowsFromSkillDetails(details);
            if (pairs.length) {
                tabMap.set(String(tabName).toLowerCase(), pairs);
            }
        }
    }
}

/**
 * @param {{ id: string, class: string }[]} skillsInTab
 * @returns {[string, string][]}
 */
export function getTreeArrowPairsForSkillsInTab(skillsInTab) {
    if (!skillsInTab.length || treeStructArrowCache.size === 0) return [];
    const cls = String(skillsInTab[0].class).toLowerCase();
    const tab = String(skillsInTab[0].tabName).toLowerCase();
    const byTab = treeStructArrowCache.get(cls);
    const pairs = byTab?.get(tab) || [];
    const ids = new Set(skillsInTab.map((s) => s.id));
    return pairs.filter(([f, t]) => ids.has(f) && ids.has(t));
}

function resolveCanonicalClassName(requested, classNameByLower) {
    if (!requested || !classNameByLower.size) return null;
    const hit = classNameByLower.get(String(requested).toLowerCase());
    return hit ?? null;
}

/**
 * @param {string} type
 * @param {string|number} value
 * @param {string} [target]
 * @returns {string}
 */
function formatPrereqTriple(type, value, target = '') {
    return `${type}:${value}:${target ?? ''}`;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function isPrereqPair(raw) {
    return (
        Array.isArray(raw) &&
        raw.length >= 2 &&
        typeof raw[0] === 'string' &&
        raw[0].trim() !== '' &&
        Number.isFinite(Number(raw[1]))
    );
}

/**
 * OR group: array of two or more prereq pairs.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isOrGroup(raw) {
    return Array.isArray(raw) && raw.length >= 2 && raw.every(isPrereqPair);
}

/**
 * @param {unknown} raw
 * @returns {[string, number][]}
 */
function normalizePrereqPairList(raw) {
    if (!raw) return [];
    if (isPrereqPair(raw)) {
        return [[String(raw[0]).trim(), Math.floor(Number(raw[1]))]];
    }
    if (!Array.isArray(raw)) return [];
    /** @type {[string, number][]} */
    const out = [];
    for (const item of raw) {
        if (!isPrereqPair(item)) continue;
        out.push([String(item[0]).trim(), Math.floor(Number(item[1]))]);
    }
    return out;
}

/**
 * Emit planner strings for skill_level (AND pairs and OR groups).
 * @param {unknown} raw
 * @returns {string[]}
 */
function skillLevelToPlannerStrings(raw) {
    if (!raw) return [];
    if (isPrereqPair(raw)) {
        return [formatPrereqTriple('skill_level', Math.floor(Number(raw[1])), String(raw[0]).trim())];
    }
    if (!Array.isArray(raw)) return [];
    /** @type {string[]} */
    const out = [];
    for (const item of raw) {
        if (isOrGroup(item)) {
            const points = Math.floor(Number(item[0][1]));
            const ids = item.map((pair) => String(pair[0]).trim()).join('|');
            out.push(formatPrereqTriple('skill_level_any', points, ids));
        } else if (isPrereqPair(item)) {
            out.push(
                formatPrereqTriple('skill_level', Math.floor(Number(item[1])), String(item[0]).trim())
            );
        }
    }
    return out;
}

/**
 * Convert tree_struct prerequisite objects to planner prerequisite strings.
 * @param {object} obj
 * @returns {string[]}
 */
function prerequisitesObjectToPlannerStrings(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
    /** @type {string[]} */
    const out = [];

    if (obj.character_level != null && String(obj.character_level).trim() !== '') {
        const n = Math.floor(Number(obj.character_level));
        if (Number.isFinite(n)) out.push(formatPrereqTriple('character_level', n));
    }

    out.push(...skillLevelToPlannerStrings(obj.skill_level));

    for (const [skillId, maxPoints] of normalizePrereqPairList(obj.skill_blocked_by)) {
        out.push(formatPrereqTriple('skill_blocked_by', maxPoints, skillId));
    }

    if (obj.tree_points != null) {
        const pairs = normalizePrereqPairList(obj.tree_points);
        if (pairs.length === 1) {
            const [tabName, points] = pairs[0];
            out.push(formatPrereqTriple('tree_points', points, tabName));
        }
    }

    return out;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeLayoutParentsFromEntry(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        if (item == null || String(item).trim() === '') continue;
        const id = String(item).trim();
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * @param {object[]} skillDetails
 * @returns {[string, string][]}
 */
export function deriveArrowsFromSkillDetails(skillDetails) {
    if (!Array.isArray(skillDetails)) return [];
    /** @type {[string, string][]} */
    const pairs = [];
    for (const entry of skillDetails) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const childId = entry.id;
        if (childId == null || String(childId).trim() === '') continue;
        const child = String(childId).trim();
        for (const parent of normalizeLayoutParentsFromEntry(entry.layoutParents)) {
            pairs.push([parent, child]);
        }
    }
    return pairs;
}

/**
 * @param {unknown} entry
 * @returns {{ skill: string, row: number, col: number, prerequisites: string[], layoutParents: string[] }|null}
 */
export function parseSkillPositionEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const id = entry.id;
    if (id == null || String(id).trim() === '') return null;
    const row = Number(entry.row);
    const col = Number(entry.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
    const rawPrereq = entry.prerequisites;
    const prerequisites =
        rawPrereq && typeof rawPrereq === 'object' && !Array.isArray(rawPrereq)
            ? prerequisitesObjectToPlannerStrings(rawPrereq)
            : [];
    const layoutParents = normalizeLayoutParentsFromEntry(entry.layoutParents);
    return { skill: String(id), row, col, prerequisites, layoutParents };
}

/**
 * @returns {Map<string, { tabName: string, row: number, col: number, layoutTabRank: number }>}
 */
export function buildTreeStructLayoutLookupMap(layoutRoot, classNameByLower) {
    const byKey = new Map();
    if (!layoutRoot || typeof layoutRoot !== 'object' || Array.isArray(layoutRoot) || !classNameByLower.size) {
        return byKey;
    }
    for (const [classKey, classObj] of Object.entries(layoutRoot)) {
        if (!isTabLayoutBlock(classObj)) continue;
        const className = resolveCanonicalClassName(classKey, classNameByLower);
        if (!className) continue;
        let tabRank = 0;
        for (const [tabName, tabBlock] of Object.entries(classObj)) {
            if (!isTabLayoutBlock(tabBlock)) continue;
            const details = getSkillDetailsList(tabBlock);
            if (!details) {
                tabRank += 1;
                continue;
            }
            for (const entry of details) {
                const p = parseSkillPositionEntry(entry);
                if (!p) continue;
                byKey.set(`${String(className).toLowerCase()}|${p.skill}`, {
                    tabName: String(tabName),
                    row: p.row,
                    col: p.col,
                    layoutTabRank: tabRank
                });
            }
            tabRank += 1;
        }
    }
    return byKey;
}

/**
 * @param {object[]} mergedSkills
 * @param {object|null} layoutRoot
 */
export function applyTreeStructLayoutToSkills(mergedSkills, layoutRoot) {
    if (!layoutRoot || !mergedSkills.length) return;

    const classNameByLower = new Map();
    for (const s of mergedSkills) {
        if (s.class) {
            classNameByLower.set(String(s.class).toLowerCase(), s.class);
        }
    }

    const byKey = buildTreeStructLayoutLookupMap(layoutRoot, classNameByLower);

    const altSkillIdsForLookup = (idRaw) => {
        const id = String(idRaw ?? '').trim();
        if (!id) return [];
        if (id.endsWith('_innate')) {
            return [id, id.slice(0, -'_innate'.length)];
        }
        return [id, `${id}_innate`];
    };

    for (const s of mergedSkills) {
        const cLow = String(s.class).toLowerCase();
        let hit = byKey.get(`${cLow}|${String(s.id)}`);
        if (!hit) {
            for (const alt of altSkillIdsForLookup(s.id)) {
                hit = byKey.get(`${cLow}|${alt}`);
                if (hit) break;
            }
        }
        if (hit) {
            s.tabName = hit.tabName;
            s.row = hit.row;
            s.col = hit.col;
        } else {
            s.row = s.row ?? 0;
            s.col = s.col ?? 0;
        }
    }
}

/**
 * @param {Skill[]} mergedSkills
 * @param {object|null} layoutRoot
 * @returns {Skill[]}
 */
export function buildPlannerSkillsFromTreeStruct(mergedSkills, layoutRoot) {
    if (!layoutRoot || !mergedSkills.length) return mergedSkills;

    const classNameByLower = new Map();
    for (const s of mergedSkills) {
        if (s.class) {
            classNameByLower.set(String(s.class).toLowerCase(), s.class);
        }
    }

    const byClassSkill = new Map();
    for (const s of mergedSkills) {
        if (!s.class || !s.id) continue;
        byClassSkill.set(`${String(s.class).toLowerCase()}|${String(s.id)}`, s);
    }

    const altSkillIdsForLookup = (idRaw) => {
        const id = String(idRaw ?? '').trim();
        if (!id) return [];
        if (id.endsWith('_innate')) {
            return [id, id.slice(0, -'_innate'.length)];
        }
        return [id, `${id}_innate`];
    };

    const out = [];
    for (const [classKey, classObj] of Object.entries(layoutRoot)) {
        if (!isTabLayoutBlock(classObj)) continue;
        const className = resolveCanonicalClassName(classKey, classNameByLower);
        if (!className) {
            console.warn('tree_struct: unknown class key:', classKey);
            continue;
        }
        for (const [tabName, tabBlock] of Object.entries(classObj)) {
            if (!isTabLayoutBlock(tabBlock)) continue;
            const details = getSkillDetailsList(tabBlock);
            if (!details) continue;
            for (const entry of details) {
                const p = parseSkillPositionEntry(entry);
                if (!p) {
                    console.warn('tree_struct: bad skill_details entry', classKey, tabName, entry);
                    continue;
                }
                const cLow = className.toLowerCase();
                let base = byClassSkill.get(`${cLow}|${p.skill}`);
                if (!base) {
                    for (const alt of altSkillIdsForLookup(p.skill)) {
                        base = byClassSkill.get(`${cLow}|${alt}`);
                        if (base) break;
                    }
                }
                if (!base) {
                    console.warn('tree_struct: no merged skill for', className, p.skill);
                    continue;
                }
                const sk = base.clone();
                sk.row = p.row;
                sk.col = p.col;
                sk.tabName = String(tabName);
                out.push(sk);
            }
        }
    }
    return out.length > 0 ? out : mergedSkills;
}

/**
 * @param {object|null} layoutRoot
 * @param {Map<string, string>} classNameByLower
 * @returns {Map<string, string[]>}
 */
export function buildTreeStructPrerequisiteLookupMap(layoutRoot, classNameByLower) {
    const byKey = new Map();
    if (!layoutRoot || typeof layoutRoot !== 'object' || Array.isArray(layoutRoot) || !classNameByLower.size) {
        return byKey;
    }
    for (const [classKey, classObj] of Object.entries(layoutRoot)) {
        if (!isTabLayoutBlock(classObj)) continue;
        const className = resolveCanonicalClassName(classKey, classNameByLower);
        if (!className) continue;
        const cLow = String(className).toLowerCase();
        for (const [, tabBlock] of Object.entries(classObj)) {
            if (!isTabLayoutBlock(tabBlock)) continue;
            const details = getSkillDetailsList(tabBlock);
            if (!details) continue;
            for (const entry of details) {
                const p = parseSkillPositionEntry(entry);
                if (!p) continue;
                const mapKey = `${cLow}|${p.skill}`;
                const list = p.prerequisites.length > 0 ? [...p.prerequisites] : [];
                byKey.set(mapKey, list);
            }
        }
    }
    return byKey;
}

/**
 * @param {object[]} mergedSkills
 * @param {object|null} layoutRoot
 */
export function applyTreeStructPrerequisitesToSkills(mergedSkills, layoutRoot) {
    if (!layoutRoot || !mergedSkills.length) return;

    const classNameByLower = new Map();
    for (const s of mergedSkills) {
        if (s.class) {
            classNameByLower.set(String(s.class).toLowerCase(), s.class);
        }
    }

    const byKey = buildTreeStructPrerequisiteLookupMap(layoutRoot, classNameByLower);

    const altSkillIdsForLookup = (idRaw) => {
        const id = String(idRaw ?? '').trim();
        if (!id) return [];
        if (id.endsWith('_innate')) {
            return [id, id.slice(0, -'_innate'.length)];
        }
        return [id, `${id}_innate`];
    };

    for (const s of mergedSkills) {
        if (!s.class || !s.id) continue;
        const cLow = String(s.class).toLowerCase();
        let list = [];
        for (const alt of altSkillIdsForLookup(s.id)) {
            const k = `${cLow}|${alt}`;
            if (byKey.has(k)) {
                list = [...byKey.get(k)];
                break;
            }
        }
        if (!list.length) {
            const suffix = `|${String(s.id)}`;
            for (const [mapKey, plist] of byKey) {
                if (plist.length && mapKey.endsWith(suffix)) {
                    list = [...plist];
                    break;
                }
            }
        }
        s.prerequisites = list;
    }
}
