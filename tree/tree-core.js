// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite, getDatabase } from './tree-data.js';
import { renderSkills, renderDifficultyCheckboxes } from './tree-render.js';
import { CHARACTER_CONFIG, clampCharacterLevel } from '../character-config.js';
import { initializeCharacter, setCharacterLevel, getSpentSkillPoints, getAvailableSkillPoints, getAllSkillPoints, updateQuestCompletion, getQuestCompletion } from '../character-state.js';
import { getCurrentDevotion, getDevotionDisplayName } from '../skill-calculations.js';

// Global variables
let skillsList;
let skillsContainer;
let classSelect;
let currentTab = null;
let currentCharacterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL; // Default character level

// Main initialization function
export function initializeTreePage() {
    skillsContainer = document.getElementById('skillsContainer');
    classSelect = document.getElementById('classSelect');
    
    if (!skillsContainer || !classSelect) {
        console.error('Required elements not found');
        return;
    }
    
    main();
}

// Main application entry point
async function main() {
    try {
        skillsList = await loadSkillsFromSQLite();
        
        // Populate class selector
        const classes = [...new Set(skillsList.map(skill => skill.class))];
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

        // Initialize character state
        initializeCharacter(selectedClass, currentCharacterLevel);

        // Render skills with saved tab if specified
        renderSkills(selectedClass, skillsList, skillsContainer, currentCharacterLevel, savedTab);
        
        // Update skill points display
        updateSkillPointsDisplay();
        
        // Update devotion display
        updateDevotionDisplay();
        
        // Initialize difficulty checkboxes
        initializeDifficultyCheckboxes();
        
        // Initialize level input
        initializeLevelInput();
        
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
            
            // Reinitialize character state for new class
            initializeCharacter(newClass, currentCharacterLevel);
            
            renderSkills(newClass, skillsList, skillsContainer, currentCharacterLevel);
            
            // Update devotion display
            updateDevotionDisplay();
        });
        
        // Add event listener for character level changes
        window.addEventListener('characterLevelChanged', (e) => {
            currentCharacterLevel = e.detail.level;
            const currentClass = classSelect.value;
            
            // Update character state
            setCharacterLevel(currentCharacterLevel);
            
            // Save which tab is currently visible before re-rendering
            const savedTab = currentTab;
            
            // Re-render without redrawing arrows (just update cards)
            renderSkills(currentClass, skillsList, skillsContainer, currentCharacterLevel, savedTab, false);
            
            // Update skill points display
            updateSkillPointsDisplay();
            
            // Update devotion display
            updateDevotionDisplay();
        });
        
        // Add event listener for skill point changes
        window.addEventListener('skillPointsChanged', () => {
            const currentClass = classSelect.value;
            const savedTab = currentTab;
            
            // Re-render without redrawing arrows (just update cards)
            renderSkills(currentClass, skillsList, skillsContainer, currentCharacterLevel, savedTab, false);
            
            // Update skill points display
            updateSkillPointsDisplay();
            
            // Update devotion display
            updateDevotionDisplay();
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
    const spentPoints = getSpentSkillPoints();
    const availablePoints = getAvailableSkillPoints();
    const remainingPoints = availablePoints - spentPoints;
    
    const spentEl = document.getElementById('spentPoints');
    const availableEl = document.getElementById('availablePoints');
    
    if (spentEl && availableEl) {
        spentEl.textContent = spentPoints;
        availableEl.textContent = availablePoints;
        
        // Change color if over budget
        if (remainingPoints < 0) {
            spentEl.classList.add('has-text-danger');
            spentEl.classList.remove('has-text-success');
        } else if (remainingPoints === 0) {
            spentEl.classList.add('has-text-success');
            spentEl.classList.remove('has-text-danger');
        } else {
            spentEl.classList.remove('has-text-danger', 'has-text-success');
        }
    }
}

// Update devotion display (for Paladin only)
function updateDevotionDisplay() {
    const devotionField = document.getElementById('devotionField');
    const devotionDisplay = document.getElementById('devotionDisplay');
    const currentClass = classSelect ? classSelect.value : null;
    
    if (!devotionField || !devotionDisplay) return;
    
    // Only show for Paladin
    if (currentClass === 'Paladin') {
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
                if (currentDevotion === 'holy') {
                    devotionDisplay.classList.add('has-text-warning');
                } else if (currentDevotion === 'neutral') {
                    devotionDisplay.classList.add('has-text-white');
                } else if (currentDevotion === 'unholy') {
                    devotionDisplay.classList.add('has-text-purple');
                }
            }
        }
    } else {
        devotionField.style.display = 'none';
    }
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

/**
 * Initialize level input field and its event handlers
 */
function initializeLevelInput() {
    const levelInput = document.getElementById('characterLevel');
    const levelHelp = document.getElementById('characterLevelHelp');
    
    if (!levelInput || !levelHelp) return;
    
    // Set initial values from config
    levelInput.min = CHARACTER_CONFIG.MIN_LEVEL;
    levelInput.max = CHARACTER_CONFIG.MAX_LEVEL;
    levelInput.value = CHARACTER_CONFIG.DEFAULT_LEVEL;
    levelHelp.textContent = `Character level (${CHARACTER_CONFIG.MIN_LEVEL}-${CHARACTER_CONFIG.MAX_LEVEL})`;
    
    // Only allow numbers
    levelInput.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
            e.preventDefault();
        }
    });
    
    // Clamp value on input change
    levelInput.addEventListener('input', () => {
        // Remove non-numeric characters
        levelInput.value = levelInput.value.replace(/[^0-9]/g, '');
        
        // Don't clamp while typing (allow empty or partial input)
        if (levelInput.value === '') return;
    });
    
    // Clamp value when focus is lost and trigger recalculation
    levelInput.addEventListener('blur', () => {
        let value = parseInt(levelInput.value, 10);
        levelInput.value = clampCharacterLevel(value);
        
        // Trigger recalculation of skill max levels
        window.dispatchEvent(new CustomEvent('characterLevelChanged', {
            detail: { level: parseInt(levelInput.value, 10) }
        }));
    });
    
    // Also trigger on Enter key
    levelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            levelInput.blur(); // This will trigger the blur event above
        }
    });
}
