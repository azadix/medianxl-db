/**
 * Planner grid layout from versioned JSON under tree_data/.
 *
 * Path: tree_data/<major>_<minor>/tree_struct.json
 *
 * Schema (root = class name -> tab name -> block):
 * {
 *   "Sorceress": {
 *     "Fire": {
 *       "arrows": [["prereq_internal", "dependent_internal"], ...],
 *       "skill_details": [
 *         { "id": "warmth", "row": 1, "col": 1,
 *           "prerequisites": ["skill_level:1:fire_bolt", "tree_points:10:Warmonger"] },
 *         ...
 *       ]
 *     }
 *   }
 * }
 *
 * Each string is requirement_type:requirement_value:target (same as planner Skill.prerequisites).
 * For skill_level and skill_blocked_by, target is the skill id (snake_case), not display name.
 * Omit "prerequisites" or use [] if none. Skills not listed in skill_details get no prerequisites on the planner.
 *
 * `id` may be spelled as `skill` or `name` instead of `id`. Tuple form [ "skill", row, col ] is also accepted.
 */

export const TREE_DATA_DIR = 'tree_data';

export function treeStructJsonPath(major, minor) {
    const seg = `${major}_${minor}`;
    return `${TREE_DATA_DIR}/${seg}/tree_struct.json`;
}

/**
 * @param {number} major
 * @param {number} minor
 * @returns {Promise<object|null>}
 */
function unwrapVersionedTreeRoot(raw, major, minor) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const a = raw[`${major}.${minor}`];
    const b = raw[`${major}_${minor}`];
    if (a && typeof a === 'object' && !Array.isArray(a)) return a;
    if (b && typeof b === 'object' && !Array.isArray(b)) return b;
    return raw;
}

function isLegacySkillGridTab(block) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
    if ('skill_details' in block || 'skill_positions' in block || 'arrows' in block) return false;
    const keys = Object.keys(block);
    if (!keys.length) return false;
    return keys.every((k) => {
        const v = block[k];
        return Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]));
    });
}

/**
 * Unwrap optional top-level version key; convert legacy tab maps (skill -> [r,c]) to { arrows, skill_details }.
 * @param {object|null} raw
 * @param {number} major
 * @param {number} minor
 * @returns {object|null}
 */
export function normalizeTreeStructPayload(raw, major, minor) {
    let root = unwrapVersionedTreeRoot(raw, major, minor);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;

    let needsLegacy = false;
    for (const classObj of Object.values(root)) {
        if (!classObj || typeof classObj !== 'object' || Array.isArray(classObj)) continue;
        for (const [tabName, block] of Object.entries(classObj)) {
            if (tabName === 'arrows') continue;
            if (isLegacySkillGridTab(block)) {
                needsLegacy = true;
                break;
            }
        }
        if (needsLegacy) break;
    }
    if (!needsLegacy) return root;

    const out = {};
    for (const [classKey, classObj] of Object.entries(root)) {
        if (!classObj || typeof classObj !== 'object' || Array.isArray(classObj)) continue;
        const classArrows = Array.isArray(classObj.arrows) ? classObj.arrows : [];
        const skillToTab = new Map();
        for (const [tabName, block] of Object.entries(classObj)) {
            if (tabName === 'arrows') continue;
            if (!isLegacySkillGridTab(block)) continue;
            for (const sk of Object.keys(block)) {
                skillToTab.set(sk, tabName);
            }
        }
        out[classKey] = {};
        for (const [tabName, block] of Object.entries(classObj)) {
            if (tabName === 'arrows') continue;
            if (!isLegacySkillGridTab(block)) {
                out[classKey][tabName] =
                    block && typeof block === 'object' && !Array.isArray(block) ? { ...block } : block;
                continue;
            }
            const skill_details = [];
            for (const sk of Object.keys(block).sort()) {
                const pos = block[sk];
                skill_details.push({ id: sk, row: Number(pos[0]), col: Number(pos[1]), prerequisites: [] });
            }
            const tabArrows = [];
            const seen = new Set();
            for (const pair of classArrows) {
                if (!Array.isArray(pair) || pair.length < 2) continue;
                const fr = String(pair[0]);
                const to = String(pair[1]);
                if (skillToTab.get(to) !== tabName) continue;
                const k = `${fr}\0${to}`;
                if (seen.has(k)) continue;
                seen.add(k);
                tabArrows.push([fr, to]);
            }
            out[classKey][tabName] = { arrows: tabArrows, skill_details };
        }
    }
    return out;
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
 * @param {object|null} treeStruct - parsed JSON root (entire file is one version)
 * @returns {object|null} same reference if usable layout object
 */
export function getTreeLayoutRoot(treeStruct) {
    if (!treeStruct || typeof treeStruct !== 'object' || Array.isArray(treeStruct)) return null;
    return treeStruct;
}

/** @deprecated use getTreeLayoutRoot */
export function getTreeLayoutRootForVersion(treeStruct, _major, _minor) {
    return getTreeLayoutRoot(treeStruct);
}

/** @type {Map<string, Map<string, [string, string][]>>} classLower -> tabLower -> pairs */
const treeStructArrowCache = new Map();

export function clearTreeStructArrowsCache() {
    treeStructArrowCache.clear();
}

function isTabLayoutBlock(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

/** Per-tab skill rows (layout + optional prerequisites). Prefer skill_details; skill_positions is legacy. */
function getSkillDetailsList(tabBlock) {
    if (!tabBlock || typeof tabBlock !== 'object') return null;
    const arr = tabBlock.skill_details ?? tabBlock.skill_positions;
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
            const raw = tabBlock.arrows;
            if (!Array.isArray(raw)) continue;
            const pairs = [];
            for (const item of raw) {
                if (Array.isArray(item) && item.length >= 2) {
                    pairs.push([String(item[0]), String(item[1])]);
                }
            }
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

function normalizePrerequisiteStringsFromEntry(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw) {
        if (typeof x === 'string' && x.trim()) out.push(x.trim());
    }
    return out;
}

/**
 * @param {unknown} entry
 * @returns {{ skill: string, row: number, col: number, prerequisites: string[] }|null}
 */
export function parseSkillPositionEntry(entry) {
    if (Array.isArray(entry) && entry.length >= 3) {
        const row = Number(entry[1]);
        const col = Number(entry[2]);
        if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
        return { skill: String(entry[0]), row, col, prerequisites: [] };
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const id = entry.id ?? entry.skill ?? entry.name;
        if (id == null || String(id).trim() === '') return null;
        const row = Number(entry.row);
        const col = Number(entry.col);
        if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
        const prerequisites = normalizePrerequisiteStringsFromEntry(entry.prerequisites);
        return { skill: String(id), row, col, prerequisites };
    }
    return null;
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

    for (const s of mergedSkills) {
        const hit = byKey.get(`${String(s.class).toLowerCase()}|${String(s.id)}`);
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
                const mapKey = `${className.toLowerCase()}|${p.skill}`;
                const base = byClassSkill.get(mapKey);
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
 * Map "classLower|skillId" -> prerequisite strings from tree_struct skill_details.
 * @param {object|null} layoutRoot
 * @param {Map<string, string>} classNameByLower canonical class name by lower key
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
                const list = p.prerequisites && p.prerequisites.length > 0 ? [...p.prerequisites] : [];
                byKey.set(mapKey, list);
            }
        }
    }
    return byKey;
}

/**
 * Planner: prerequisites come only from tree_struct. Skills not in the map get [].
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
    for (const s of mergedSkills) {
        if (!s.class || !s.id) continue;
        const k = `${String(s.class).toLowerCase()}|${String(s.id)}`;
        let list = byKey.has(k) ? [...byKey.get(k)] : [];
        // Paragon skills (and similar) are cloned per class but tree_struct only lists one prototype
        // (e.g. Amazon Reward). Inherit prerequisites from any class that defines this skill id.
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
