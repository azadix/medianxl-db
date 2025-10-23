// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite, getDatabase } from './tree-data.js';
import { renderSkills, renderDifficultyCheckboxes, updateTabColors } from './tree-render.js';
import Character from '../character/Character.js';
import { initializeCharacter, setCharacterLevel, getSpentSkillPoints, getAllSkillPoints, getAllSkillPointsById, setAllSkillPoints, setAllSkillPointsById, updateQuestCompletion, getQuestCompletion, getAllOSkills, addOSkill, changeOSkillPoints, clearOSkills, setAllOSkills, getMinimumRequiredLevel, getTotalQuestSkillPoints, checkSkillsExceedingMaxLevel, getAvailableSkillPoints, getCharacterInstance, getCharacterLevel } from '../character/character-state.js';
import { getCurrentDevotion, getDevotionDisplayName } from '../skills/skill-calculations.js';
import { initializeTooltip, refreshCurrentTooltip } from './tree-tooltip.js';
import { ToastManager } from './ToastManager.js';
import { DropdownList } from '../edit/DropdownList.js';
import { renderSkillCard, getSkillIcon } from './tree-card-renderer.js';
import { getCurrentVersion, versionToString, setCurrentVersion } from '../version-config.js';

// Global variables
let skillsList;
let skillsContainer;
let classSelect;
let currentTab = null;
let treeInitialized = false; // Track if tree has been initialized
let currentBuildIndex = null; // Track currently loaded build index for saving

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
    const currentVersionString = versionToString(currentVersion);
    
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
 * Silently reload database and reinitialize tree with new version
 * @param {Object} build - The build to load after database reload
 * @param {number} buildIndex - The index of the build in the saved builds array
 */
async function reloadDatabaseAndLoadBuild(build, buildIndex) {
    try {
        // Reload skills from SQLite with new version
        skillsList = await loadSkillsFromSQLite();
        
        // Update version selector
        updateVersionSelector();
        
        // Re-populate class selector from new database
        const db = getDatabase();
        const classes = [];
        try {
            const stmt = db.prepare('SELECT name FROM classes WHERE name NOT IN ("Other") ORDER BY name');
            while (stmt.step()) {
                classes.push(stmt.get()[0]);
            }
            stmt.free();
        } catch (error) {
            console.warn('Could not load classes from database, falling back to skill list:', error);
            classes.push(...[...new Set(skillsList.map(skill => skill.class))].filter(c => c !== 'Other'));
        }
        
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
        
        // Now load the build with the new database
        loadBuildData(build, buildIndex);
        
    } catch (error) {
        console.error('Failed to reload database:', error);
        toastManager.showToast(`Failed to reload database: ${error.message}`, false, 'danger');
    }
}

/**
 * Load build data without version checking (used after database reload)
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
    
    // Initialize tooltip functionality (needed for skill tooltips to work)
    initializeTooltip();
    
    // Initialize oSkills dropdown
    initializeOSkillsDropdown();
    
    // Render skills first (this creates the difficulty checkboxes)
    if (skillsList) {
        // If build has oSkills, switch to oSkills tab after rendering
        const hasOSkills = build.oSkills && (
            Array.isArray(build.oSkills) ? build.oSkills.length > 0 : Object.keys(build.oSkills).length > 0
        );
        renderSkills(build.class, skillsList, skillsContainer, hasOSkills ? 'oSkills' : null);
    }
    
    // Re-render difficulty checkboxes AFTER renderSkills so they exist
    // Quest completion is automatically determined by character level
    renderDifficultyCheckboxes();
    
    // Setup difficulty event listeners (needed for difficulty checkboxes to work)
    setupDifficultyEventListeners();
    
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
function calculateArmorImageNumber(spentPoints) {
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
 * Update build list images based on current skill points
 * This is called when skill points change to update the current build's image
 */
function updateBuildListImages() {
    const container = document.getElementById('saved-builds-list');
    if (!container) return;
    
    // Only update if we're currently viewing the load section
    const loadSection = document.getElementById('load-section');
    if (!loadSection || loadSection.style.display === 'none') return;
    
    // Get current spent points
    const currentSpentPoints = getSpentSkillPoints();
    const currentClass = classSelect.value;
    
    // Find the current build in the list and update its image
    const buildImages = container.querySelectorAll('img[alt]');
    buildImages.forEach(img => {
        // Check if this is the current class and update the image
        if (img.alt === currentClass) {
            const armorImageNumber = calculateArmorImageNumber(currentSpentPoints);
            img.src = `icons/portraits/${currentClass}/${armorImageNumber}.gif`;
        }
    });
}

// Main initialization function
export async function initializeTreePage() {
    skillsContainer = document.getElementById('skillsContainer');
    classSelect = document.getElementById('classSelect');
    
    if (!skillsContainer || !classSelect) {
        console.error('Required elements not found');
        return;
    }
    
    // Load database immediately when page loads
    try {
        skillsList = await loadSkillsFromSQLite();
        treeInitialized = true;
        
        // Populate class selector from database
        const db = getDatabase();
        const classes = [];
        try {
            const stmt = db.prepare('SELECT name FROM classes WHERE name NOT IN ("Other") ORDER BY name');
            while (stmt.step()) {
                classes.push(stmt.get()[0]);
            }
            stmt.free();
        } catch (error) {
            console.warn('Could not load classes from database, falling back to skill list:', error);
            // Fallback to extracting from skills
            classes.push(...[...new Set(skillsList.map(skill => skill.class))].filter(c => c !== 'Other'));
        }
        
        classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            classSelect.appendChild(opt);
        });
        
    } catch (error) {
        console.error('Error loading database on page initialization:', error);
        // Error will be shown by loadSkillsFromSQLite function
        return;
    }
    
    initializeMenuButtons();
    
    // Set up class change event listener
    if (!classSelect) {
        console.error('classSelect is null when trying to add event listener!');
        return;
    }
    
    classSelect.addEventListener('change', () => {
        const newClass = classSelect.value;
        
        // Reset tab when class changes - will be set to first tab by renderSkills
        currentTab = null;
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
    });
    
    // Set up global event listeners (only once during initialization)
    setupGlobalEventListeners();
}

/**
 * Set up global event listeners that should only be added once
 */
function setupGlobalEventListeners() {
    // Add event listener for skill point changes
    window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
    
    // Add event listener for oSkills changes
    window.addEventListener('oskillsUpdated', () => {
        updateOSkillsDisplay();
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

/**
 * Handle skill points changed event
 * Updates the UI when skill points are added or removed
 */
function handleSkillPointsChanged() {
    const currentClass = classSelect.value;
    const savedTab = currentTab;
    
    // Re-render without redrawing arrows (just update cards)
    renderSkills(currentClass, skillsList, skillsContainer, savedTab, false);
    
    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    
    // Update build list images if we're currently viewing the load section
    updateBuildListImages();
    
    // Trigger tooltip refresh after a small delay to ensure minLevelDisplay is updated
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('tooltipRefresh'));
    }, 10);
}

// Main application entry point
async function main() {
    try {
        // Database should already be loaded during page initialization
        if (!treeInitialized) {
            console.error('Database not initialized. This should not happen.');
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
        initializeCharacter(selectedClass, Character.MAX_LEVEL);

        // Render skills with saved tab if specified
        renderSkills(selectedClass, skillsList, skillsContainer, savedTab);
        
        // Update displays
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        
        
        // Initialize difficulty checkboxes with default values
        const questState = {
            hasNormal: true,
            hasNightmare: true,
            hasHell: true
        };
        renderDifficultyCheckboxes(questState);
        
        // Setup difficulty event listeners
        setupDifficultyEventListeners();
        
        // Force update the checkboxes and level input directly as a fallback
        setTimeout(() => {
            const normalCheckbox = document.getElementById('difficultyNormal');
            const nightmareCheckbox = document.getElementById('difficultyNightmare');
            const hellCheckbox = document.getElementById('difficultyHell');
            if (normalCheckbox) normalCheckbox.checked = true;
            if (nightmareCheckbox) nightmareCheckbox.checked = true;
            if (hellCheckbox) hellCheckbox.checked = true;
            
            // Update displays after setting difficulties
            updateSkillPointsDisplay();
        }, 0);
        
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
    const url = new URL(window.location);
    url.searchParams.set('class', selectedClass);
    if (selectedTab) {
        url.searchParams.set('tab', selectedTab);
    } else {
        url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url);
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
        const db = getDatabase();
        if (db) {
            const skillLevels = getAllSkillPoints();
            const currentDevotion = getCurrentDevotion(skillLevels, db);
            const devotionName = getDevotionDisplayName(currentDevotion);
            
            // Hide field if no devotion selected
            if (currentDevotion === 'none') {
                devotionField.style.display = 'none';
            } else {
                devotionField.style.display = 'flex';
                devotionDisplay.textContent = devotionName;
                
                // Add color based on devotion
                devotionDisplay.className = 'has-text-centered has-text-weight-bold';
                
                // Paladin devotions
                if (currentDevotion === 'holy') {
                    devotionDisplay.classList.add('has-text-warning');
                } else if (currentDevotion === 'neutral') {
                    devotionDisplay.classList.add('has-text-white');
                } else if (currentDevotion === 'unholy') {
                    devotionDisplay.classList.add('has-text-purple');
                }
                // Amazon devotions
                else if (currentDevotion === 'bow') {
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
        }
    } else {
        devotionField.style.display = 'none';
    }
}

// Update minimum level display
function updateMinimumLevelDisplay() {
    const minLevelField = document.getElementById('minLevelField');
    const minLevelDisplay = document.getElementById('minLevelDisplay');
    const minLevelBreakdown = document.getElementById('minLevelBreakdown');
    const minLevelHelp = document.getElementById('minLevelHelp');
    
    if (!minLevelField || !minLevelDisplay || !minLevelBreakdown || !minLevelHelp) return;
    
    const spentPoints = getSpentSkillPoints();
    const db = getDatabase();
    const minLevel = spentPoints > 0 ? getMinimumRequiredLevel(db) : Character.DEFAULT_LEVEL;
    const availableQuestPoints = getTotalQuestSkillPoints(minLevel);
    const availableBasePoints = Character.getBaseSkillPoints(minLevel);
    const totalAvailablePoints = availableBasePoints + availableQuestPoints;
    
    
    minLevelDisplay.textContent = `Level ${minLevel}`;
    
    // Update breakdown with base/quest points
    minLevelBreakdown.textContent = `(Base points: ${availableBasePoints} + Quest points: ${availableQuestPoints})`;
    
    // Update help text with spent/total information only
    minLevelHelp.textContent = `${spentPoints} spent / ${totalAvailablePoints} available`;
}

// Export function to update tab state (called from render module)
export function setCurrentTab(tabName) {
    currentTab = tabName;
    updateUrlState(classSelect.value, tabName);
}

/**
 * Initialize difficulty checkboxes and their event handlers
 */
function initializeDifficultyCheckboxes() {
    // Render the checkboxes
    const questState = getCurrentQuestState();
    renderDifficultyCheckboxes(questState);
    
    // Add event listeners
    setupDifficultyEventListeners();
}

/**
 * Get current quest state for difficulty checkboxes
 * @returns {Object} Quest state with hasNormal, hasNightmare, hasHell
 */
function getCurrentQuestState() {
    const hasNormal = getQuestCompletion('den_of_evil').normal || 
                     getQuestCompletion('radament').normal || 
                     getQuestCompletion('izual').normal;
    
    const hasNightmare = getQuestCompletion('den_of_evil').nightmare || 
                        getQuestCompletion('radament').nightmare || 
                        getQuestCompletion('izual').nightmare;
    
    const hasHell = getQuestCompletion('den_of_evil').hell || 
                   getQuestCompletion('radament').hell || 
                   getQuestCompletion('izual').hell ||
                   getQuestCompletion('inquisitor_of_the_triune').hell;
    
    return { hasNormal, hasNightmare, hasHell };
}

function getAllSkillsBonus() {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    return allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
}

function setAllSkillsBonus(value) {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    if (allSkillsBonusInput) {
        allSkillsBonusInput.value = Math.max(0, parseInt(value) || 0);
    }
}

/**
 * Setup event listeners for difficulty checkboxes
 */
function setupDifficultyEventListeners() {
    const normalCheckbox = document.getElementById('difficultyNormal');
    const nightmareCheckbox = document.getElementById('difficultyNightmare');
    const hellCheckbox = document.getElementById('difficultyHell');
    
    if (!normalCheckbox || !nightmareCheckbox || !hellCheckbox) return;
    
    // Hell checkbox: checking enables nightmare and normal
    hellCheckbox.addEventListener('change', () => {
        if (hellCheckbox.checked) {
            nightmareCheckbox.checked = true;
            normalCheckbox.checked = true;
        }
        updateQuestsFromDifficulty();
    });
    
    // Nightmare checkbox: checking enables normal, unchecking disables hell
    nightmareCheckbox.addEventListener('change', () => {
        if (nightmareCheckbox.checked) {
            normalCheckbox.checked = true;
        } else {
            hellCheckbox.checked = false;
        }
        updateQuestsFromDifficulty();
    });
    
    // Normal checkbox: unchecking disables nightmare and hell
    normalCheckbox.addEventListener('change', () => {
        if (!normalCheckbox.checked) {
            nightmareCheckbox.checked = false;
            hellCheckbox.checked = false;
        }
        updateQuestsFromDifficulty();
    });
}

/**
 * Update quest completion based on difficulty selection
 */
function updateQuestsFromDifficulty() {
    const normalCheckbox = document.getElementById('difficultyNormal');
    const nightmareCheckbox = document.getElementById('difficultyNightmare');
    const hellCheckbox = document.getElementById('difficultyHell');
    
    if (!normalCheckbox || !nightmareCheckbox || !hellCheckbox) return;
    
    // Update each quest based on difficulty selection
    updateQuestCompletion('den_of_evil', {
        normal: normalCheckbox.checked,
        nightmare: nightmareCheckbox.checked,
        hell: hellCheckbox.checked
    });
    
    updateQuestCompletion('radament', {
        normal: normalCheckbox.checked,
        nightmare: nightmareCheckbox.checked,
        hell: hellCheckbox.checked
    });
    
    updateQuestCompletion('izual', {
        normal: normalCheckbox.checked,
        nightmare: nightmareCheckbox.checked,
        hell: hellCheckbox.checked
    });
    
    updateQuestCompletion('inquisitor_of_the_triune', {
        normal: false, // This quest only has hell difficulty
        nightmare: false,
        hell: hellCheckbox.checked
    });
    
    // Trigger skill points update
    window.dispatchEvent(new CustomEvent('skillPointsChanged'));
}


// Initialize menu buttons functionality
function initializeMenuButtons() {
    // Menu: New Build button
    const newBuildBtn = document.getElementById('menuNewBuildBtn');
    if (newBuildBtn) {
        newBuildBtn.addEventListener('click', async () => {
            showSection('tree');
            
            // Database should already be loaded, just reset to new build
            if (!treeInitialized) {
                console.error('Database not initialized. Cannot create new build.');
                return;
            }
            
            // Clear current build index for new build
            currentBuildIndex = null;
            await main();
            updateSaveButtonVisibility();
        });
    }
    
    // Menu: Load Build button
    const loadBuildBtn = document.getElementById('menuLoadBuildBtn');
    if (loadBuildBtn) {
        loadBuildBtn.addEventListener('click', async () => {
            // Initialize tree if not yet done (needed for loading builds)
            if (!treeInitialized) {
                await main();
            }
            
            showSection('load');
        });
    }
    
    // Menu: Import Build button
    const importBuildBtn = document.getElementById('menuImportBuildBtn');
    if (importBuildBtn) {
        importBuildBtn.addEventListener('click', async () => {
            // Initialize tree if not yet done (needed for importing builds)
            if (!treeInitialized) {
                await main();
            }
            
            promptAndImportBuild();
        });
    }
    
    // Back to Menu buttons
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            // Clear any visible toasts
            toastManager.cleanUpToastMessages();
            // Clear URL params
            window.history.replaceState({}, '', window.location.pathname);
            showSection('menu');
        });
    }

    // Reset Build button
    const resetBtn = document.getElementById('resetBuildBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset this build? All skill points will be lost.')) {
                resetBuild();
            }
        });
    }
    
    // Save Build button (updates current build)
    const saveBuildBtn = document.getElementById('saveBuildBtn');
    if (saveBuildBtn) {
        saveBuildBtn.addEventListener('click', () => {
            // Validate build before saving
            if (!validateBuildBeforeSave()) {
                return;
            }
            
            if (currentBuildIndex !== null) {
                updateCurrentBuild();
            }
        });
    }
    
    // Save As Build button (creates new build)
    const saveAsBuildBtn = document.getElementById('saveAsBuildBtn');
    if (saveAsBuildBtn) {
        saveAsBuildBtn.addEventListener('click', () => {
            promptAndSaveBuild();
        });
    }
    
    // Back to Menu from Load section
    const backToMenuFromLoadBtn = document.getElementById('backToMenuFromLoadBtn');
    if (backToMenuFromLoadBtn) {
        backToMenuFromLoadBtn.addEventListener('click', () => {
            // Clear URL params
            window.history.replaceState({}, '', window.location.pathname);
            showSection('menu');
        });
    }
}

// Show/hide sections
function showSection(sectionName) {
    const menuSection = document.getElementById('menu-section');
    const treeSection = document.getElementById('tree-section');
    const loadSection = document.getElementById('load-section');
    const defaultsSection = document.getElementById('defaults-section');
    
    if (menuSection) menuSection.style.display = 'none';
    if (treeSection) treeSection.style.display = 'none';
    if (loadSection) loadSection.style.display = 'none';
    if (defaultsSection) defaultsSection.style.display = 'none';
    
    if (sectionName === 'menu' && menuSection) {
        menuSection.style.display = 'block';
    } else if (sectionName === 'tree' && treeSection) {
        treeSection.style.display = 'block';
    } else if (sectionName === 'load' && loadSection) {
        loadSection.style.display = 'block';
        renderSavedBuildsList();
    } else if (sectionName === 'defaults' && defaultsSection) {
        defaultsSection.style.display = 'block';
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
    initializeCharacter(currentClass, Character.MAX_LEVEL);
    
    // Re-render skills for the first class (this creates the difficulty checkboxes)
    if (currentClass && skillsList) {
        renderSkills(currentClass, skillsList, skillsContainer);
    }
    
    // Re-render difficulty checkboxes AFTER renderSkills so they exist
    const questState = {
        hasNormal: true,
        hasNightmare: true,
        hasHell: true
    };
    renderDifficultyCheckboxes(questState);
    
    // Force update the checkboxes directly as a fallback
    setTimeout(() => {
        const normalCheckbox = document.getElementById('difficultyNormal');
        const nightmareCheckbox = document.getElementById('difficultyNightmare');
        const hellCheckbox = document.getElementById('difficultyHell');
        
        if (normalCheckbox) normalCheckbox.checked = true;
        if (nightmareCheckbox) nightmareCheckbox.checked = true;
        if (hellCheckbox) hellCheckbox.checked = true;
    }, 0);
    
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
            // Parse build version
            const buildVersion = parseVersionString(buildData.version);
            
            // Show toast message explaining version switch
            toastManager.showToast(
                `Build was saved for game version ${buildData.version}. Switching to version ${buildData.version} for compatibility.`,
                false,
                'warning'
            );
            
            // Switch to the build's version
            setCurrentVersion(buildVersion);
            
            // Silently reload database and load build
            reloadDatabaseAndLoadBuild(buildData, null);
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
    const skillPoints = getAllSkillPoints();
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
        savedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem('medianxl-builds', JSON.stringify(builds));
    
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
        savedAt: new Date().toISOString()
    };
    
    
    // Get existing builds
    const builds = getSavedBuilds();
    
    // Add new build
    builds.push(build);
    
    // Save to localStorage
    localStorage.setItem('medianxl-builds', JSON.stringify(builds));
    
    // Set current build index to the newly saved build
    currentBuildIndex = builds.length - 1;
    updateSaveButtonVisibility();
    
    toastManager.showToast(`Build "${buildName}" saved successfully!`, true, 'info');
}

function getSavedBuilds() {
    const stored = localStorage.getItem('medianxl-builds');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing saved builds:', e);
            return [];
        }
    }
    return [];
}

function renderSavedBuildsList() {
    const container = document.getElementById('saved-builds-list');
    if (!container) return;
    
    // Ensure character is initialized before rendering build list
    const characterInstance = getCharacterInstance();
    if (!characterInstance) {
        // Initialize with a default class if none is selected
        const defaultClass = classSelect ? classSelect.value : 'Amazon';
        initializeCharacter(defaultClass, Character.MAX_LEVEL);
    }
    
    const builds = getSavedBuilds();
    
    if (builds.length === 0) {
        container.innerHTML = '<p class="has-text-grey-light">No saved builds found</p>';
        return;
    }
    
    container.innerHTML = '';
    
    builds.forEach((build, index) => {
        const buildCard = document.createElement('div');
        buildCard.className = 'box mb-3';
        
        // Create structure safely
        const columns = document.createElement('div');
        columns.className = 'columns is-vcentered';
        
        // Add class image column
        const imageColumn = document.createElement('div');
        imageColumn.className = 'column is-narrow py-0';
        
        const classImage = document.createElement('img');
        
        // Calculate armor image number based on spent skill points (maps to 1-10.gif)
        const armorImageNumber = calculateArmorImageNumber(build.spentPoints);
        classImage.src = `icons/portraits/${build.class}/${armorImageNumber}.gif`;
        classImage.alt = build.class;
        classImage.className = 'image is-64x64';
        classImage.style.objectFit = 'contain';
        
        imageColumn.appendChild(classImage);
        
        const infoColumn = document.createElement('div');
        infoColumn.className = 'column p-0';
        
        const title = document.createElement('p');
        title.className = 'title is-4 has-text-weight-bold mb-2';
        title.textContent = build.name;
        
        const subtitle = document.createElement('p');
        subtitle.className = 'subtitle is-6 mb-1';
        subtitle.innerHTML = `
            <span class="tag has-text-info">Level ${build.level} ${build.class}</span>
            <span class="tag">${build.spentPoints} points spent</span>
            <span class="tag">v${build.version || 'unknown'}</span>
        `;
        
        infoColumn.appendChild(title);
        infoColumn.appendChild(subtitle);
        
        const buttonsColumn = document.createElement('div');
        buttonsColumn.className = 'column is-narrow';
        buttonsColumn.innerHTML = `
            <div class="buttons">
                <button class="button is-primary is-outlined" data-load-build="${index}">
                    Load
                </button>
                <button class="button is-success is-outlined" data-export-build="${index}">
                    Export
                </button>
                <button class="button is-info is-outlined" data-rename-build="${index}">
                    Rename
                </button>
                <button class="button is-danger is-outlined" data-delete-build="${index}">
                    Delete
                </button>
            </div>
        `;
        
        columns.appendChild(imageColumn);
        columns.appendChild(infoColumn);
        columns.appendChild(buttonsColumn);
        buildCard.appendChild(columns);
        container.appendChild(buildCard);
    });
    
    // Add event listeners
    container.querySelectorAll('[data-load-build]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-load-build'));
            loadBuild(index);
        });
    });
    
    container.querySelectorAll('[data-export-build]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-export-build'));
            exportBuild(index);
        });
    });
    
    container.querySelectorAll('[data-rename-build]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-rename-build'));
            renameBuild(index);
        });
    });
    
    container.querySelectorAll('[data-delete-build]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-delete-build'));
            deleteBuild(index);
        });
    });
}

/**
 * Export build as raw JSON text
 * @param {number} index - The index of the build to export
 */
function exportBuild(index) {
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

function loadBuild(index) {
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
        // Parse build version
        const buildVersion = parseVersionString(build.version);
        
        // Show toast message explaining version switch
        toastManager.showToast(
            `Build was saved for game version ${build.version}. Switching to version ${build.version} for compatibility.`,
            false,
            'warning'
        );
        
        // Switch to the build's version
        setCurrentVersion(buildVersion);
        
        // Silently reload database and load build
        reloadDatabaseAndLoadBuild(build, index);
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

function deleteBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        return;
    }
    
    const buildName = builds[index].name;
    
    if (confirm(`Delete build "${buildName}"?`)) {
        builds.splice(index, 1);
        localStorage.setItem('medianxl-builds', JSON.stringify(builds));
        
        // If we deleted the currently loaded build, clear the index
        if (currentBuildIndex === index) {
            currentBuildIndex = null;
            updateSaveButtonVisibility();
        } else if (currentBuildIndex !== null && currentBuildIndex > index) {
            // Adjust index if we deleted a build before the current one
            currentBuildIndex--;
        }
        
        renderSavedBuildsList();
        toastManager.showToast(`Build "${buildName}" deleted.`, true, 'info');
    }
}

function renameBuild(index) {
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
    localStorage.setItem('medianxl-builds', JSON.stringify(builds));
    
    // Re-render the list to show the new name
    renderSavedBuildsList();
    
    toastManager.showToast(`Build renamed to "${trimmedName}"!`, true, 'info');
}

// oSkills Management
function initializeOSkillsDropdown() {
    const db = getDatabase();
    if (!db) return;
    
    // Initialize sidebar dropdown only
    const sidebarDropdownContainer = document.getElementById('oskill-dropdown');
    const sidebarHiddenInput = document.getElementById('oskill-hidden');
    
    // Always re-initialize the dropdown to ensure event handlers are properly attached
    // Clear any existing dropdown first
    if (sidebarDropdownContainer) {
        sidebarDropdownContainer.innerHTML = '';
    }
    
    
    // Get all skills for dropdown
    const res = db.exec(`
        SELECT s.id, s.name, s.display_name, s.image, c.name as class_name, s.description, s.skill_effect
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        ORDER BY c.name, s.display_name
    `);
    
    const skillItems = res[0] ? res[0].values.map(([id, name, displayName, image, className, description, skillEffect]) => ({
        value: id,
        name: displayName,
        skillName: name,
        image: image,
        className: className,
        desc: `${className || 'No Class'}`,
        hasDetails: (description && description.trim().length > 0) || (skillEffect && skillEffect.trim().length > 0),
        description: description,
        skillEffect: skillEffect
    })) : [];
    
    // Initialize sidebar dropdown
    if (sidebarDropdownContainer && sidebarHiddenInput) {
        const sidebarDropdown = new DropdownList(sidebarDropdownContainer, {
            placeholder: 'Select skill...',
            emptyListText: 'No skills found',
            defaultHeaderText: 'All Skills',
            onSelect: (item) => {
                if (item) {
                    addOSkill(item.value, item.name, item.skillName, item.image, item.className, item.hasDetails, item.description, item.skillEffect);
                    sidebarDropdown.value = null;
                }
            }
        });
        sidebarDropdown.setItems(skillItems);
        
        // Store reference for later access
        window.oskillDropdownInstance = sidebarDropdown;
    }
}

// oSkills management is now handled by character-state.js
// These are just thin wrappers for backwards compatibility

function handleOSkillPointChange(skillName, amount) {
    changeOSkillPoints(skillName, amount);
}

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

// Flag to prevent dropdown recreation during rendering
let isRenderingSkills = false;

function updateOSkillsTab() {
    const container = document.getElementById('tab-oSkills');
    if (!container) {
        return;
    }
    
    
    // Clear container and hide any active tooltips for removed skills
    container.innerHTML = '';
    
    // Force hide any active tooltips immediately
    const tooltipElement = document.querySelector('.skill-tooltip');
    if (tooltipElement && tooltipElement.style.display !== 'none') {
        tooltipElement.style.display = 'none';
    }
    
    const oSkills = getAllOSkills();
    
    const oSkillsCount = Array.isArray(oSkills) ? oSkills.length : Object.keys(oSkills).length;
    if (oSkillsCount === 0) {
        return;
    }
    
    // Calculate grid size based on number of skills
    const cols = 3; // 3 skills per row
    const rows = Math.ceil(oSkillsCount / cols);
    
    container.style.gridTemplateRows = `repeat(${rows}, auto)`;
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    // Render each oSkill as a card
    let index = 0;
    if (Array.isArray(oSkills)) {
        // Old format: array of objects
        oSkills.forEach((oskill) => {
        const row = Math.floor(index / cols) + 1;
        const col = (index % cols) + 1;
        
        const card = createOSkillCard(oskill);
        card.style.gridArea = `${row} / ${col}`;
        container.appendChild(card);
            index++;
        });
    } else {
        // New format: object with skill IDs as keys
        Object.entries(oSkills).forEach(([skillIdOrName, points]) => {
            if (points > 0) {
                const row = Math.floor(index / cols) + 1;
                const col = (index % cols) + 1;
                
                // Create a simplified oSkill object for rendering
                const oskill = { 
                    skillId: /^\d+$/.test(skillIdOrName) ? parseInt(skillIdOrName) : null,
                    skillName: /^\d+$/.test(skillIdOrName) ? null : skillIdOrName,
                    points 
                };
                const card = createOSkillCard(oskill);
                card.style.gridArea = `${row} / ${col}`;
                container.appendChild(card);
                index++;
            }
        });
    }
}

function createOSkillCard(oskill) {
    // If we have full oSkill data (old format), use it directly
    // Otherwise, look up the skill data from the database
    let skillData = oskill;
    
    if (!oskill.displayName && !oskill.image) {
        // New format: have skillId or skillName and points, need to look up skill data
        const db = getDatabase();
        if (db) {
            try {
                let stmt;
                if (oskill.skillId) {
                    // Look up by skill ID
                    stmt = db.prepare('SELECT * FROM skills WHERE id = ?');
                    stmt.bind([oskill.skillId]);
                } else if (oskill.skillName) {
                    // Look up by skill name (backward compatibility)
                    stmt = db.prepare('SELECT * FROM skills WHERE name = ?');
                    stmt.bind([oskill.skillName]);
                } else {
                    throw new Error('No skillId or skillName provided');
                }
                
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    skillData = {
                        skillId: oskill.skillId,
                        skillName: oskill.skillName || row.name,
                        points: oskill.points,
                        displayName: row.display_name || row.name,
                        image: row.image || 'icons-shared_missing.png',
                        className: 'Other',
                        hasDetails: true,
                        description: row.description
                    };
                }
                stmt.free();
            } catch (error) {
                console.warn('Could not look up oSkill data for:', oskill.skillId || oskill.skillName);
                // Fallback to basic data
                skillData = {
                    skillId: oskill.skillId,
                    skillName: oskill.skillName,
                    points: oskill.points,
                    displayName: oskill.skillName || `Skill ${oskill.skillId}`,
                    image: 'icons-shared_missing.png',
                    className: 'Other',
                    hasDetails: false
                };
            }
        }
    }
    
    // Check if oSkill has description data
    const hasDescription = skillData.hasDetails || skillData.description || false;
    
    // Prepare card data
    const cardData = {
        skillId: skillData.skillId || skillData.skillName, // Use skill ID if available, otherwise skill name
        iconHTML: getSkillIcon(skillData.image, skillData.className),
        displayName: skillData.displayName,
        hasDescription: hasDescription,
        currentPoints: skillData.points,
        maxPoints: 150,
        levelColor: skillData.points >= 150 ? 'has-text-warning' : 'has-text-grey',
        buttons: {
            show: true,
            plusDisabled: skillData.points >= 150, // Disable plus button at 150
            minusDisabled: skillData.points === 0,
            plusTooltip: skillData.points >= 150 ? 'Maximum level reached (150)' : '',
            dataSkill: skillData.skillId || skillData.skillName // Use skill ID if available, otherwise skill name
        }
    };
    
    // Render card using shared renderer
    const card = renderSkillCard(cardData);
    
    // Add oSkill-specific event listeners
    const plusBtn = card.querySelector('.skill-plus-btn');
    const minusBtn = card.querySelector('.skill-minus-btn');
    
    if (plusBtn) {
        plusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const skillIdentifier = oskill.skillId || oskill.skillName;
            if (e.shiftKey) {
                // Shift-click: add 25 points
                handleOSkillPointChange(skillIdentifier, 25);
            } else if (e.ctrlKey) {
                // Ctrl-click: add 5 points
                handleOSkillPointChange(skillIdentifier, 5);
            } else {
                // Normal click: add 1 point
                handleOSkillPointChange(skillIdentifier, 1);
            }
        });
    }
    
    if (minusBtn) {
        minusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const skillIdentifier = oskill.skillId || oskill.skillName;
            if (e.shiftKey) {
                // Shift-click: remove 25 points
                handleOSkillPointChange(skillIdentifier, -25);
            } else if (e.ctrlKey) {
                // Ctrl-click: remove 5 points
                handleOSkillPointChange(skillIdentifier, -5);
            } else {
                // Normal click: remove 1 point
                handleOSkillPointChange(skillIdentifier, -1);
            }
        });
    }
    
    return card;
}
