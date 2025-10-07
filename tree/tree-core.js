// Core functionality for the skills tree viewer
import { loadSkillsFromSQLite } from './tree-data.js';
import { renderSkills } from './tree-render.js';

// Global variables
let skillsList;
let skillsContainer;
let classSelect;

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

        // Initial render with first class
        renderSkills(classes[0], skillsList, skillsContainer);
        
        // Add event listener for class changes
        classSelect.addEventListener('change', () => renderSkills(classSelect.value, skillsList, skillsContainer));
    } catch (error) {
        console.error('Error initializing tree page:', error);
    }
}
