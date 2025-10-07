// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite, getDatabase } from './tree-data.js';
import { renderSkills } from './tree-render.js';
import { CHARACTER_CONFIG } from '../character-config.js';
import { initializeCharacter, setCharacterLevel, getSpentSkillPoints, getAvailableSkillPoints, getAllSkillPoints } from '../character-state.js';
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
            
            // Console log for debugging
            console.log('=== DEVOTION STATUS ===');
            console.log('Current Devotion:', devotionName);
            console.log('Devotion Type:', currentDevotion);
            console.log('=======================');
        }
    } else {
        devotionField.style.display = 'none';
    }
}

// Restore tab selection
function restoreTabSelection(tabName) {
    const tabLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabLink) {
        // Trigger the tab switch manually instead of clicking
        const ul = tabLink.closest('ul');
        
        // Remove active class from all tabs
        ul.querySelectorAll('li').forEach(li => li.classList.remove('is-active'));
        tabLink.parentElement.classList.add('is-active');
        
        // Hide all tab contents
        document.querySelectorAll('.skills-grid').forEach(grid => {
            grid.style.display = 'none';
        });
        
        // Show clicked tab content
        const targetGrid = document.getElementById(`tab-${tabName}`);
        if (targetGrid) {
            targetGrid.style.display = 'grid';
        }
        
        currentTab = tabName;
        updateUrlState(classSelect.value, tabName);
    }
}

// Export function to update tab state (called from render module)
export function setCurrentTab(tabName) {
    currentTab = tabName;
    updateUrlState(classSelect.value, tabName);
}
