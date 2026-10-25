/**
 * @file Saved builds: load/import/export/validate and build snapshots.
 * @module planner/saved-builds-ui
 */
import { loadPlannerSkillsFromTreeData } from '@/tree/tree-data.js';
import { renderSkills } from '@/tree/tree-render.js';
import Character from '@/character/Character.js';
import {
  initializeCharacter,
  applyClassBaselineStatsToCharacter,
  runPlannerSkillStatRecompute,
  beginPlannerBuildLoad,
  endPlannerBuildLoad,
  setAllSkillPoints,
  normalizeBuildSkillPointsForImport,
  normalizeBuildOSkillsForImport,
  importQuestsCompleted,
  getOSkillsForBuildExport,
  setAllOSkills,
  syncItemGrantedOSkills,
  getCharacterInstance,
  getCharacterLevel,
  parseStatsFromText,
  exportStatsToText,
  getQuestsCompletedForSave,
  getQuestCompletionOptOutForSave,
  getDisabledSkillIds,
  getEnabledSkillIds,
  getDisabledOSkillSlotIds,
  getEnabledOSkillSlotIds,
  applyLoadedSkillBonusToggles,
  isPlannerSkillPointPoolOverBudget,
  getSpentSkillPoints,
  getAllSkillPoints,
  getAllSkillPointsById,
} from '@/character/planner-core.js';
import { findMissingCharmSkillUnlocks } from '@/items/charm-skill-unlocks.js';
import { isCharmItem } from '@/items/charm-items.js';
import { getSelectedConditionKeys, setCondition as setPlannerCondition } from '@/stores/planner-config-store.js';
import { useItemsStore } from '@/stores/items.js';
import { getPlannerAutoMatchHighestStatRequirements } from '@/planner/planner-options.js';
import { syncPlannerCharacterStatsTextareaFromCharacter, refreshPlannerStatsPanelFromCharacter } from '@/character/planner-stats-panel.js';
import {
  getSavedBuilds,
  setSavedBuilds,
  notifySavedBuildsListRefresh,
} from '@/planner/saved-builds-storage.js';
import { showBuildNameModal } from '@/planner/planner-dom-handlers.js';
import {
  buildJsonDownloadFilename,
  downloadTextAsJsonFile,
} from '@/planner/build-file-io.js';
import {
  getCurrentVersion,
  versionToString,
  setBuildVersionOverride,
  initializeVersionSelector,
} from '@/shared/version-config.js';
import { initializeTooltip } from '@/tree/tree-tooltip.js';
import { clearSkillVariants, applySkillVariantDefaultsForClass } from '@/tree/skill-variants.js';
import { parseVersionString } from '@/planner/build-url-codec.js';
import { getFileSkillStore, resetSkillDataStore } from '@/shared/skill-data-store.js';
import {
  toastManager,
  getSkillsList,
  setSkillsList,
  setPlannerTreeRef,
  getClassSelect,
  getSkillsContainer,
  getCurrentBuildIndex,
  setCurrentBuildIndex,
  getCurrentBuildDisplayName,
  setCurrentBuildDisplayName,
} from './planner-session.js';
import {
  unwrapTswOrNativeBuild,
  mapTswItemsToSnapshot,
  applyTswOSkillLeftovers,
  inferTswQuestsCompleted,
} from './tsw-build-import.js';
import {
  savedBuildName,
  setSavedBuildName,
  tswExportLabel,
  wrapPlannerBuildForTswExport,
} from './tsw-build-export.js';
import { inferTswClassSkillsBonus } from './tsw-item-rolls.js';
import Tree from '@/tree/Tree.js';
import {
  updateSkillPointsDisplay,
  updateDevotionDisplay,
  handleSkillPointsChanged,
  initializeOSkillsDropdown,
  showSection,
  setAllSkillsBonus,
  getAllSkillsBonus,
  setClassSkillsBonus,
  getClassSkillsBonus,
  updateClassSkillsBonusLabel,
  exportLabelForToast,
} from './planner-ui-updates.js';

export function loadPlannerClassNames(skillsListFallback) {
    const names = (getFileSkillStore()?.gameMeta?.classes || [])
        .map((c) => c.name)
        .filter((n) => n && n !== 'Other');
    if (names.length) {
        names.sort((a, b) => String(a).localeCompare(String(b)));
        return names;
    }
    return [...new Set(skillsListFallback.map((skill) => skill.class))]
        .filter((c) => c !== 'Other')
        .sort((a, b) => String(a).localeCompare(String(b)));
}

export async function reloadSkillDataAndLoadBuild(build, buildIndex) {
    try {
        // Drop cached store so init picks up the build version override (not the prior folder).
        resetSkillDataStore();
        const list = await loadPlannerSkillsFromTreeData();
        setSkillsList(list);
        setPlannerTreeRef(new Tree(list));
        const classSelect = getClassSelect();
        const classes = loadPlannerClassNames(list);
        if (classSelect) {
            classSelect.innerHTML = '';
            for (const cls of classes) {
                const opt = document.createElement('option');
                opt.value = cls;
                opt.textContent = cls;
                classSelect.appendChild(opt);
            }
        }
        const versionSelector = document.getElementById('version-selector');
        if (versionSelector) {
            await initializeVersionSelector(versionSelector);
        }
        // Skill catalog changed with the version switch — rebuild oSkills picker once.
        initializeOSkillsDropdown();
        await loadBuildData(build, buildIndex);
    } catch (error) {
        console.error('Failed to reload skill data:', error);
        toastManager.showToast(`Failed to reload skill data: ${error.message}`, false, 'danger');
    }
}

/**
 * Load build data without version checking (used after skill data reload).
 * Batches Vue bumps and runs a single skill-stat recompute after items + stats.
 * @param {object} build - The build object to load
 * @param {number} buildIndex - The index of the build in the saved builds array
 * @returns {Promise<void>}
 */
export async function loadBuildData(build, buildIndex = null) {
    beginPlannerBuildLoad();
    try {
        setCurrentBuildDisplayName(build.name || '');
        const classSelect = getClassSelect();
        const skillsContainer = getSkillsContainer();
        // Set class
        if (classSelect) {
            classSelect.value = build.class;
        }
        updateClassSkillsBonusLabel(build.class);

        // Initialize character with loaded class and level first
        initializeCharacter(build.class, build.level);

        const tswEnvelope = Boolean(build.__tswEnvelope) || Array.isArray(build.__tswItems);
        const quests = tswEnvelope ? inferTswQuestsCompleted(build) : build.questsCompleted;
        if (quests && typeof quests === 'object') {
            importQuestsCompleted(quests, tswEnvelope ? undefined : build.questCompletionOptOut);
        }

        // Load skill points (display name or internal id -> runtime internal ids)
        if (build.skillPoints) {
            const { map, skipped } = normalizeBuildSkillPointsForImport(build.skillPoints);
            setAllSkillPoints(map);
            if (skipped.length > 0) {
                const parts = skipped.map(
                    (s) => `${exportLabelForToast(s.key)} (skill level: ${s.wantedLevel})`
                );
                const list = parts.join(', ');
                toastManager.showToast(
                    `Unknown tree skill${skipped.length > 1 ? 's' : ''} not loaded: ${list}.`,
                    false,
                    'warning'
                );
            }
        }

        // TSW envelope oSkills are character-sheet totals; apply leftovers after items.
        const tswItems = Array.isArray(build.__tswItems) ? build.__tswItems : null;
        if (!tswItems) {
            const oNorm = normalizeBuildOSkillsForImport(build.oSkills ?? []);
            setAllOSkills(oNorm.payload);
            if (oNorm.skipped.length > 0) {
                const parts = oNorm.skipped.map(
                    (s) => `${exportLabelForToast(s.key)} (skill level: ${s.wantedLevel})`
                );
                const list = parts.join(', ');
                toastManager.showToast(
                    `Unknown oSkill${oNorm.skipped.length > 1 ? 's' : ''} not loaded: ${list}.`,
                    false,
                    'warning'
                );
            }
        }

        applyLoadedSkillBonusToggles({
            enabledSkills: build.enabledSkills,
            disabledSkills: build.disabledSkills,
            enabledOSkillSlots: build.enabledOSkillSlots,
            disabledOSkillSlots: build.disabledOSkillSlots,
        });

        // Load soft-level bonuses
        if (build.allSkillsBonus !== undefined) {
            setAllSkillsBonus(build.allSkillsBonus);
        }
        if (build.classSkillsBonus !== undefined) {
            setClassSkillsBonus(build.classSkillsBonus);
        } else if (tswItems) {
            setClassSkillsBonus(inferTswClassSkillsBonus(tswItems, build.class));
        } else {
            setClassSkillsBonus(0);
        }

        // Load planner config conditions (selected checkboxes)
        if (Array.isArray(build.configConditions)) {
            try {
                for (const k of build.configConditions) {
                    if (typeof k === 'string' && String(k).trim() !== '') {
                        setPlannerCondition(k, true);
                    }
                }
            } catch (e) {
                console.warn('Failed to apply build configConditions:', e);
            }
        }

        // Load equipment / inventory / charms / relics (await catalog so oSkills leftovers see gear).
        // Gear unmet toasts wait until str/dex are applied (see after stats below).
        let pendingGearUnmetToast = false;
        try {
            const itemsStore = useItemsStore();
            if (!itemsStore.isCatalogCurrent) {
                await itemsStore.loadCatalog();
            }
            try {
                itemsStore.syncViewerClassName(build.class);
                /**
                 * @type {{
                 *   disabledCharms: Array<{ name: string, reqLevel: number }>,
                 *   disabledRelics: Array<{ name: string, reqLevel: number }>,
                 *   unmetGear: Array<{ name: string, requirementsLine: string }>,
                  } | null} */
                let unmetReqReport = null;
                if (tswItems) {
                    const { snapshot, skipped } = mapTswItemsToSnapshot(tswItems, itemsStore, build.class);
                    unmetReqReport = itemsStore.fromSnapshot(snapshot);
                    toastSkippedTswItems(skipped);
                } else if (build.items != null) {
                    unmetReqReport = itemsStore.fromSnapshot(build.items);
                } else {
                    itemsStore.resetItems();
                }
                itemsStore.pruneClassRestrictedEnableList();
                if (unmetReqReport) {
                    toastUnmetItemRequirements(unmetReqReport, { charms: true, relics: true, gear: false });
                    pendingGearUnmetToast = true;
                }
                // Seed live all/class tracking so Overview values from the build/TSW are not doubled.
                syncItemGrantedOSkills({ seedBroadSkillBonuses: true });
                if (tswItems) {
                    const left = applyTswOSkillLeftovers(build.oSkills);
                    if (left.skipped.length > 0) {
                        const parts = left.skipped.map(
                            (s) => `${exportLabelForToast(s.key)} (skill level: ${s.wantedLevel})`
                        );
                        toastManager.showToast(
                            `Unknown oSkill${left.skipped.length > 1 ? 's' : ''} not loaded: ${parts.join(', ')}.`,
                            false,
                            'warning'
                        );
                    }
                    toastMissingCharmSkillUnlocks(build.class, itemsStore);
                }
            } catch (err) {
                console.warn('Failed to apply build items:', err);
            }
        } catch (e) {
            console.warn('Failed to apply build items:', e);
        }

        // Class baseline stats only when the build has no stats blob (saved builds carry raw stat lines).
        const importedStatsText = build.stats != null ? String(build.stats).trim() : '';
        if (!importedStatsText && build.class) {
            applyClassBaselineStatsToCharacter(build.class);
        }

        clearSkillVariants();
        applySkillVariantDefaultsForClass(build.class);

        // Initialize tooltip functionality (needed for skill tooltips to work)
        initializeTooltip();

        // oSkills dropdown is built in main() / reloadSkillDataAndLoadBuild; catalog is unchanged on same-version load.

        // Render skills
        const skillsList = getSkillsList();
        if (skillsList) {
            // If build has oSkills, switch to oSkills tab after rendering
            const hasOSkills = build.oSkills && (
                Array.isArray(build.oSkills)
                    ? build.oSkills.length > 0
                    : typeof build.oSkills === 'object' && Object.keys(build.oSkills).length > 0
            );
            renderSkills(build.class, skillsList, skillsContainer, hasOSkills ? 'oSkills' : null);
        }

        window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));

        // Add event listener for skill point changes (needed for UI updates)
        // Remove any existing listener first to avoid duplicates
        window.removeEventListener('skillPointsChanged', handleSkillPointsChanged);
        window.addEventListener('skillPointsChanged', handleSkillPointsChanged);

        // Update displays (updateMinimumLevelDisplay -> recomputeClassDerivedLifeMana overwrites life/mana)
        updateSkillPointsDisplay();
        updateDevotionDisplay();

        // Re-apply saved raw stats after pool UI derived life/mana so imports match the JSON blob.
        if (importedStatsText) {
            const statErrors = parseStatsFromText(build.stats);
            if (statErrors.length > 0) {
                console.warn('Stats parsing errors when loading build:', statErrors);
            }
        }

        // Single skill-stat recompute after items + stats are applied.
        await runPlannerSkillStatRecompute({ immediate: true, force: true });

        if (pendingGearUnmetToast) {
            try {
                toastUnmetEquippedItemRequirements(useItemsStore());
            } catch (e) {
                console.warn('Failed to toast unmet gear requirements:', e);
            }
        }
        syncPlannerCharacterStatsTextareaFromCharacter();
        refreshPlannerStatsPanelFromCharacter();
        window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { buildLoad: true } }));
        window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));

        // Set current build index so "Save" button works
        if (buildIndex !== null) {
            setCurrentBuildIndex(buildIndex);
        }
        // Show tree section
        showSection('tree');

        // Over-max blvl is allowed (e.g. Atanna Khan's Dress then unequip); only warn on pool.
        const poolOverBudget = isPlannerSkillPointPoolOverBudget();
        if (poolOverBudget) {
            toastManager.showToast('Spent skill points exceed available amount.', false, 'warning');
        } else {
            toastManager.showToast(`Build "${exportLabelForToast(build.name)}" loaded successfully!`, true, 'info');
        }
    } finally {
        endPlannerBuildLoad();
    }
}

export function validateBuildBeforeSave() {
    // Over-max blvl is legal in-game after temporary max-level item bonuses; do not block save.
    return true;
}

/**
 * Parse, validate, and import build JSON text.
 * @param {string} jsonString
 * @returns {boolean} True if import started successfully
 */
export function importBuildFromJsonText(jsonString) {
    if (!jsonString || String(jsonString).trim() === '') {
        toastManager.showToast('Paste build JSON or load a file first', false, 'danger');
        return false;
    }

    try {
        const parsed = JSON.parse(String(jsonString).trim());
        const { build, tswItems } = unwrapTswOrNativeBuild(parsed);
        if (tswItems) build.__tswItems = tswItems;
        if (!validateBuildData(build)) {
            return false;
        }
        importBuild(build);
        return true;
    } catch (error) {
        toastManager.showToast(`Invalid JSON: ${error.message}`, false, 'danger');
        return false;
    }
}

export function promptAndImportBuild() {
    const jsonString = prompt('Paste the build JSON string:');
    if (!jsonString || jsonString.trim() === '') {
        return;
    }
    importBuildFromJsonText(jsonString);
}

/**
 * Read a JSON File and return its text (does not import).
 * @param {File} file
 * @returns {Promise<string|null>}
 */
export async function readBuildJsonFileText(file) {
    if (!file) {
        return null;
    }
    try {
        return await file.text();
    } catch (error) {
        toastManager.showToast(`Could not read file: ${error.message}`, false, 'danger');
        return null;
    }
}

/**
 * Import a build from a JSON File (file picker).
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function importBuildFromJsonFile(file) {
    const text = await readBuildJsonFileText(file);
    if (text == null) {
        return false;
    }
    return importBuildFromJsonText(text);
}

/**
 * Legacy quest objects or compact [normal, nightmare, hell] with 0/1.
 * @param {unknown} v
 * @returns {boolean}
 */
function isValidSavedQuestDifficultyValue(v) {
    if (Array.isArray(v)) {
        return (
            v.length === 3 &&
            v.every((x) => typeof x === 'number' || typeof x === 'boolean')
        );
    }
    return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

/**
 * @param {Array<{ name: string, reason?: string }>} skipped
 */
/**
 * @param {string|null|undefined} className
 * @param {{ enabledCharms?: Record<string, string>, catalog?: object[] }} itemsStore
 */
function toastMissingCharmSkillUnlocks(className, itemsStore) {
  const charms = (Array.isArray(itemsStore?.catalog) ? itemsStore.catalog : []).filter((def) =>
    isCharmItem(def)
  );
  /** @type {Record<string, string>} */
  const skillDisplayNames = {};
  const store = getFileSkillStore();
  for (const skill of getSkillsList() || []) {
    const id = skill?.id != null ? String(skill.id).trim() : '';
    if (!id) continue;
    const label = String(skill.displayName || skill.name || '').trim();
    if (label) skillDisplayNames[id] = label;
  }
  const missing = findMissingCharmSkillUnlocks({
    skillPoints: getAllSkillPoints(),
    ownedCharmIds: Object.keys(itemsStore?.enabledCharms || {}),
    charms,
    className,
    skillDisplayNames,
  });
  if (!missing.length) return;
  const parts = missing.map((row) => {
    const charm = row.charmNames.join(' / ');
    const fromStore = store?.lookupDisplayNameByInternalName?.(row.skillId);
    const skillLabel =
      (fromStore && fromStore !== row.skillId ? fromStore : '') ||
      row.skillName ||
      row.skillId;
    return `${exportLabelForToast(skillLabel)} (needs ${exportLabelForToast(charm)})`;
  });
  toastManager.showToast(
    `Skill point${missing.length > 1 ? 's' : ''} spent without required charm in inventory: ${parts.join(', ')}.`,
    false,
    'warning'
  );
}

const TSW_SKIP_TOAST_REASONS = new Set(['uncatalogued', 'unknown-slot', 'relic-cap']);

function toastSkippedTswItems(skipped) {
    if (!Array.isArray(skipped) || skipped.length === 0) return;
    const warned = skipped.filter((s) => TSW_SKIP_TOAST_REASONS.has(String(s?.reason || '')));
    if (warned.length === 0) return;
    console.warn(
        `[TSW import] Skipped ${warned.length} item${warned.length > 1 ? 's' : ''} not in the catalog:`,
        warned
    );
    const names = warned.map((s) => exportLabelForToast(s.name || '(unnamed)'));
    const shown = names.slice(0, 8);
    const extra = names.length - shown.length;
    const list = extra > 0 ? `${shown.join(', ')}, and ${extra} more` : shown.join(', ');
    toastManager.showToast(
        `Skipped ${names.length} item${names.length > 1 ? 's' : ''} not in the catalog: ${list}.`,
        false,
        'warning'
    );
}

/**
 * @param {Array<{ name?: string, reqLevel?: number, requirementsLine?: string }>} rows
 * @param {(row: { name?: string, reqLevel?: number, requirementsLine?: string }) => string} formatRow
 * @returns {string}
 */
function formatUnmetItemToastList(rows, formatRow) {
    const labels = rows.map((row) => formatRow(row));
    const shown = labels.slice(0, 8);
    const extra = labels.length - shown.length;
    return extra > 0 ? `${shown.join(', ')}, and ${extra} more` : shown.join(', ');
}

/**
 * After import stats are applied: bump str/dex when auto-match is on, then toast remaining gear unmet.
 * @param {ReturnType<typeof useItemsStore>} itemsStore
 */
function toastUnmetEquippedItemRequirements(itemsStore) {
    if (getPlannerAutoMatchHighestStatRequirements()) {
        itemsStore.syncCharacterStatsToItemReqs();
    }
    toastUnmetItemRequirements(
        { unmetGear: itemsStore.listUnmetEquippedItems() },
        { charms: false, relics: false, gear: true }
    );
}

/**
 * Warning toasts after import when charms/relics were left disabled or gear fails reqs.
 * @param {{
 *   disabledCharms?: Array<{ name: string, reqLevel: number }>,
 *   disabledRelics?: Array<{ name: string, reqLevel: number }>,
 *   unmetGear?: Array<{ name: string, requirementsLine: string }>,
 * }|null|undefined} report
 * @param {{ charms?: boolean, relics?: boolean, gear?: boolean }} [parts]
 */
function toastUnmetItemRequirements(report, parts = {}) {
    if (!report || typeof report !== 'object') return;
    const showCharms = parts.charms !== false;
    const showRelics = parts.relics !== false;
    const showGear = parts.gear !== false;
    const charms = showCharms && Array.isArray(report.disabledCharms) ? report.disabledCharms : [];
    const relics = showRelics && Array.isArray(report.disabledRelics) ? report.disabledRelics : [];
    const gear = showGear && Array.isArray(report.unmetGear) ? report.unmetGear : [];

    if (charms.length) {
        const list = formatUnmetItemToastList(charms, (row) => {
            const name = exportLabelForToast(row.name || '(unnamed)');
            const req = Number(row.reqLevel) || 0;
            return req > 0 ? `${name} (req ${req})` : name;
        });
        toastManager.showToast(
            `Charm${charms.length > 1 ? 's' : ''} left disabled (level too low): ${list}.`,
            false,
            'warning'
        );
    }
    if (relics.length) {
        const list = formatUnmetItemToastList(relics, (row) => {
            const name = exportLabelForToast(row.name || '(unnamed)');
            const req = Number(row.reqLevel) || 0;
            return req > 0 ? `${name} (req ${req})` : name;
        });
        toastManager.showToast(
            `Relic${relics.length > 1 ? 's' : ''} left disabled (level too low): ${list}.`,
            false,
            'warning'
        );
    }
    if (gear.length) {
        const list = formatUnmetItemToastList(gear, (row) => {
            const name = exportLabelForToast(row.name || '(unnamed)');
            const req = String(row.requirementsLine || '').trim();
            return req ? `${name} (${req})` : name;
        });
        toastManager.showToast(
            `Equipped item${gear.length > 1 ? 's' : ''} requirements not met: ${list}.`,
            false,
            'warning'
        );
    }
}

/**
 * Validate build data structure
 * @param {object} buildData - The build data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateBuildData(buildData) {
    if (typeof buildData.name !== 'string') {
        toastManager.showToast('Build name must be a string', 'danger');
        return false;
    }

    const requiredFields = ['class', 'level'];
    for (const field of requiredFields) {
        if (buildData[field] === undefined || buildData[field] === null) {
            toastManager.showToast(`Missing required field: ${field}`, 'danger');
            return false;
        }
    }
    if (
      buildData.skillPoints == null ||
      Array.isArray(buildData.skillPoints) ||
      typeof buildData.skillPoints !== 'object'
    ) {
      buildData.skillPoints = {};
    }
    
    if (typeof buildData.class !== 'string') {
        toastManager.showToast('Build class must be a string', 'danger');
        return false;
    }
    
    if (typeof buildData.level !== 'number' || buildData.level < 1 || buildData.level > 150) {
        toastManager.showToast('Build level must be a number between 1 and 150', 'danger');
        return false;
    }
    
    for (const v of Object.values(buildData.skillPoints)) {
        if (typeof v !== 'number' || Number.isNaN(v)) {
            toastManager.showToast('Skill points values must be numbers', 'danger');
            return false;
        }
    }

    if (buildData.oSkills !== undefined) {
        if (buildData.oSkills === null) {
            toastManager.showToast('oSkills cannot be null', 'danger');
            return false;
        }
        if (Array.isArray(buildData.oSkills)) {
            for (let i = 0; i < buildData.oSkills.length; i++) {
                const row = buildData.oSkills[i];
                if (!row || typeof row !== 'object' || Array.isArray(row)) {
                    toastManager.showToast(`oSkills[${i}] must be an object`, 'danger');
                    return false;
                }
            }
        } else if (typeof buildData.oSkills === 'object') {
            for (const v of Object.values(buildData.oSkills)) {
                if (typeof v !== 'number' || Number.isNaN(v)) {
                    toastManager.showToast('oSkills map values must be numbers', 'danger');
                    return false;
                }
            }
        } else {
            toastManager.showToast('oSkills must be a plain object or array', 'danger');
            return false;
        }
    }
    
    // allSkillsBonus / classSkillsBonus are optional (for backward compatibility)
    if (buildData.allSkillsBonus !== undefined) {
        if (typeof buildData.allSkillsBonus !== 'number' || buildData.allSkillsBonus < 0) {
            toastManager.showToast('allSkillsBonus must be a non-negative number', 'danger');
            return false;
        }
    }
    if (buildData.classSkillsBonus !== undefined) {
        if (typeof buildData.classSkillsBonus !== 'number' || buildData.classSkillsBonus < 0) {
            toastManager.showToast('classSkillsBonus must be a non-negative number', 'danger');
            return false;
        }
    }

    if (buildData.questsCompleted !== undefined) {
        if (typeof buildData.questsCompleted !== 'object' || buildData.questsCompleted === null || Array.isArray(buildData.questsCompleted)) {
            toastManager.showToast('questsCompleted must be an object', 'danger');
            return false;
        }
        for (const q of Object.values(buildData.questsCompleted)) {
            if (!isValidSavedQuestDifficultyValue(q)) {
                toastManager.showToast('questsCompleted entries must be objects or [n,n,n] arrays', 'danger');
                return false;
            }
        }
    }

    if (buildData.configConditions !== undefined) {
        if (!Array.isArray(buildData.configConditions)) {
            toastManager.showToast('configConditions must be an array', 'danger');
            return false;
        }
        for (const v of buildData.configConditions) {
            if (typeof v !== 'string') {
                toastManager.showToast('configConditions entries must be strings', 'danger');
                return false;
            }
        }
    }

    if (buildData.questCompletionOptOut !== undefined) {
        if (typeof buildData.questCompletionOptOut !== 'object' || buildData.questCompletionOptOut === null || Array.isArray(buildData.questCompletionOptOut)) {
            toastManager.showToast('questCompletionOptOut must be an object', 'danger');
            return false;
        }
        for (const q of Object.values(buildData.questCompletionOptOut)) {
            if (!isValidSavedQuestDifficultyValue(q)) {
                toastManager.showToast('questCompletionOptOut entries must be objects or [n,n,n] arrays', 'danger');
                return false;
            }
        }
    }
    
    return true;
}

/**
 * Import a build from build data
 * @param {object} buildData - The build data to import
 */
function switchPlannerWorkspaceToItems() {
    window.dispatchEvent(new CustomEvent('plannerWorkspaceMode', { detail: { mode: 'items' } }));
}

export function importBuild(buildData) {
    try {
        // Check if build version differs from current version
        const currentVersion = getCurrentVersion();
        const currentVersionString = versionToString(currentVersion);

        if (buildData.version && buildData.version !== currentVersionString) {
            const buildVersion = parseVersionString(buildData.version);

            toastManager.showToast(
                `Build was saved for game version ${buildData.version}. Switching to version ${buildData.version} for compatibility.`,
                false,
                'warning'
            );

            setBuildVersionOverride(buildVersion);

            reloadSkillDataAndLoadBuild(buildData, null).then(switchPlannerWorkspaceToItems);
            return;
        }

        // Load build data directly (same version); switch workspace after apply finishes.
        loadBuildData(buildData, null).then(switchPlannerWorkspaceToItems);
    } catch (error) {
        console.error('Failed to import build:', error);
        toastManager.showToast(`Failed to import build: ${error.message}`,true,  'danger');
    }
}

export function updateCurrentBuild() {
    const idx = getCurrentBuildIndex();
    if (idx === null) {
        return;
    }
    
    const builds = getSavedBuilds();
    if (idx < 0 || idx >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }
    
    const keptName = savedBuildName(builds[idx]);
    setCurrentBuildDisplayName(keptName || '');
    const snap = buildCurrentBuildSnapshot(keptName);
    builds[idx] = snap;

    setSavedBuilds(builds);
    setCurrentBuildIndex(builds.indexOf(snap));
    notifySavedBuildsListRefresh();

    toastManager.showToast(`Build "${exportLabelForToast(tswExportLabel(snap))}" updated!`, true, 'info');
}

/**
 * If `desiredName` is already used by a saved build, return `desiredName (2)`, `(3)`, …
 * @param {string} desiredName
 * @param {object[]} builds
 * @returns {string}
 */
function uniquifyNewBuildNameAmongSaved(desiredName, builds) {
    const base = String(desiredName ?? '').trim();
    const used = new Set(
        (builds || []).map((b) => savedBuildName(b).trim()).filter((s) => s !== '')
    );
    if (!used.has(base)) return base;
    let n = 2;
    while (n < 1e6) {
        const candidate = `${base} (${n})`;
        if (!used.has(candidate)) return candidate;
        n += 1;
    }
    return `${base} (${Date.now()})`;
}

export function saveBuild(buildName) {
    const builds = getSavedBuilds();
    const finalName = uniquifyNewBuildNameAmongSaved(buildName, builds);

    setCurrentBuildDisplayName(finalName || '');
    const build = buildCurrentBuildSnapshot(finalName);

    // Add new build
    builds.push(build);

    setSavedBuilds(builds);
    setCurrentBuildIndex(builds.indexOf(build));
    notifySavedBuildsListRefresh();

    toastManager.showToast(`Build "${exportLabelForToast(finalName)}" saved successfully!`, true, 'info');
}

export function ensureCharacterForBuildList() {
    const characterInstance = getCharacterInstance();
    if (!characterInstance) {
        const classSelect = getClassSelect();
        const defaultClass = classSelect ? classSelect.value : 'Amazon';
        initializeCharacter(defaultClass, Character.DEFAULT_LEVEL);
        applyClassBaselineStatsToCharacter(defaultClass);
    }
}

/** Legacy name: Vue list listens for `savedBuildsListRefresh`; this still ensures character then notifies. */
export function renderSavedBuildsList() {
    ensureCharacterForBuildList();
    notifySavedBuildsListRefresh();
}

/**
 * Export build as raw JSON text
 * @param {number} index - The index of the build to export
 */
export function exportBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }
    
    const envelope = wrapPlannerBuildForTswExport(builds[index], useItemsStore());
    exportBuildJsonString(JSON.stringify(envelope), exportLabelForToast(tswExportLabel(envelope)));
}

/**
 * Download a saved build as a pretty-printed .json file.
 * @param {number} index
 */
export function downloadSavedBuildAsJson(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }

    const envelope = wrapPlannerBuildForTswExport(builds[index], useItemsStore());
    const filename = buildJsonDownloadFilename(tswExportLabel(envelope));
    downloadTextAsJsonFile(JSON.stringify(envelope, null, 2), filename);
    toastManager.showToast(
        `Build "${exportLabelForToast(tswExportLabel(envelope))}" downloaded as JSON!`,
        true,
        'success'
    );
}

/**
 * Download the current live planner build as a pretty-printed .json file.
 * @param {string} name
 */
export function downloadCurrentBuildAsJson(name) {
    const envelope = wrapPlannerBuildForTswExport(buildCurrentBuildSnapshot(name), useItemsStore());
    const filename = buildJsonDownloadFilename(tswExportLabel(envelope));
    downloadTextAsJsonFile(JSON.stringify(envelope, null, 2), filename);
    toastManager.showToast(
        `Build "${exportLabelForToast(tswExportLabel(envelope))}" downloaded as JSON!`,
        true,
        'success'
    );
}

/**
 * Fallback method for copying to clipboard when modern API fails
 * @param {string} text - Text to copy
 * @param {string} buildName - Name of the build for user feedback
 */
export function fallbackCopyToClipboard(text, buildName) {
    // Create a temporary textarea to allow copying
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            toastManager.showToast(`Build "${buildName}" exported to clipboard!`, true, 'success');
        } else {
            // Show modal dialog as final fallback
            showExportModal(text, buildName);
        }
    } catch (err) {
        // Show modal dialog as final fallback
        showExportModal(text, buildName);
    }
    
    document.body.removeChild(textarea);
}

/**
 * Show a modal dialog with the export data for manual copying
 * @param {string} jsonText - The JSON text to display
 * @param {string} buildName - Name of the build
 */
function showExportModal(jsonText, buildName) {
    const overlay = document.createElement('div');
    overlay.className = 'modal is-active planner-export-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'manualExportModalTitle');

    const modalBackground = document.createElement('div');
    modalBackground.className = 'modal-background';

    const card = document.createElement('div');
    card.className = 'modal-card planner-export-modal__card planner-export-modal__card--wide';

    const head = document.createElement('header');
    head.className = 'modal-card-head planner-export-modal__head p-4';
    const headerIcon = document.createElement('span');
    headerIcon.className = 'icon planner-export-modal__icon';
    headerIcon.innerHTML = '<i class="fa-solid fa-file-code"></i>';
    head.appendChild(headerIcon);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'planner-export-modal__title';
    const title = document.createElement('p');
    title.id = 'manualExportModalTitle';
    title.className = 'modal-card-title mb-0';
    title.textContent = `Export Build: ${buildName}`;
    const subtitle = document.createElement('p');
    subtitle.className = 'is-size-7 has-text-grey-light mb-0';
    subtitle.textContent = 'Clipboard access failed, so copy the JSON manually.';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    head.appendChild(titleWrap);

    const btnClose = document.createElement('button');
    btnClose.className = 'delete';
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', 'Close');
    head.appendChild(btnClose);

    const body = document.createElement('section');
    body.className = 'modal-card-body planner-export-modal__body p-4';
    const copyHelp = document.createElement('p');
    copyHelp.className = 'mb-3';
    copyHelp.textContent = 'Select the text below and copy it into a file or import dialog.';
    body.appendChild(copyHelp);

    const textarea = document.createElement('textarea');
    textarea.className = 'textarea planner-export-modal__textarea';
    textarea.readOnly = true;
    textarea.value = jsonText;
    body.appendChild(textarea);

    const foot = document.createElement('footer');
    foot.className = 'modal-card-foot planner-export-modal__foot p-4';
    const closeButton = document.createElement('button');
    closeButton.className = 'button is-primary is-inverted is-outlined';
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    foot.appendChild(closeButton);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);

    overlay.appendChild(modalBackground);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    textarea.focus();
    textarea.select();

    const closeModal = () => {
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener('keydown', handleEscape);
    };

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleEscape);
    modalBackground.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    closeButton.addEventListener('click', closeModal);

    toastManager.showToast(`Build "${buildName}" export shown in dialog - copy manually`, false, 'info');
}

/**
 * Show help modal with keyboard shortcuts and tips
 */
/**
 * Unwrap a local/TSW saved record into the inner build loadBuildData expects.
 * @param {object} raw
 * @returns {object}
 */
function storedBuildForLoad(raw) {
    const { build, tswItems } = unwrapTswOrNativeBuild(raw);
    if (tswItems) build.__tswItems = tswItems;
    return build;
}

export function loadBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }

    const build = storedBuildForLoad(builds[index]);

    // Check if build version differs from current version
    const currentVersion = getCurrentVersion();
    const currentVersionString = versionToString(currentVersion);

    if (build.version && build.version !== currentVersionString) {
        const buildVersion = parseVersionString(build.version);

        toastManager.showToast(
            `Build was saved for game version ${build.version}. Switching to version ${build.version} for compatibility.`,
            false,
            'warning'
        );

        setBuildVersionOverride(buildVersion);

        void reloadSkillDataAndLoadBuild(build, index);
        return;
    } else if (!build.version) {
        // Handle builds without version information (older saves)
        toastManager.showToast(
            `Build was saved before version tracking was implemented. Loading with current version ${currentVersionString}.`,
            false,
            'info'
        );
    }

    // Load build data directly (same version)
    void loadBuildData(build, index);
}

export function deleteBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        return;
    }
    
    const buildName = savedBuildName(builds[index]);
    const label = exportLabelForToast(buildName);
    
    if (confirm(`Delete build "${label}"?`)) {
        const idx = getCurrentBuildIndex();
        const deletingCurrent = idx === index;
        const tracked =
            !deletingCurrent && idx !== null && idx >= 0 && idx < builds.length
                ? builds[idx]
                : null;

        builds.splice(index, 1);
        setSavedBuilds(builds);

        if (deletingCurrent) {
            setCurrentBuildIndex(null);
        } else if (tracked) {
            setCurrentBuildIndex(builds.indexOf(tracked));
        }

        notifySavedBuildsListRefresh();
        toastManager.showToast(`Build "${label}" deleted.`, true, 'info');
    }
}

export function renameBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        return;
    }
    
    const currentBuild = builds[index];
    showBuildNameModal({
        title: 'Rename build',
        titleId: 'renameBuildModalTitle',
        subtitle: 'Update the name shown for this saved build.',
        iconClass: 'fa-pen-to-square',
        helpText: 'Used for the saved build. Empty names become "Unnamed Build".',
        primaryText: 'Rename build',
        primaryIconClass: 'fa-check',
        initialName: savedBuildName(currentBuild),
        onConfirm(name) {
            const nameExists =
                name !== 'Unnamed Build' &&
                builds.some((build, i) => i !== index && savedBuildName(build) === name);
            if (nameExists) {
                toastManager.showToast(`Build name "${name}" already exists!`, true, 'danger');
                return;
            }

            const ref = builds[index];
            const wasCurrent = getCurrentBuildIndex() === index;
            setSavedBuildName(ref, name);
            setSavedBuilds(builds);

            if (wasCurrent) {
                setCurrentBuildIndex(builds.indexOf(ref));
            }

            notifySavedBuildsListRefresh();
            toastManager.showToast(`Build renamed to "${exportLabelForToast(name)}"!`, true, 'info');
        },
    });
}

// oSkills Management

export function sanitizeBuildNameForExportStorage(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 32 && code !== 127) out += s[i];
  }
  s = out.trim();
  return s !== '' ? s : 'Unnamed Build';
}

export function getCurrentBuildNamePrefill() {
  const builds = getSavedBuilds();
  const idx = getCurrentBuildIndex();
  if (idx !== null && idx >= 0 && idx < builds.length) {
    return savedBuildName(builds[idx]);
  }
  return getCurrentBuildDisplayName();
}

export function buildCurrentBuildSnapshot(name) {
  const classSelect = getClassSelect();
  const currentClass = classSelect ? classSelect.value : null;
  const currentLevel = Character.clampLevel(getCharacterLevel());
  const questsCompleted = getQuestsCompletedForSave();
  const questCompletionOptOut = getQuestCompletionOptOutForSave();
  const snap = {
    name: name != null ? String(name) : '',
    version: versionToString(getCurrentVersion()),
    class: currentClass,
    level: currentLevel,
    spentPoints: getSpentSkillPoints(),
    skillPoints: getAllSkillPointsById(),
    disabledSkills: getDisabledSkillIds(),
    enabledSkills: getEnabledSkillIds(),
    disabledOSkillSlots: getDisabledOSkillSlotIds(),
    enabledOSkillSlots: getEnabledOSkillSlotIds(),
    oSkills: getOSkillsForBuildExport(),
    allSkillsBonus: getAllSkillsBonus(),
    classSkillsBonus: getClassSkillsBonus(),
    stats: exportStatsToText(),
    questsCompleted,
    questCompletionOptOut,
    savedAt: new Date().toISOString(),
  };
    // Include planner config selected conditions (if any)
    try {
        const cfg = Array.isArray(getSelectedConditionKeys()) ? getSelectedConditionKeys() : [];
        if (cfg.length > 0) snap.configConditions = cfg;
    } catch {
        // ignore
    }
  // Items come from the live store in wrapPlannerBuildForTswExport (skip toSnapshot clone).
  if (Character.isDefaultQuestState(getCharacterLevel(), snap.questsCompleted, snap.questCompletionOptOut)) {
    delete snap.questsCompleted;
    delete snap.questCompletionOptOut;
  } else {
    const qc = Character.compactQuestDifficultiesForSave(questsCompleted);
    const qo = Character.compactQuestDifficultiesForSave(questCompletionOptOut);
    snap.questsCompleted = qc;
    snap.questCompletionOptOut = qo;
    if (Object.keys(qc).length === 0) delete snap.questsCompleted;
    if (Object.keys(qo).length === 0) delete snap.questCompletionOptOut;
  }
  return wrapPlannerBuildForTswExport(snap, useItemsStore());
}

export function exportBuildJsonString(jsonString, labelForUi) {
  const label =
    labelForUi != null && String(labelForUi).trim() !== '' ? String(labelForUi).trim() : '(unnamed)';
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(jsonString).then(() => {
      toastManager.showToast(`Build "${label}" exported to clipboard!`, true, 'success');
    }).catch(() => {
      fallbackCopyToClipboard(jsonString, label);
    });
  } else {
    fallbackCopyToClipboard(jsonString, label);
  }
}
