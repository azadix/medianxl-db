// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite } from './tree-data.js';
import { renderSkills } from './tree-render.js';

// Global variables
let skillsList;
let skillsContainer;
let classSelect;
let currentTab = null;

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

        // Render skills and restore tab if specified
        renderSkills(selectedClass, skillsList, skillsContainer);
        
        // Restore tab selection after rendering
        if (savedTab) {
            setTimeout(() => {
                restoreTabSelection(savedTab);
            }, 100);
        }
        
        // Add event listener for class changes
        classSelect.addEventListener('change', () => {
            const newClass = classSelect.value;
            // Reset tab when class changes - will be set to first tab by renderSkills
            currentTab = null;
            updateUrlState(newClass, null);
            renderSkills(newClass, skillsList, skillsContainer);
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

// Restore tab selection
function restoreTabSelection(tabName) {
    const tabLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabLink) {
        // Simulate click on the tab
        tabLink.click();
        currentTab = tabName;
        updateUrlState(classSelect.value, tabName);
    }
}

// Export function to update tab state (called from render module)
export function setCurrentTab(tabName) {
    currentTab = tabName;
    updateUrlState(classSelect.value, tabName);
}
