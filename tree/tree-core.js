// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite, getDatabase } from './tree-data.js';
import { renderSkills, renderDifficultyCheckboxes, updateTabColors } from './tree-render.js';
import { CHARACTER_CONFIG } from '../character-config.js';
import { initializeCharacter, setCharacterLevel, getSpentSkillPoints, getAllSkillPoints, setAllSkillPoints, updateQuestCompletion, getQuestCompletion, getAllOSkills, addOSkill, changeOSkillPoints, clearOSkills, setAllOSkills, getMinimumRequiredLevel, getTotalQuestSkillPoints, getBaseSkillPoints } from '../character-state.js';
import { getCurrentDevotion, getDevotionDisplayName } from '../skill-calculations.js';
import { initializeTooltip } from './tree-tooltip.js';
import { ToastManager } from './ToastManager.js';
import { DropdownList } from '../edit/DropdownList.js';
import { renderSkillCard, getSkillIcon } from './tree-card-renderer.js';
import { getCurrentVersion, versionToString } from '../version-config.js';

// Global variables
let skillsList;
let skillsContainer;
let classSelect;
let currentTab = null;
let treeInitialized = false; // Track if tree has been initialized
let currentBuildIndex = null; // Track currently loaded build index for saving
let oSkillsDropdown = null; // Dropdown for oSkills

// Initialize ToastManager
const toastManager = new ToastManager();

// Export function to get oSkill points (for tooltip) - now just re-exports from character-state
export { getOSkillPoints } from '../character-state.js';

// Main initialization function
export function initializeTreePage() {
    skillsContainer = document.getElementById('skillsContainer');
    classSelect = document.getElementById('classSelect');
    
    if (!skillsContainer || !classSelect) {
        console.error('Required elements not found');
        return;
    }
    
    initializeMenuButtons();
    initializeDefaults();
}

// Main application entry point
async function main() {
    // Prevent multiple initializations
    if (treeInitialized) {
        return;
    }
    
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

        // Get state from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const savedClass = urlParams.get('class');
        const savedTab = urlParams.get('tab');
        
        // Use saved class or default to first class
        const selectedClass = savedClass && classes.includes(savedClass) ? savedClass : classes[0];
        classSelect.value = selectedClass;

        // Apply default settings
        const defaults = getDefaultSettings();

        // Initialize character state
        initializeCharacter(selectedClass);
        
        // Apply difficulty defaults
        updateQuestCompletion('den_of_evil', defaults.difficulties);
        updateQuestCompletion('radament', defaults.difficulties);
        updateQuestCompletion('izual', defaults.difficulties);
        updateQuestCompletion('inquisitor_of_the_triune', { normal: false, nightmare: false, hell: defaults.difficulties.hell });

        // Render skills with saved tab if specified
        renderSkills(selectedClass, skillsList, skillsContainer, savedTab);
        
        // Update displays
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        
        
        // Initialize difficulty checkboxes with default values
        const questState = {
            hasNormal: defaults.difficulties.normal,
            hasNightmare: defaults.difficulties.nightmare,
            hasHell: defaults.difficulties.hell
        };
        renderDifficultyCheckboxes(questState);
        
        // Setup difficulty event listeners
        setupDifficultyEventListeners();
        
        // Force update the checkboxes and level input directly as a fallback
        setTimeout(() => {
            const normalCheckbox = document.getElementById('difficultyNormal');
            const nightmareCheckbox = document.getElementById('difficultyNightmare');
            const hellCheckbox = document.getElementById('difficultyHell');
            if (normalCheckbox) normalCheckbox.checked = defaults.difficulties.normal;
            if (nightmareCheckbox) nightmareCheckbox.checked = defaults.difficulties.nightmare;
            if (hellCheckbox) hellCheckbox.checked = defaults.difficulties.hell;
            
            // Update displays after setting difficulties
            updateSkillPointsDisplay();
        }, 0);
        
        // Initialize level input
        
        // Initialize tooltip functionality
        initializeTooltip();
        
        // Initialize oSkills dropdown
        initializeOSkillsDropdown();
        
        // Update URL if we have a saved tab
        if (savedTab) {
            updateUrlState(selectedClass, savedTab);
        }
        
        // Add event listener for class changes
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
            
            // Reinitialize character state for new class
            initializeCharacter(newClass);
            
            renderSkills(newClass, skillsList, skillsContainer);
            
            // Update displays
            updateSkillPointsDisplay();
            updateDevotionDisplay();
            updateOSkillsDisplay();
        });
        
        
        // Add event listener for skill point changes
        window.addEventListener('skillPointsChanged', () => {
            const currentClass = classSelect.value;
            const savedTab = currentTab;
            
            // Re-render without redrawing arrows (just update cards)
            renderSkills(currentClass, skillsList, skillsContainer, savedTab, false);
            
            // Update displays
            updateSkillPointsDisplay();
            updateDevotionDisplay();
        });
        
        // Add event listener for oSkills changes
        window.addEventListener('oskillsUpdated', () => {
            updateOSkillsDisplay();
        });
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
                devotionField.style.display = 'block';
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
    const minLevel = spentPoints > 0 ? getMinimumRequiredLevel(db) : CHARACTER_CONFIG.DEFAULT_LEVEL;
    const availableQuestPoints = getTotalQuestSkillPoints(minLevel);
    const availableBasePoints = getBaseSkillPoints(minLevel);
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
            
            // Initialize tree if not yet done
            if (!treeInitialized) {
                // Clear current build index for new build
                currentBuildIndex = null;
                await main();
                updateSaveButtonVisibility();
            } else {
                // Reset to new build with defaults (no toast from menu)
                resetBuild(false);
            }
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
    
    // Menu: Edit Defaults button
    const editDefaultsBtn = document.getElementById('menuEditDefaultsBtn');
    if (editDefaultsBtn) {
        editDefaultsBtn.addEventListener('click', () => {
            showSection('defaults');
        });
    }
    
    // Back to Menu buttons
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            // Clear URL params
            window.history.replaceState({}, '', window.location.pathname);
            showSection('menu');
        });
    }
    
    const backToMenuFromDefaultsBtn = document.getElementById('backToMenuFromDefaultsBtn');
    if (backToMenuFromDefaultsBtn) {
        backToMenuFromDefaultsBtn.addEventListener('click', () => {
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
        loadDefaults(); // Populate form when showing defaults section
    }
}

// Initialize defaults functionality
function initializeDefaults() {
    // Load defaults only populates the form, doesn't need to be called here
    // The form will be populated when user opens the defaults section
    
    
    // Save defaults button
    const saveBtn = document.getElementById('saveDefaultsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveDefaults();
            toastManager.showToast('Defaults saved successfully!', true, 'success');
        });
    }
    
    // Reset defaults button
    const resetBtn = document.getElementById('resetDefaultsBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset to default values?')) {
                resetDefaults();
            }
        });
    }
}

// Load defaults from localStorage
function loadDefaults() {
    const defaults = getDefaultSettings();
    
    // Populate defaults form
    document.getElementById('normalCompleted').checked = defaults.difficulties.normal;
    document.getElementById('nightmareCompleted').checked = defaults.difficulties.nightmare;
    document.getElementById('hellCompleted').checked = defaults.difficulties.hell;
}

// Save defaults to localStorage
function saveDefaults() {
    const defaults = {
        difficulties: {
            normal: document.getElementById('normalCompleted').checked,
            nightmare: document.getElementById('nightmareCompleted').checked,
            hell: document.getElementById('hellCompleted').checked
        }
    };
    
    localStorage.setItem('medianxl-defaults', JSON.stringify(defaults));
}

// Get default settings (from localStorage or defaults)
function getDefaultSettings() {
    const stored = localStorage.getItem('medianxl-defaults');
    
    let defaults;
    if (stored) {
        try {
            defaults = JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing defaults:', e);
            defaults = {
                difficulties: {
                    normal: true,
                    nightmare: true,
                    hell: true
                }
            };
        }
    } else {
        // Return default values
        defaults = {
            difficulties: {
                normal: true,
                nightmare: true,
                hell: true
            }
        };
    }
    
    return defaults;
}

// Reset defaults to system defaults
function resetDefaults() {
    localStorage.removeItem('medianxl-defaults');
    loadDefaults();
    toastManager.showToast('Defaults reset successfully!', true, 'info');
}

// Reset current build
function resetBuild(showToast = true) {
    // Get defaults first
    const defaults = getDefaultSettings();
    
    
    // Reset to first class
    if (classSelect && skillsList) {
        const classes = [...new Set(skillsList.map(skill => skill.class))];
        if (classes.length > 0) {
            classSelect.value = classes[0];
        }
    }
    
    // Clear all skill points
    const currentClass = classSelect ? classSelect.value : null;
    initializeCharacter(currentClass);
    
    // Update difficulties
    updateQuestCompletion('den_of_evil', defaults.difficulties);
    updateQuestCompletion('radament', defaults.difficulties);
    updateQuestCompletion('izual', defaults.difficulties);
    updateQuestCompletion('inquisitor_of_the_triune', { normal: false, nightmare: false, hell: defaults.difficulties.hell });
    
    // Re-render skills for the first class (this creates the difficulty checkboxes)
    if (currentClass && skillsList) {
        renderSkills(currentClass, skillsList, skillsContainer);
    }
    
    // Re-render difficulty checkboxes AFTER renderSkills so they exist
    const questState = {
        hasNormal: defaults.difficulties.normal,
        hasNightmare: defaults.difficulties.nightmare,
        hasHell: defaults.difficulties.hell
    };
    renderDifficultyCheckboxes(questState);
    
    // Force update the checkboxes directly as a fallback
    setTimeout(() => {
        const normalCheckbox = document.getElementById('difficultyNormal');
        const nightmareCheckbox = document.getElementById('difficultyNightmare');
        const hellCheckbox = document.getElementById('difficultyHell');
        
        if (normalCheckbox) normalCheckbox.checked = defaults.difficulties.normal;
        if (nightmareCheckbox) nightmareCheckbox.checked = defaults.difficulties.nightmare;
        if (hellCheckbox) hellCheckbox.checked = defaults.difficulties.hell;
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
        toastManager.showToast('Build reset successfully!', true, 'success');
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

function promptAndSaveBuild() {
    const buildName = prompt('Enter a name for this build:');
    if (!buildName || buildName.trim() === '') {
        return;
    }
    
    saveBuild(buildName.trim());
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
    
    // Get quest completions
    const difficulties = {
        normal: getQuestCompletion('den_of_evil').normal || false,
        nightmare: getQuestCompletion('den_of_evil').nightmare || false,
        hell: getQuestCompletion('den_of_evil').hell || false
    };
    
    // Update existing build
    builds[currentBuildIndex] = {
        name: builds[currentBuildIndex].name, // Keep original name
        version: versionToString(getCurrentVersion()),
        class: currentClass,
        level: currentLevel,
        spentPoints: spentPoints,
        skillPoints: skillPoints,
        difficulties: difficulties,
        oSkills: getAllOSkills(), // Save oSkills
        savedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem('medianxl-builds', JSON.stringify(builds));
    
    toastManager.showToast(`Build "${builds[currentBuildIndex].name}" updated!`, true, 'success');
}

function saveBuild(buildName) {
    const currentClass = classSelect ? classSelect.value : null;
    const currentLevel = getMinimumRequiredLevel();
    const skillPoints = getAllSkillPoints();
    const spentPoints = getSpentSkillPoints();
    
    // Get quest completions
    const difficulties = {
        normal: getQuestCompletion('den_of_evil').normal || false,
        nightmare: getQuestCompletion('den_of_evil').nightmare || false,
        hell: getQuestCompletion('den_of_evil').hell || false
    };
    
    const build = {
        name: buildName,
        version: versionToString(getCurrentVersion()),
        class: currentClass,
        level: currentLevel,
        spentPoints: spentPoints,
        skillPoints: skillPoints,
        difficulties: difficulties,
        oSkills: getAllOSkills(), // Save oSkills
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
    
    toastManager.showToast(`Build "${buildName}" saved successfully!`, true, 'success');
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
        
        const infoColumn = document.createElement('div');
        infoColumn.className = 'column py-0';
        
        const title = document.createElement('p');
        title.className = 'title is-4 has-text-weight-bold mb-2';
        title.textContent = build.name; // Safe: uses textContent
        
        const subtitle = document.createElement('p');
        subtitle.className = 'subtitle is-6 mb-1';
        subtitle.innerHTML = `
            <span class="tag has-text-info">Level ${build.level} ${build.class}</span>
            <span class="tag">${build.spentPoints} points spent</span>
            <span class="tag">v${build.version}</span>
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
                <button class="button is-danger is-outlined" data-delete-build="${index}">
                    Delete
                </button>
            </div>
        `;
        
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
    
    container.querySelectorAll('[data-delete-build]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-delete-build'));
            deleteBuild(index);
        });
    });
}

function loadBuild(index) {
    const builds = getSavedBuilds();
    if (index < 0 || index >= builds.length) {
        toastManager.showToast('Build not found!', true, 'danger');
        return;
    }
    
    const build = builds[index];
    
    // Set class
    if (classSelect) {
        classSelect.value = build.class;
    }
    
    // Set level
    setCharacterLevel(build.level);
    
    // Initialize character with loaded class and level
    initializeCharacter(build.class);
    
    // Load skill points
    setAllSkillPoints(build.skillPoints);
    
    // Load oSkills
    setAllOSkills(build.oSkills || []);
    window.oSkills = getAllOSkills(); // Update window reference
    // Don't call updateOSkillsDisplay here - it will be called after renderSkills
    
    // Load difficulties
    updateQuestCompletion('den_of_evil', build.difficulties);
    updateQuestCompletion('radament', build.difficulties);
    updateQuestCompletion('izual', build.difficulties);
    updateQuestCompletion('inquisitor_of_the_triune', { normal: false, nightmare: false, hell: build.difficulties.hell });
    
    // Render skills first (this creates the difficulty checkboxes)
    if (skillsList) {
        // If build has oSkills, switch to oSkills tab after rendering
        const hasOSkills = build.oSkills && build.oSkills.length > 0;
        renderSkills(build.class, skillsList, skillsContainer, hasOSkills ? 'oSkills' : null);
    }
    
    // Re-render difficulty checkboxes AFTER renderSkills so they exist
    const questState = {
        hasNormal: build.difficulties.normal,
        hasNightmare: build.difficulties.nightmare,
        hasHell: build.difficulties.hell
    };
    renderDifficultyCheckboxes(questState);
    
    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    
    // Update oSkills display after everything is rendered
    updateOSkillsDisplay();
    
    // Set current build index so "Save" button works
    currentBuildIndex = index;
    updateSaveButtonVisibility();
    
    // Show tree section
    showSection('tree');
    
    toastManager.showToast(`Build "${build.name}" loaded successfully!`, true, 'success');
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


// oSkills Management
function initializeOSkillsDropdown() {
    const db = getDatabase();
    if (!db) return;
    
    // Initialize sidebar dropdown only
    const sidebarDropdownContainer = document.getElementById('oskill-dropdown');
    const sidebarHiddenInput = document.getElementById('oskill-hidden');
    
    // Check if dropdown already exists
    if (sidebarDropdownContainer && sidebarDropdownContainer.querySelector('.dropdown-list-container')) {
        return;
    }
    
    
    // Get all skills for dropdown
    const res = db.exec(`
        SELECT s.id, s.name, s.display_name, s.image, c.name as class_name
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        ORDER BY c.name, s.display_name
    `);
    
    const skillItems = res[0] ? res[0].values.map(([id, name, displayName, image, className]) => ({
        value: id,
        name: displayName,
        skillName: name,
        image: image,
        className: className,
        desc: `${className || 'No Class'}`
    })) : [];
    
    // Initialize sidebar dropdown
    if (sidebarDropdownContainer && sidebarHiddenInput) {
        const sidebarDropdown = new DropdownList(sidebarDropdownContainer, {
            placeholder: 'Select skill...',
            emptyListText: 'No skills found',
            defaultHeaderText: 'All Skills',
            onSelect: (item) => {
                if (item) {
                    addOSkill(item.value, item.name, item.skillName, item.image, item.className);
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
    if (window.oSkills && window.oSkills.length > 0) {
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
    if (oSkills.length === 0) {
        return;
    }
    
    // Calculate grid size based on number of skills
    const cols = 3; // 3 skills per row
    const rows = Math.ceil(oSkills.length / cols);
    
    container.style.gridTemplateRows = `repeat(${rows}, auto)`;
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    // Render each oSkill as a card
    oSkills.forEach((oskill, index) => {
        const row = Math.floor(index / cols) + 1;
        const col = (index % cols) + 1;
        
        const card = createOSkillCard(oskill);
        card.style.gridArea = `${row} / ${col}`;
        container.appendChild(card);
    });
}

function createOSkillCard(oskill) {
    // Prepare card data
    const cardData = {
        skillId: oskill.skillName,
        iconHTML: getSkillIcon(oskill.image, oskill.className),
        displayName: oskill.displayName,
        hasDescription: false, // oSkills don't have detail pages
        currentPoints: oskill.points,
        maxPoints: '∞',
        levelColor: 'has-text-info',
        buttons: {
            show: true,
            plusDisabled: false, // oSkills never disable plus button
            minusDisabled: oskill.points === 0,
            plusTooltip: '',
            dataSkill: oskill.skillName
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
            if (e.shiftKey) {
                // Shift-click: add 25 points
                handleOSkillPointChange(oskill.skillName, 25);
            } else if (e.ctrlKey) {
                // Ctrl-click: add 5 points
                handleOSkillPointChange(oskill.skillName, 5);
            } else {
                // Normal click: add 1 point
                handleOSkillPointChange(oskill.skillName, 1);
            }
        });
    }
    
    if (minusBtn) {
        minusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                // Shift-click: remove 25 points
                handleOSkillPointChange(oskill.skillName, -25);
            } else if (e.ctrlKey) {
                // Ctrl-click: remove 5 points
                handleOSkillPointChange(oskill.skillName, -5);
            } else {
                // Normal click: remove 1 point
                handleOSkillPointChange(oskill.skillName, -1);
            }
        });
    }
    
    return card;
}
