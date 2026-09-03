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
  setAllSkillPoints,
  normalizeBuildSkillPointsForImport,
  normalizeBuildOSkillsForImport,
  importQuestsCompleted,
  getOSkillsForBuildExport,
  setAllOSkills,
  syncItemGrantedOSkills,
  checkSkillsExceedingMaxLevel,
  getCharacterInstance,
  getCharacterLevel,
  parseStatsFromText,
  exportStatsToText,
  getQuestsCompletedForSave,
  getQuestCompletionOptOutForSave,
  getDisabledSkillIds,
  setDisabledSkillIds,
  getDisabledOSkillSlotIds,
  setDisabledOSkillSlotIds,
  isPlannerSkillPointPoolOverBudget,
  getSpentSkillPoints,
  getAllSkillPointsById,
} from '@/character/planner-core.js';
import { getSelectedConditionKeys, setCondition as setPlannerCondition } from '@/stores/planner-config-store.js';
import { useItemsStore, itemsSnapshotHasState } from '@/stores/items.js';
import { syncPlannerCharacterStatsTextareaFromCharacter, refreshPlannerStatsPanelFromCharacter } from '@/character/planner-stats-panel.js';
import {
  getSavedBuilds,
  setSavedBuilds,
  notifySavedBuildsListRefresh,
} from '@/planner/saved-builds-storage.js';
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
        loadBuildData(build, buildIndex);
    } catch (error) {
        console.error('Failed to reload skill data:', error);
        toastManager.showToast(`Failed to reload skill data: ${error.message}`, false, 'danger');
    }
}

/**
 * Load build data without version checking (used after skill data reload)
 * @param {object} build - The build object to load
 * @param {number} buildIndex - The index of the build in the saved builds array
 */
export function loadBuildData(build, buildIndex = null) {
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

    if (build.questsCompleted && typeof build.questsCompleted === 'object') {
        importQuestsCompleted(build.questsCompleted, build.questCompletionOptOut);
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

    // Load oSkills (display/internal map, or legacy array rows with skillName/displayName)
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

    setDisabledSkillIds(Array.isArray(build.disabledSkills) ? build.disabledSkills : []);
    setDisabledOSkillSlotIds(Array.isArray(build.disabledOSkillSlots) ? build.disabledOSkillSlots : []);
    
    // Load soft-level bonuses
    if (build.allSkillsBonus !== undefined) {
        setAllSkillsBonus(build.allSkillsBonus);
    }
    if (build.classSkillsBonus !== undefined) {
        setClassSkillsBonus(build.classSkillsBonus);
    } else {
        setClassSkillsBonus(0);
    }

    // Load planner config conditions (selected checkboxes)
    if (Array.isArray(build.configConditions)) {
        try {
            // Reset/set each condition key
            for (const k of build.configConditions) {
                if (typeof k === 'string' && String(k).trim() !== '') {
                    setPlannerCondition(k, true);
                }
            }
        } catch (e) {
            console.warn('Failed to apply build configConditions:', e);
        }
    }

    // Load equipment / inventory / charms / relics (async catalog)
    try {
        const itemsStore = useItemsStore();
        const applyItems = () => {
            itemsStore.syncViewerClassName(build.class);
            if (build.items != null) itemsStore.fromSnapshot(build.items);
            else itemsStore.resetItems();
            itemsStore.pruneClassRestrictedEnableList();
            syncItemGrantedOSkills();
            runPlannerSkillStatRecompute({ immediate: true });
        };
        if (itemsStore.isCatalogCurrent) applyItems();
        else itemsStore.loadCatalog().then(applyItems);
    } catch (e) {
        console.warn('Failed to apply build items:', e);
    }
    
    // Class baseline stats only when the build has no stats blob (saved builds carry raw stat lines).
    const importedStatsText = build.stats != null ? String(build.stats).trim() : '';
    if (!importedStatsText && build.class) {
        applyClassBaselineStatsToCharacter(build.class);
    }
    runPlannerSkillStatRecompute({ immediate: true });
    
    clearSkillVariants();
    applySkillVariantDefaultsForClass(build.class);
    
    // Initialize tooltip functionality (needed for skill tooltips to work)
    initializeTooltip();
    
    // Initialize oSkills dropdown
    initializeOSkillsDropdown();
    
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
        runPlannerSkillStatRecompute({ immediate: true });
    }
    syncPlannerCharacterStatsTextareaFromCharacter();
    refreshPlannerStatsPanelFromCharacter();
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { buildLoad: true } }));
    
    // Set current build index so "Save" button works
    if (buildIndex !== null) {
        setCurrentBuildIndex(buildIndex);
    }
    // Show tree section
    showSection('tree');
    
    // Check for skills exceeding max level and invalid skill point pool
    const exceedingSkills = checkSkillsExceedingMaxLevel(getSkillsList());
    const poolOverBudget = isPlannerSkillPointPoolOverBudget();
    if (poolOverBudget) {
        toastManager.showToast('Spent skill points exceed available amount.', false, 'warning');
    }
    if (exceedingSkills.length > 0) {
        const skillList = exceedingSkills
            .map(skill => `${skill.skillName} (${skill.currentPoints}/${skill.maxLevel})`)
            .join(', ');
        
        toastManager.showToast(
            `Warning: Skills exceed maximum level: ${skillList}. Build loaded but may be invalid.`,
            false,
            'danger'
        );
    } else if (!poolOverBudget) {
        toastManager.showToast(`Build "${exportLabelForToast(build.name)}" loaded successfully!`, true, 'info');
    }
}

export function validateBuildBeforeSave() {
    // Check for skills exceeding max level BEFORE any save operation
    const exceedingSkills = checkSkillsExceedingMaxLevel(getSkillsList());
    if (exceedingSkills.length > 0) {
        const skillList = exceedingSkills
            .map(skill => `${skill.skillName} (${skill.currentPoints}/${skill.maxLevel})`)
            .join(', ');
        
        toastManager.showToast(
            `Cannot save build: Skills exceed maximum level: ${skillList}. Please fix these skills before saving.`,
            false,
            'danger'
        );
        return false; // Validation failed
    }
    return true; // Validation passed
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
        const buildData = JSON.parse(String(jsonString).trim());
        if (!validateBuildData(buildData)) {
            return false;
        }
        importBuild(buildData);
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
 * Validate build data structure
 * @param {object} buildData - The build data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateBuildData(buildData) {
    if (typeof buildData.name !== 'string') {
        toastManager.showToast('Build name must be a string', 'danger');
        return false;
    }

    const requiredFields = ['class', 'level', 'skillPoints'];
    for (const field of requiredFields) {
        if (buildData[field] === undefined || buildData[field] === null) {
            toastManager.showToast(`Missing required field: ${field}`, 'danger');
            return false;
        }
    }
    
    if (typeof buildData.class !== 'string') {
        toastManager.showToast('Build class must be a string', 'danger');
        return false;
    }
    
    if (typeof buildData.level !== 'number' || buildData.level < 1 || buildData.level > 150) {
        toastManager.showToast('Build level must be a number between 1 and 150', 'danger');
        return false;
    }
    
    if (typeof buildData.skillPoints !== 'object' || Array.isArray(buildData.skillPoints)) {
        toastManager.showToast('Skill points must be an object', 'danger');
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

            reloadSkillDataAndLoadBuild(buildData, null);
            return;
        }
        
        // Load build data directly (same version)
        loadBuildData(buildData, null);
        
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
    
    const keptName = builds[idx].name;
    setCurrentBuildDisplayName(keptName || '');
    const snap = buildCurrentBuildSnapshot(keptName);
    builds[idx] = snap;

    setSavedBuilds(builds);
    setCurrentBuildIndex(builds.indexOf(snap));
    notifySavedBuildsListRefresh();

    toastManager.showToast(`Build "${exportLabelForToast(snap.name)}" updated!`, true, 'info');
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
        (builds || []).map((b) => String(b?.name ?? '').trim()).filter((s) => s !== '')
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
    
    const build = builds[index];
    exportBuildJsonString(JSON.stringify(build), exportLabelForToast(build.name));
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

    const build = builds[index];
    const filename = buildJsonDownloadFilename(build.name);
    downloadTextAsJsonFile(JSON.stringify(build, null, 2), filename);
    toastManager.showToast(
        `Build "${exportLabelForToast(build.name)}" downloaded as JSON!`,
        true,
        'success'
    );
}

/**
 * Download the current live planner build as a pretty-printed .json file.
 * @param {string} name
 */
export function downloadCurrentBuildAsJson(name) {
    const snap = buildCurrentBuildSnapshot(name);
    const filename = buildJsonDownloadFilename(snap.name);
    downloadTextAsJsonFile(JSON.stringify(snap, null, 2), filename);
    toastManager.showToast(
        `Build "${exportLabelForToast(snap.name)}" downloaded as JSON!`,
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
export function loadBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }
    
    const build = builds[index];
    
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

        reloadSkillDataAndLoadBuild(build, index);
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
    loadBuildData(build, index);
}

export function deleteBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        return;
    }
    
    const buildName = builds[index].name;
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
    const defaultLabel = exportLabelForToast(currentBuild.name);
    const newName = prompt(`Enter new name for build "${defaultLabel}":`, currentBuild.name ?? '');
    
    if (newName === null) {
        return;
    }
    
    const trimmedName = newName.trim();
    
    // Check if name already exists (excluding current build); empty names can repeat
    const nameExists =
        trimmedName !== '' &&
        builds.some((build, i) => i !== index && build.name === trimmedName);
    if (nameExists) {
        toastManager.showToast(`Build name "${trimmedName}" already exists!`, true, 'danger');
        return;
    }
    
    const ref = builds[index];
    const wasCurrent = getCurrentBuildIndex() === index;
    ref.name = trimmedName;
    setSavedBuilds(builds);

    if (wasCurrent) {
        setCurrentBuildIndex(builds.indexOf(ref));
    }

    notifySavedBuildsListRefresh();
    
    toastManager.showToast(`Build renamed to "${trimmedName}"!`, true, 'info');
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
    return String(builds[idx].name ?? '');
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
    disabledOSkillSlots: getDisabledOSkillSlotIds(),
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
  try {
    const itemsStore = useItemsStore();
    const itemsSnap = itemsStore.toSnapshot();
    if (itemsSnapshotHasState(itemsSnap)) {
      snap.items = itemsSnap;
    }
  } catch {
    // ignore
  }
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
  return snap;
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
