// Data loading for the skills tree (tree_data/*.json)
import Skill from '../src/skills/domain/Skill.js';
import { showSkillDataLoadError } from '../src/shared/utils.js';
import { buildTreeSkillsCacheFromLoadedSkills, setPlannerSkillsSnapshot } from '../character/character-state.js';
import { getCurrentVersion } from '../src/shared/version-config.js';
import { initSkillDataStore, getFileSkillStore } from './skill-data-store.js';
import {
    fetchTreeStructJson,
    getTreeLayoutRoot,
    buildPlannerSkillsFromTreeStruct,
    applyTreeStructLayoutToSkills,
    applyTreeStructPrerequisitesToSkills,
    cacheTreeStructArrowsFromLayoutRoot,
    clearTreeStructArrowsCache
} from '../src/shared/tree-struct.js';

/**
 * Planner rows and tree_struct lookups use a concrete class name (e.g. "Amazon").
 * skills.json may use `"class": "__all__"` or a name array for multiclass skills.
 * @param {import('./skill-data-store.js').SkillFileStore} store
 * @param {object} row
 * @returns {string}
 */
function plannerClassNameForCatalogRow(store, row) {
    const c = row?.class;
    if (c === '__all__' || c === '*') {
        return store.primaryClassDisplayName(row) || classNameFromClassId(store, row?.classId);
    }
    if (Array.isArray(c)) {
        return store.primaryClassDisplayName(row) || classNameFromClassId(store, row?.classId);
    }
    if (typeof c === 'string' && c.trim() !== '') {
        return c.trim();
    }
    return classNameFromClassId(store, row?.classId);
}

function classNameFromClassId(store, classId) {
    if (classId == null) return '';
    const meta = store.gameMeta?.classes?.find((x) => x.id === classId);
    return meta?.name ?? '';
}

/**
 * @param {import('./skill-data-store.js').SkillFileStore} store
 * @param {object} row - skills.json entry (catalog + balance fields)
 * @returns {Skill|null}
 */
export function buildSkillFromCatalogRow(store, row) {
    const det = store.getSkillDetail(row.id);
    if (!det) return null;
    const tagsJoined = row.tags?.length ? row.tags.join(', ') : '';
    return Skill.fromCatalogRow({
        id: row.numericId,
        name: row.id,
        display_name: det.display_name ?? row.displayName,
        class_id: row.classId,
        tab_index: row.tab,
        image: det.image,
        restriction: det.restriction ?? '',
        description: det.description ?? '',
        skill_effect: det.skill_effect ?? '',
        tab_name: row.tabName,
        class_name: plannerClassNameForCatalogRow(store, row),
        tags: tagsJoined,
        base_max_level: row.baseMaxLevel,
        affected_by_specialization: row.affectedBySpecialization ? 1 : 0,
        parentSkillId: row.parentSkillId ?? null,
        subskillLabel: row.subskillLabel ?? null,
        prerequisites: null
    });
}

async function loadSkillsFromFileData(plannerOnly) {
    clearTreeStructArrowsCache();
    await initSkillDataStore({ major: 2, minor: 12 });
    const store = getFileSkillStore();
    if (!store?.catalog?.length) {
        throw new Error('File skill catalog is empty');
    }
    const loadedSkills = [];
    const sharedInnateRows = [];
    for (const row of store.catalog) {
        if (plannerOnly && row.classId === 1) {
            if (Number(row.tab) === 69) {
                sharedInnateRows.push(row);
            }
            continue;
        }
        const sk = buildSkillFromCatalogRow(store, row);
        if (sk) loadedSkills.push(sk);
    }
    const cur = getCurrentVersion();
    const treeStruct = await fetchTreeStructJson(cur.major, cur.minor);
    const layoutRoot = getTreeLayoutRoot(treeStruct);
    cacheTreeStructArrowsFromLayoutRoot(layoutRoot);
    let out = buildPlannerSkillsFromTreeStruct(loadedSkills, layoutRoot);
    if (layoutRoot) {
        applyTreeStructLayoutToSkills(out, layoutRoot);
    }
    if (sharedInnateRows.length > 0) {
        const classNameById = new Map((store.gameMeta?.classes || []).map((c) => [Number(c.id), c.name]));
        const innateTabIdByClassId = new Map(
            (store.gameMeta?.classTabs || [])
                .filter((ct) => String(ct?.name) === 'Innate')
                .map((ct) => [Number(ct.class_id), Number(ct.id)])
        );
        const playableClassIds = (store.gameMeta?.classes || [])
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id) && id !== 1);

        const baseSharedInnateSkills = sharedInnateRows
            .map((row) => buildSkillFromCatalogRow(store, row))
            .filter(Boolean);

        for (const classId of playableClassIds) {
            const className = classNameById.get(classId);
            const innateTabId = innateTabIdByClassId.get(classId);
            if (!className || innateTabId == null || !Number.isFinite(innateTabId)) continue;

            for (const base of baseSharedInnateSkills) {
                const sk = base.clone();
                sk.class = className;
                sk.classId = classId;
                sk.tab = innateTabId;
                sk.tabName = 'Innate';
                sk.row = 0;
                sk.col = 0;
                sk.sharedInnate = true;
                out.push(sk);
            }
        }
    }
    const masteryByClass = new Map();
    out.forEach((s) => {
        if (s.tabName === 'Mastery') masteryByClass.set(s.class, true);
    });
    const masterySkills = out.filter((s) => s.tabName === 'Mastery');
    const allClasses = [...new Set(out.map((s) => s.class))];
    const classIdForName = (className) => {
        const row = out.find((s) => s.class === className);
        return row?.classId ?? null;
    };
    const prototypeClass = masterySkills.length > 0 ? masterySkills[0].class : null;
    if (prototypeClass) {
        allClasses.forEach((cls) => {
            if (!masteryByClass.get(cls)) {
                masterySkills.forEach((skill) => {
                    const clonedSkill = skill.clone();
                    clonedSkill.class = cls;
                    const cid = classIdForName(cls);
                    if (cid != null) clonedSkill.classId = cid;
                    out.push(clonedSkill);
                });
            }
        });
    }
    const paragonSkills = out.filter(
        (s) => s.id === 'paragon_of_fate' || s.id === 'paragon_of_sanctity'
    );
    if (paragonSkills.length > 0) {
        const paragonByClass = new Map();
        paragonSkills.forEach((s) => paragonByClass.set(s.class, true));
        allClasses.forEach((cls) => {
            if (!paragonByClass.get(cls)) {
                paragonSkills.forEach((skill) => {
                    const clonedSkill = skill.clone();
                    clonedSkill.class = cls;
                    const cid = classIdForName(cls);
                    if (cid != null) clonedSkill.classId = cid;
                    out.push(clonedSkill);
                });
            }
        });
    }
    if (layoutRoot) {
        applyTreeStructPrerequisitesToSkills(out, layoutRoot);
    }
    buildTreeSkillsCacheFromLoadedSkills(out);
    setPlannerSkillsSnapshot(out);
    return out;
}

/** Load planner skills from tree_data JSON. */
export async function loadPlannerSkillsFromTreeData() {
    try {
        return await loadSkillsFromFileData(true);
    } catch (error) {
        console.error('Error loading skills from file data:', error);
        showSkillDataLoadError(error.message, document.querySelector('.container'));
        setPlannerSkillsSnapshot([]);
        return [];
    }
}
