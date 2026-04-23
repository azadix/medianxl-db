// Core functionality for the skills tree viewer
import { loadPlannerSkillsFromTreeData } from './tree-data.js';
import { renderSkills, updateTabColors } from './tree-render.js';
import { getCurrentTab, setCurrentTabState } from './tree-tab-state.js';
import { updatePlannerUrlTab } from './tree-url-sync.js';
import Tree from '../character/Tree.js';
import Character from '../character/Character.js';
import { initializeCharacter, applyClassBaselineStatsToCharacter, recomputeClassDerivedLifeMana, onPlannerSkillAllocationChanged, getSpentSkillPoints, getAllSkillPoints, getAllSkillPointsById, setAllSkillPoints, setAllSkillPointsById, importQuestsCompleted, setStatAllocation, getAllOSkills, addOSkill, clearOSkills, setAllOSkills, getMinimumRequiredLevel, getTotalQuestSkillPoints, checkSkillsExceedingMaxLevel, getAvailableSkillPoints, getCharacterInstance, getCharacterLevel, getEffectivePlannerLevel, parseStatsFromText, exportStatsToText, clearAllStats, getQuestsCompletedForSave, getQuestCompletionOptOutForSave, getStatAllocation } from '../character/character-state.js';
import { refreshPlannerStatsPanelFromCharacter } from '../character/planner-stats-panel.js';
import { initPlannerConfigPanel } from '../character/planner-config-panel.js';
import { setPlannerSectionFromLegacy } from '../src/planner/planner-section-bridge.js';
import {
    getSavedBuilds,
    setSavedBuilds,
    notifySavedBuildsListRefresh,
} from '../src/planner/saved-builds-storage.js';
import { getCurrentDevotion, getDevotionDisplayName } from '../skills/skill-calculations.js';
import { initializeTooltip, refreshCurrentTooltip, notifySkillGridDomReset } from './tree-tooltip.js';
import { ToastManager } from './ToastManager.js';
import { DropdownList } from './DropdownList.js';
import {
    getCurrentVersion,
    versionToString,
    setBuildVersionOverride,
    initializeVersionSelector
} from '../version-config.js';
import { getFileSkillStore } from './skill-data-store.js';
import { clearSkillVariants, applySkillVariantDefaultsForClass } from './skill-variants.js';

export { getSavedBuilds, notifySavedBuildsListRefresh };

/**
 * Class names for the planner from {@link getFileSkillStore} game_meta, else derived from skills.
 * @param {Array<{ class?: string }>} skillsListFallback - used when game_meta has no classes
 * @returns {string[]}
 */
function loadPlannerClassNames(skillsListFallback) {
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

// Global variables
let skillsList;
/** @type {Tree|null} */
let plannerTree = null;
let skillsContainer;
let classSelect;
let treeInitialized = false; // Track if tree has been initialized
let currentBuildIndex = null; // Track currently loaded build index for saving
/** Window listeners from setupGlobalEventListeners survive route changes; attach once. */
let plannerTreeGlobalListenersAttached = false;

/**
 * Parse version string to version object
 * @param {string} versionString - Version string like "2.11"
 * @returns {{ major: number, minor: number }} Version object
 */
function parseVersionString(versionString) {
    const parts = versionString.split('.');
    return {
        major: parseInt(parts[0]) || 0,
        minor: parseInt(parts[1]) || 0
    };
}

/**
 * Update the version selector dropdown to reflect the current version
 */
function updateVersionSelector() {
    const versionSelector = document.getElementById('version-selector');
    if (!versionSelector) return;
    
    const currentVersion = getCurrentVersion();

    // Find and select the current version option
    const options = versionSelector.querySelectorAll('option');
    options.forEach(option => {
        const optionVersion = JSON.parse(option.value);
        if (optionVersion.major === currentVersion.major && 
            optionVersion.minor === currentVersion.minor) {
            option.selected = true;
        } else {
            option.selected = false;
        }
    });
}

/**
 * Reload tree_data for the selected version and reinitialize the tree with a build.
 * @param {Object} build - Build to load after skill data reload
 * @param {number} buildIndex - The index of the build in the saved builds array
 */
async function reloadSkillDataAndLoadBuild(build, buildIndex) {
    try {
        skillsList = await loadPlannerSkillsFromTreeData();
        plannerTree = new Tree(skillsList);
        
        // Update version selector
        updateVersionSelector();
        
        const classes = loadPlannerClassNames(skillsList);
        
        // Clear and repopulate class selector
        if (classSelect) {
            classSelect.innerHTML = '';
            classes.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                opt.textContent = cls;
                classSelect.appendChild(opt);
            });
        }
        
        // Now load the build with the reloaded skill data
        loadBuildData(build, buildIndex);
        
    } catch (error) {
        console.error('Failed to reload skill data:', error);
        toastManager.showToast(`Failed to reload skill data: ${error.message}`, false, 'danger');
    }
}

/**
 * Load build data without version checking (used after skill data reload)
 * @param {Object} build - The build object to load
 * @param {number} buildIndex - The index of the build in the saved builds array
 */
function loadBuildData(build, buildIndex = null) {
    // Set class
    if (classSelect) {
        classSelect.value = build.class;
    }
    
    // Initialize character with loaded class and level first
    initializeCharacter(build.class, build.level);

    if (build.questsCompleted && typeof build.questsCompleted === 'object') {
        importQuestsCompleted(build.questsCompleted, build.questCompletionOptOut);
    }
    if (build.statAllocation && typeof build.statAllocation === 'object') {
        setStatAllocation(build.statAllocation);
    }
    
    // Load skill points (handle both old format with names and new format with IDs)
    if (build.skillPoints) {
        // Check if the first key is numeric (skill ID) or string (skill name)
        const firstKey = Object.keys(build.skillPoints)[0];
        if (firstKey && /^\d+$/.test(firstKey)) {
            // New format: skill IDs
            setAllSkillPointsById(build.skillPoints);
        } else {
            // Old format: skill names (backward compatibility)
            setAllSkillPoints(build.skillPoints);
        }
    }
    
    // Load oSkills
    setAllOSkills(build.oSkills || []);
    window.oSkills = getAllOSkills(); // Update window reference
    // Don't call updateOSkillsDisplay here - it will be called after renderSkills
    
    // Load All Skills bonus
    if (build.allSkillsBonus !== undefined) {
        setAllSkillsBonus(build.allSkillsBonus);
    }
    
    // Load Character Stats (panel + optional advanced textarea stay in sync via refresh)
    const statsText = build.stats != null ? String(build.stats).trim() : '';
    if (statsText) {
        const errors = parseStatsFromText(build.stats);
        if (errors.length > 0) {
            console.warn('Stats parsing errors when loading build:', errors);
        }
    } else if (build.class) {
        applyClassBaselineStatsToCharacter(build.class);
    }
    refreshPlannerStatsPanelFromCharacter();
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { buildLoad: true } }));
    
    clearSkillVariants();
    applySkillVariantDefaultsForClass(build.class);
    
    // Initialize tooltip functionality (needed for skill tooltips to work)
    initializeTooltip();
    
    // Initialize oSkills dropdown
    initializeOSkillsDropdown();
    
    // Render skills
    if (skillsList) {
        // If build has oSkills, switch to oSkills tab after rendering
        const hasOSkills = build.oSkills && (
            Array.isArray(build.oSkills) ? build.oSkills.length > 0 : Object.keys(build.oSkills).length > 0
        );
        renderSkills(build.class, skillsList, skillsContainer, hasOSkills ? 'oSkills' : null);
    }

    window.dispatchEvent(new CustomEvent('plannerConfigRefresh'));
    
    // Add event listener for skill point changes (needed for UI updates)
    // Remove any existing listener first to avoid duplicates
    window.removeEventListener('skillPointsChanged', handleSkillPointsChanged);
    window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
    
    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    
    // Update oSkills display after everything is rendered
    updateOSkillsDisplay();
    
    // Set current build index so "Save" button works
    if (buildIndex !== null) {
        currentBuildIndex = buildIndex;
    }
    updateSaveButtonVisibility();
    
    // Show tree section
    showSection('tree');
    
    // Check for skills exceeding max level
    const exceedingSkills = checkSkillsExceedingMaxLevel(skillsList);
    if (exceedingSkills.length > 0) {
        const skillList = exceedingSkills
            .map(skill => `${skill.skillName} (${skill.currentPoints}/${skill.maxLevel})`)
            .join(', ');
        
        toastManager.showToast(
            `Warning: Skills exceed maximum level: ${skillList}. Build loaded but may be invalid.`,
            false,
            'danger'
        );
    } else {
        toastManager.showToast(`Build "${build.name}" loaded successfully!`, true, 'info');
    }
}

// Initialize ToastManager
const toastManager = new ToastManager();

// Export function to get oSkill points (for tooltip) - now just re-exports from character-state
export { getOSkillPoints } from '../character/character-state.js';

/**
 * Calculate armor image number based on spent skill points
 * Maps 0 to max available skill points to 1-10 image numbers
 * @param {number} spentPoints - Total skill points spent
 * @returns {number} - Image number (1-10)
 */
export function calculateArmorImageNumber(spentPoints) {
    // Safety check for invalid spent points
    if (isNaN(spentPoints) || spentPoints < 0) {
        console.warn('calculateArmorImageNumber: Invalid spentPoints, using 0');
        spentPoints = 0;
    }
    
    // Get maximum available skill points from character config
    const maxSkillPoints = getAvailableSkillPoints();
    
    // If character not initialized or invalid maxSkillPoints, use a reasonable default
    if (!maxSkillPoints || maxSkillPoints <= 0 || isNaN(maxSkillPoints)) {
        // Use a reasonable default based on typical character level 150
        // Level 150 = 149 base points + ~14 quest points = ~163 total
        const defaultMaxPoints = 163;
        const clampedPoints = Math.max(0, Math.min(defaultMaxPoints, spentPoints));
        const imageNumber = Math.ceil((clampedPoints / defaultMaxPoints) * 10);
        return Math.max(1, Math.min(10, imageNumber));
    }
    
    // Clamp spent points to valid range (0 to max available)
    const clampedPoints = Math.max(0, Math.min(maxSkillPoints, spentPoints));
    
    // Map 0 to max points to 1-10 images with even distribution across the range
    const imageNumber = Math.ceil((clampedPoints / maxSkillPoints) * 10);
    
    // Ensure result is within valid range (1-10)
    return Math.max(1, Math.min(10, imageNumber));
}

/**
 * After skill data and DOM nodes exist: restore the Vue skill grid when a planner session
 * is already in memory (e.g. user left /planner for / and came back). Otherwise match main()
 * for deep-linked /planner?class= when there is no character yet.
 */
async function finalizePlannerPageAfterLoad() {
    if (!treeInitialized || !skillsList || !classSelect || !skillsContainer) {
        return;
    }
    const availableClasses = Array.from(classSelect.options).map((option) => option.value);
    if (!availableClasses.length) {
        return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const urlClass = urlParams.get('class');
    const existingCharacter = getCharacterInstance();

    if (existingCharacter) {
        let selectedClass = availableClasses[0];
        if (urlClass && availableClasses.includes(urlClass)) {
            selectedClass = urlClass;
        } else if (existingCharacter.className && availableClasses.includes(existingCharacter.className)) {
            selectedClass = existingCharacter.className;
        }
        classSelect.value = selectedClass;

        const urlTab = urlParams.get('tab');
        const savedTab = urlTab || getCurrentTab();

        renderSkills(selectedClass, skillsList, skillsContainer, savedTab);
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        updateOSkillsDisplay();
        window.dispatchEvent(new CustomEvent('plannerConfigRefresh'));
        initializeTooltip();
        initializeOSkillsDropdown();
    } else if (urlClass && availableClasses.includes(urlClass)) {
        await main();
    }
}

// Main initialization function
export async function initializeTreePage() {
    skillsContainer = document.getElementById('skillsContainer');
    classSelect = document.getElementById('classSelect');
    
    if (!skillsContainer || !classSelect) {
        console.error('Required elements not found');
        return;
    }
    
    // Load skill JSON immediately when page loads
    try {
        skillsList = await loadPlannerSkillsFromTreeData();
        plannerTree = new Tree(skillsList);
        treeInitialized = true;

        const classes = loadPlannerClassNames(skillsList);
        
        classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            classSelect.appendChild(opt);
        });

        const versionSelector = document.getElementById('version-selector');
        if (versionSelector) {
            versionSelector.innerHTML = '';
            await initializeVersionSelector(versionSelector);
        }

    } catch (error) {
        console.error('Error loading skill data on page initialization:', error);
        return;
    }
    
    // Set up class change event listener
    if (!classSelect) {
        console.error('classSelect is null when trying to add event listener!');
        return;
    }
    
    classSelect.addEventListener('change', function onPlannerClassSelectChange() {
        const newClass = classSelect.value;
        
        // Reset tab when class changes - will be set to first tab by renderSkills
        setCurrentTabState(null);
        updateUrlState(newClass, null);
        
        // Clear oSkills when switching classes (like resetBuild but without confirmation)
        clearOSkills();
        window.oSkills = getAllOSkills(); // Update window reference
        
        // Reset oSkills dropdown input
        const oskillDropdown = document.querySelector('#oskill-dropdown .dropdown-list-input');
        if (oskillDropdown) {
            oskillDropdown.value = '';
        }
        
        // Clear any filtered dropdown results
        const oskillDropdownList = document.querySelector('#oskill-dropdown .dropdown-list');
        if (oskillDropdownList && window.oskillDropdownInstance) {
            window.oskillDropdownInstance.renderItems(); // Re-render all items
        }
        
        // Reinitialize character state for new class, preserving current level
        const currentLevel = getCharacterLevel();
        initializeCharacter(newClass, currentLevel);
        
        // Clear character stats when switching classes, then apply class defaults from DB
        clearAllStats();
        applyClassBaselineStatsToCharacter(newClass);
        clearSkillVariants();
        applySkillVariantDefaultsForClass(newClass);
        refreshPlannerStatsPanelFromCharacter();
        window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { classChange: true } }));
        
        // Get current references to ensure we have the latest data
        const currentSkillsList = skillsList;
        const currentSkillsContainer = document.getElementById('skillsContainer');
        
        if (!currentSkillsList || !currentSkillsContainer) {
            console.error('Missing skillsList or skillsContainer:', { currentSkillsList, currentSkillsContainer });
            return;
        }
        
        renderSkills(newClass, currentSkillsList, currentSkillsContainer);
        
        // Update displays
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        updateOSkillsDisplay();

        window.dispatchEvent(new CustomEvent('plannerConfigRefresh'));
    });
    
    // Set up global event listeners (only once during initialization)
    setupGlobalEventListeners();

    initPlannerConfigPanel();

    await finalizePlannerPageAfterLoad();
}

/**
 * Set up global event listeners that should only be added once
 */
function setupGlobalEventListeners() {
    if (plannerTreeGlobalListenersAttached) {
        return;
    }
    plannerTreeGlobalListenersAttached = true;
    // Add event listener for skill point changes
    window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
    
    // Add event listener for oSkills changes
    window.addEventListener('oskillsUpdated', () => {
        updateOSkillsDisplay();
    });
    
    // Add event listener for character level changes
    window.addEventListener('characterLevelChanged', () => {
        handleSkillPointsChanged(); // Re-render to update max levels
    });
    
    // Add event listener for quest completion changes
    window.addEventListener('questCompletionChanged', () => {
        handleSkillPointsChanged(); // Re-render to update available skill points
    });
    
    // Add event listener for character stats changes
    window.addEventListener('characterStatsChanged', () => {
        // Refresh tooltip if one is currently shown (stats affect tooltip calculations)
        refreshCurrentTooltip();
    });
    
    // Add event listener for All Skills bonus changes
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    if (allSkillsBonusInput) {
        allSkillsBonusInput.addEventListener('input', () => {
            // Refresh tooltip if one is currently shown
            refreshCurrentTooltip();
        });
    }

}

// Debounce timer for skill card updates
let skillCardUpdateTimer = null;

/**
 * Handle skill points changed event
 * Updates the UI when skill points are added or removed
 * Uses debouncing to avoid excessive updates during rapid changes
 */
function handleSkillPointsChanged() {
    // Debounce rapid updates - only update after 50ms of no changes
    if (skillCardUpdateTimer) {
        clearTimeout(skillCardUpdateTimer);
    }
    
    skillCardUpdateTimer = setTimeout(() => {
        const currentClass = classSelect.value;
        const savedTab = getCurrentTab();
        
        // Re-render without redrawing arrows (just update cards)
        renderSkills(currentClass, skillsList, skillsContainer, savedTab, false);
        
        // Update displays
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        onPlannerSkillAllocationChanged();

        // Trigger tooltip refresh after a small delay to ensure minLevelDisplay is updated
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tooltipRefresh'));
        }, 10);

        skillCardUpdateTimer = null;
    }, 50);
}

// Main application entry point
async function main() {
    try {
        // Skill file store should already be initialized during page load
        if (!treeInitialized) {
            console.error('Skill data not initialized. This should not happen.');
            return;
        }

        // Get state from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const savedClass = urlParams.get('class');
        const savedTab = urlParams.get('tab');
        
        // Get available classes from the select element
        const availableClasses = Array.from(classSelect.options).map(option => option.value);
        
        // Use saved class or default to first class
        const selectedClass = savedClass && availableClasses.includes(savedClass) ? savedClass : availableClasses[0];
        classSelect.value = selectedClass;

        // Initialize character state (quests are already set to defaults in characterState)
        initializeCharacter(selectedClass, Character.DEFAULT_LEVEL);
        applyClassBaselineStatsToCharacter(selectedClass);
        refreshPlannerStatsPanelFromCharacter();

        clearSkillVariants();
        applySkillVariantDefaultsForClass(selectedClass);

        // Render skills with saved tab if specified
        renderSkills(selectedClass, skillsList, skillsContainer, savedTab);
        
        // Update displays
        updateSkillPointsDisplay();
        updateDevotionDisplay();

        window.dispatchEvent(new CustomEvent('plannerConfigRefresh'));
        
        // Initialize tooltip functionality
        initializeTooltip();
        
        // Initialize oSkills dropdown
        initializeOSkillsDropdown();
        
        // Update URL if we have a saved tab
        if (savedTab) {
            updateUrlState(selectedClass, savedTab);
        }
        
    } catch (error) {
        console.error('Error initializing tree page:', error);
    }
}

// Update URL with current state
function updateUrlState(selectedClass, selectedTab) {
    updatePlannerUrlTab(selectedClass, selectedTab);
}

// Update skill points display
function updateSkillPointsDisplay() {
    // Update minimum level display (which now includes available skill points)
    updateMinimumLevelDisplay();
}


// Update devotion display (for Paladin and Amazon)
function updateDevotionDisplay() {
    const devotionField = document.getElementById('devotionField');
    const devotionDisplay = document.getElementById('devotionDisplay');
    const currentClass = classSelect ? classSelect.value : null;
    
    if (!devotionField || !devotionDisplay) return;
    
    // Show for Paladin and Amazon
    if (currentClass === 'Paladin' || currentClass === 'Amazon') {
        const skillLevels = getAllSkillPoints();
        const currentDevotion = getCurrentDevotion(skillLevels);
        const devotionName = getDevotionDisplayName(currentDevotion);

        if (currentDevotion === 'none') {
            devotionField.style.display = 'none';
        } else {
            devotionField.style.display = 'flex';
            devotionDisplay.textContent = devotionName;

            devotionDisplay.className = 'has-text-centered has-text-weight-bold';

            if (currentDevotion === 'holy') {
                devotionDisplay.classList.add('has-text-warning');
            } else if (currentDevotion === 'neutral') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'unholy') {
                devotionDisplay.classList.add('has-text-purple');
            } else if (currentDevotion === 'bow') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'javelin') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'spear') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'storm') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'blood') {
                devotionDisplay.classList.add('has-text-white');
            }
        }
    } else {
        devotionField.style.display = 'none';
    }
}

// Update minimum level display
function updateMinimumLevelDisplay() {
    const minLevelField = document.getElementById('minLevelField');
    const minLevelDisplay = document.getElementById('minLevelDisplay');
    const minLevelSpentPart = document.getElementById('minLevelSpentPart');
    const minLevelAvailPart = document.getElementById('minLevelAvailPart');

    if (!minLevelField || !minLevelDisplay || !minLevelSpentPart || !minLevelAvailPart) return;

    const spentPoints = getSpentSkillPoints();
    // Same level for title and available total: min. level for this build (1 with no skills, else prerequisite level).
    const effectiveLevel = getEffectivePlannerLevel();
    const availableBasePoints = Character.getBaseSkillPoints(effectiveLevel);
    const availableQuestPoints = getTotalQuestSkillPoints(effectiveLevel);
    const totalAvailable = availableBasePoints + availableQuestPoints;

    minLevelDisplay.textContent = `Level ${effectiveLevel}`;

    minLevelSpentPart.textContent = `${spentPoints} spent`;
    minLevelAvailPart.textContent = `${totalAvailable} available`;
    minLevelAvailPart.dataset.poolBase = String(availableBasePoints);
    minLevelAvailPart.dataset.poolQuest = String(availableQuestPoints);
    minLevelAvailPart.dataset.poolLevel = String(effectiveLevel);

    recomputeClassDerivedLifeMana();
}

// Export function to update tab state (called from render module)
export function setCurrentTab(tabName) {
    setCurrentTabState(tabName);
    updatePlannerUrlTab(classSelect ? classSelect.value : '', tabName);
}

function getAllSkillsBonus() {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    return allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
}

function setAllSkillsBonus(value) {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    if (allSkillsBonusInput) {
        allSkillsBonusInput.value = Math.max(0, parseInt(value) || 0);
        allSkillsBonusInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/** Menu / sidebar / load actions (wired from Vue components). */
export async function plannerMenuNewBuild() {
    showSection('tree');
    if (!treeInitialized) {
        console.error('Skill data not initialized. Cannot create new build.');
        return;
    }
    currentBuildIndex = null;
    await main();
    updateSaveButtonVisibility();
}

export async function plannerMenuOpenLoadSection() {
    if (!treeInitialized) {
        await main();
    }
    showSection('load');
}

export async function plannerMenuImportBuild() {
    if (!treeInitialized) {
        await main();
    }
    promptAndImportBuild();
}

export function plannerMenuOpenHelp() {
    showHelpModal();
}

export function plannerBackToMenuFromTree() {
    toastManager.cleanUpToastMessages();
    window.history.replaceState({}, '', window.location.pathname);
    showSection('menu');
}

export function plannerBackToMenuFromLoad() {
    window.history.replaceState({}, '', window.location.pathname);
    showSection('menu');
}

export function plannerResetBuildClick() {
    if (confirm('Are you sure you want to reset this build? All skill points will be lost.')) {
        resetBuild();
    }
}

export function plannerSaveBuildClick() {
    if (!validateBuildBeforeSave()) {
        return;
    }
    if (currentBuildIndex !== null) {
        updateCurrentBuild();
    }
}

export function plannerSaveAsBuildClick() {
    promptAndSaveBuild();
}

// Show/hide sections (visibility owned by Vue / Pinia via planner-section-bridge.js)
function showSection(sectionName) {
    setPlannerSectionFromLegacy(sectionName);
    if (sectionName === 'load') {
        notifySavedBuildsListRefresh();
    }
}


// Reset current build
function resetBuild(showToast = true) {
    // Reset to first class
    if (classSelect && skillsList) {
        const classes = [...new Set(skillsList.map(skill => skill.class))];
        if (classes.length > 0) {
            classSelect.value = classes[0];
        }
    }
    
    // Clear all skill points and reset quest completion to defaults
    const currentClass = classSelect ? classSelect.value : null;
    initializeCharacter(currentClass, Character.DEFAULT_LEVEL);
    applyClassBaselineStatsToCharacter(currentClass);

    refreshPlannerStatsPanelFromCharacter();
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { reset: true } }));
    setAllSkillsBonus(0);

    clearSkillVariants();
    applySkillVariantDefaultsForClass(currentClass);
    
    if (currentClass && skillsList) {
        renderSkills(currentClass, skillsList, skillsContainer);
    }

    window.dispatchEvent(new CustomEvent('plannerConfigRefresh'));
    
    // Clear current build index (this is a new build)
    currentBuildIndex = null;
    updateSaveButtonVisibility();
    
    // Clear oSkills
    clearOSkills();
    window.oSkills = getAllOSkills(); // Update window reference
    updateOSkillsDisplay();
    
    // Reset oSkills dropdown input
    const oskillDropdown = document.querySelector('#oskill-dropdown .dropdown-list-input');
    if (oskillDropdown) {
        oskillDropdown.value = '';
    }
    
    // Clear any filtered dropdown results
    if (window.oskillDropdownInstance) {
        window.oskillDropdownInstance.renderItems(); // Re-render all items
    }
    
    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    
    // Show toast notification if requested
    if (showToast) {
        toastManager.showToast('Build reset successfully!', true, 'info');
    }
}

// Build Save/Load System
function updateSaveButtonVisibility() {
    const saveBuildBtn = document.getElementById('saveBuildBtn');
    if (saveBuildBtn) {
        // Show "Save" button only when a build is loaded
        saveBuildBtn.style.display = currentBuildIndex !== null ? 'block' : 'none';
    }
}

function validateBuildBeforeSave() {
    // Check for skills exceeding max level BEFORE any save operation
    const exceedingSkills = checkSkillsExceedingMaxLevel(skillsList);
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

function promptAndSaveBuild() {
    // Validate build before showing prompt
    if (!validateBuildBeforeSave()) {
        return;
    }
    
    const buildName = prompt('Enter a name for this build:');
    if (!buildName || buildName.trim() === '') {
        return;
    }
    
    // Clean the build name: trim whitespace and remove newlines
    const cleanBuildName = buildName.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    
    saveBuild(cleanBuildName);
}

function promptAndImportBuild() {
    const jsonString = prompt('Paste the build JSON string:');
    if (!jsonString || jsonString.trim() === '') {
        return;
    }
    
    try {
        // Parse the JSON string
        const buildData = JSON.parse(jsonString.trim());
        
        // Validate the build data structure
        if (!validateBuildData(buildData)) {
            return;
        }
        
        // Import the build
        importBuild(buildData);
        
    } catch (error) {
        toastManager.showToast(`Invalid JSON: ${error.message}`, false, 'danger');
    }
}

/**
 * Validate build data structure
 * @param {Object} buildData - The build data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateBuildData(buildData) {
    // Check required fields
    const requiredFields = ['name', 'class', 'level', 'skillPoints'];
    for (const field of requiredFields) {
        if (!buildData[field]) {
            toastManager.showToast(`Missing required field: ${field}`, 'danger');
            return false;
        }
    }
    
    // Validate data types
    if (typeof buildData.name !== 'string') {
        toastManager.showToast('Build name must be a string', 'danger');
        return false;
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
    
    // Validate oSkills if present
    if (buildData.oSkills !== undefined) {
        if (typeof buildData.oSkills !== 'object') {
            toastManager.showToast('oSkills must be an object', 'danger');
            return false;
        }
    }
    
    // allSkillsBonus is optional (for backward compatibility)
    if (buildData.allSkillsBonus !== undefined) {
        if (typeof buildData.allSkillsBonus !== 'number' || buildData.allSkillsBonus < 0) {
            toastManager.showToast('allSkillsBonus must be a non-negative number', 'danger');
            return false;
        }
    }

    if (buildData.questsCompleted !== undefined) {
        if (typeof buildData.questsCompleted !== 'object' || buildData.questsCompleted === null || Array.isArray(buildData.questsCompleted)) {
            toastManager.showToast('questsCompleted must be an object', 'danger');
            return false;
        }
    }

    if (buildData.questCompletionOptOut !== undefined) {
        if (typeof buildData.questCompletionOptOut !== 'object' || buildData.questCompletionOptOut === null || Array.isArray(buildData.questCompletionOptOut)) {
            toastManager.showToast('questCompletionOptOut must be an object', 'danger');
            return false;
        }
    }

    if (buildData.statAllocation !== undefined) {
        if (typeof buildData.statAllocation !== 'object' || buildData.statAllocation === null || Array.isArray(buildData.statAllocation)) {
            toastManager.showToast('statAllocation must be an object', 'danger');
            return false;
        }
    }
    
    return true;
}

/**
 * Import a build from build data
 * @param {Object} buildData - The build data to import
 */
function importBuild(buildData) {
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

function updateCurrentBuild() {
    if (currentBuildIndex === null) {
        return;
    }
    
    const builds = getSavedBuilds();
    if (currentBuildIndex < 0 || currentBuildIndex >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }
    
    const currentClass = classSelect ? classSelect.value : null;
    const currentLevel = getMinimumRequiredLevel();
    const spentPoints = getSpentSkillPoints();
    
    // Update existing build
    builds[currentBuildIndex] = {
        name: builds[currentBuildIndex].name, // Keep original name
        version: versionToString(getCurrentVersion()),
        class: currentClass,
        level: currentLevel,
        spentPoints: spentPoints,
        skillPoints: getAllSkillPointsById(), // Use skill IDs instead of names
        oSkills: getAllOSkills(), // Save oSkills (now with skill IDs)
        allSkillsBonus: getAllSkillsBonus(), // Save All Skills bonus
        stats: exportStatsToText(), // Save stats as text
        questsCompleted: getQuestsCompletedForSave(),
        questCompletionOptOut: getQuestCompletionOptOutForSave(),
        statAllocation: getStatAllocation(),
        savedAt: new Date().toISOString()
    };
    
    setSavedBuilds(builds);
    notifySavedBuildsListRefresh();
    
    toastManager.showToast(`Build "${builds[currentBuildIndex].name}" updated!`, true, 'info');
}

function saveBuild(buildName) {
    const currentClass = classSelect ? classSelect.value : null;
    const currentLevel = getMinimumRequiredLevel();
    const skillPoints = getAllSkillPointsById(); // Use skill IDs instead of names
    const spentPoints = getSpentSkillPoints();
    
    const build = {
        name: buildName,
        version: versionToString(getCurrentVersion()),
        class: currentClass,
        level: currentLevel,
        spentPoints: spentPoints,
        skillPoints: skillPoints,
        oSkills: getAllOSkills(), // Save oSkills (now with skill IDs)
        allSkillsBonus: getAllSkillsBonus(), // Save All Skills bonus
        stats: exportStatsToText(), // Save stats as text
        questsCompleted: getQuestsCompletedForSave(),
        questCompletionOptOut: getQuestCompletionOptOutForSave(),
        statAllocation: getStatAllocation(),
        savedAt: new Date().toISOString()
    };
    
    
    // Get existing builds
    const builds = getSavedBuilds();
    
    // Add new build
    builds.push(build);
    
    setSavedBuilds(builds);
    notifySavedBuildsListRefresh();
    
    // Set current build index to the newly saved build
    currentBuildIndex = builds.length - 1;
    updateSaveButtonVisibility();
    
    toastManager.showToast(`Build "${buildName}" saved successfully!`, true, 'info');
}

export function ensureCharacterForBuildList() {
    const characterInstance = getCharacterInstance();
    if (!characterInstance) {
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
    
    // Convert build to single-line JSON
    const buildJson = JSON.stringify(build);
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(buildJson).then(() => {
            toastManager.showToast(`Build "${build.name}" exported to clipboard!`, true, 'success');
        }).catch(() => {
            // Fallback to legacy method
            fallbackCopyToClipboard(buildJson, build.name);
        });
    } else {
        // Fallback to legacy method
        fallbackCopyToClipboard(buildJson, build.name);
    }
}

/**
 * Fallback method for copying to clipboard when modern API fails
 * @param {string} text - Text to copy
 * @param {string} buildName - Name of the build for user feedback
 */
function fallbackCopyToClipboard(text, buildName) {
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
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 80%;
        max-height: 80%;
        overflow: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;
    
    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #333;">Export Build: ${buildName}</h3>
        <p style="color: #666; margin-bottom: 15px;">Copy the JSON text below:</p>
        <textarea readonly style="
            width: 100%;
            height: 200px;
            font-family: monospace;
            font-size: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 10px;
            resize: vertical;
            background: #f8f8f8;
        ">${jsonText}</textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button id="closeExportModal" style="
                background: #3273dc;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            ">Close</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus and select the textarea
    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.select();
    
    // Close modal when clicking close button
    modal.querySelector('#closeExportModal').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    // Close modal when clicking overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
    
    // Close modal with Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    toastManager.showToast(`Build "${buildName}" export shown in dialog - copy manually`, false, 'info');
}

/**
 * Show help modal with keyboard shortcuts and tips
 */
function showHelpModal() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal is-active';
    overlay.style.cssText = 'z-index: 10000;';
    
    // Create modal background
    const modalBackground = document.createElement('div');
    modalBackground.className = 'modal-background';
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.style.cssText = 'min-width: 50%; max-height: 80vh;';
    
    modal.innerHTML = `
        <header class="modal-card-head px-4">
            <p class="modal-card-title">Planner Help</p>
        </header>
        <section class="modal-card-body p-4">
            <div class="content">
                <h4 class="title is-5 mb-3">Keyboard Shortcuts</h4>
                <ul>
                    <li><strong>Click:</strong> Add or remove 1 skill point</li>
                    <li><strong>Shift + Click:</strong> Add or remove 25 skill points at once</li>
                    <li><strong>Ctrl + Hover:</strong> Hold Ctrl and hover over a skill to see the raw formula instead of the calculated value</li>
                </ul>
                                
                <h4 class="title is-5 mb-3 mt-5">Stat Colors</h4>
                <p>Stat values in skill tooltips are color-coded to indicate their type:</p>
                <ul>
                    <li><span class="has-text-white">is-white</span> - Plain text</li>
                    <li><span class="has-text-danger">is-danger</span> - Unknown value (displayed when a stat value cannot be determined)</li>
                    <li><span class="has-text-primary">is-primary</span> - Constant (indicates a constant value that does not change with skill level)</li>
                    <li><span class="has-text-warning">is-warning</span> - Function outcome (shown when a stat value is calculated from a formula or function)</li>
                </ul>

                <h4 class="title is-5 mb-3 mt-5">Tips</h4>
                <ul>
                    <li>Hover over skill cards to see detailed tooltips with scaling values</li>
                    <li>Use the "+# to All Skills" input to apply bonuses to all skills</li>
                    <li>Character stats: use Life, Mana, Str, Dex, Energy, Vitality fields; skills can add extra stats. Life and Mana cannot go below 0.</li>
                    <li>Arrows between skills show prerequisite relationships</li>
                    <li>Skills that are maxed out are highlighted in yellow</li>
                    <li>You can save multiple builds and switch between them using "Load/Export Build"</li>
                </ul>
                
                <h4 class="title is-5 mb-3 mt-5">Character Stats</h4>
                <p>The sidebar lists core attributes as numeric fields. Extra stats appear when a skill formula references them; use &times; to remove unused extras.</p>
                <p>Advanced: paste multiple lines under &quot;raw stat lines&quot; using <code>{{stat_key}}=value</code>. Saved builds store the same text format as before.</p>
            </div>
        </section>
        <footer class="modal-card-foot p-4">
            <button class="button is-primary" id="closeHelpModalBtn">Close</button>
        </footer>
    `;
    
    overlay.appendChild(modalBackground);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close modal handlers
    const closeModal = () => {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', handleEscape);
    };
    
    // Close modal when clicking close button or background
    modal.querySelector('#closeHelpModalBtn').addEventListener('click', closeModal);
    modalBackground.addEventListener('click', closeModal);
    
    // Close modal with Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleEscape);
}

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
    
    if (confirm(`Delete build "${buildName}"?`)) {
        builds.splice(index, 1);
        setSavedBuilds(builds);
        
        // If we deleted the currently loaded build, clear the index
        if (currentBuildIndex === index) {
            currentBuildIndex = null;
            updateSaveButtonVisibility();
        } else if (currentBuildIndex !== null && currentBuildIndex > index) {
            // Adjust index if we deleted a build before the current one
            currentBuildIndex--;
        }
        
        notifySavedBuildsListRefresh();
        toastManager.showToast(`Build "${buildName}" deleted.`, true, 'info');
    }
}

export function renameBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        return;
    }
    
    const currentBuild = builds[index];
    const newName = prompt(`Enter new name for build "${currentBuild.name}":`, currentBuild.name);
    
    if (!newName || newName.trim() === '') {
        return;
    }
    
    const trimmedName = newName.trim();
    
    // Check if name already exists (excluding current build)
    const nameExists = builds.some((build, i) => i !== index && build.name === trimmedName);
    if (nameExists) {
        toastManager.showToast(`Build name "${trimmedName}" already exists!`, true, 'danger');
        return;
    }
    
    // Update the build name
    builds[index].name = trimmedName;
    setSavedBuilds(builds);
    
    notifySavedBuildsListRefresh();
    
    toastManager.showToast(`Build renamed to "${trimmedName}"!`, true, 'info');
}

// oSkills Management
function initializeOSkillsDropdown() {
    const sidebarDropdownContainer = document.getElementById('oskill-dropdown');
    const sidebarHiddenInput = document.getElementById('oskill-hidden');

    if (sidebarDropdownContainer) {
        sidebarDropdownContainer.innerHTML = '';
    }

    const store = getFileSkillStore();
    if (!store?.catalog?.length) return;
    const skillItems = [];
    for (const row of store.catalog) {
        const det = store.getSkillDetail(row.id);
        if (!det) continue;
        const description = det.description || '';
        const skillEffect = det.skill_effect || '';
        const className = det.className || store.primaryClassDisplayName(row) || 'Other';
        skillItems.push({
            value: row.numericId,
            name: row.displayName,
            skillName: row.id,
            image: det.image,
            className,
            desc: `${className || 'No Class'}`,
            hasDetails:
                (description && description.trim().length > 0) ||
                (skillEffect && skillEffect.trim().length > 0),
            description,
            skillEffect
        });
    }
    skillItems.sort((a, b) => {
        const c = String(a.className || '').localeCompare(String(b.className || ''));
        if (c !== 0) return c;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (sidebarDropdownContainer && sidebarHiddenInput) {
        const sidebarDropdown = new DropdownList(sidebarDropdownContainer, {
            placeholder: 'Select skill...',
            emptyListText: 'No skills found',
            defaultHeaderText: 'All Skills',
            onSelect: (item) => {
                if (item) {
                    addOSkill(
                        item.value,
                        item.name,
                        item.skillName,
                        item.image,
                        item.className,
                        item.hasDetails,
                        item.description,
                        item.skillEffect
                    );
                    sidebarDropdown.value = null;
                }
            }
        });
        sidebarDropdown.setItems(skillItems);
        window.oskillDropdownInstance = sidebarDropdown;
    }
}

// oSkills management is now handled by character-state.js
// These are just thin wrappers for backwards compatibility

function updateOSkillsDisplay() {
    // Update window reference for other modules (like tree-render.js)
    window.oSkills = getAllOSkills();
    
    
    // Update the oSkills tab
    updateOSkillsTab();
    
    // Update tab colors (lightweight - just updates CSS classes)
    const tabsWithPoints = new Set();
    
    // Check regular skills for points
    const skillPoints = getAllSkillPoints();
    if (skillsList) {
        skillsList.forEach(skill => {
            if (skillPoints[skill.id] > 0 && skill.tabName) {
                tabsWithPoints.add(skill.tabName);
            }
        });
    }
    
    // Check if oSkills tab should be highlighted
    if (window.oSkills && (
        Array.isArray(window.oSkills) ? window.oSkills.length > 0 : Object.keys(window.oSkills).length > 0
    )) {
        tabsWithPoints.add('oSkills');
    }
    
    updateTabColors(tabsWithPoints);
}

function updateOSkillsTab() {
    const container = document.getElementById('tab-oSkills');
    if (!container) {
        return;
    }
    notifySkillGridDomReset();
}

/**
 * Current planner skill tree wrapper (Skill rows for loaded version/class list).
 * @returns {Tree|null}
 */
export function getPlannerTree() {
    return plannerTree;
}
