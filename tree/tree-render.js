// Skills rendering and grid layout functionality
import { getSkillIconHTML } from '../utils.js';
import { addOverlayArrows } from './tree-arrows.js';
import { setCurrentTab } from './tree-core.js';

// Main render function
export function renderSkills(selectedClass, skillsList, skillsContainer) {
    skillsContainer.innerHTML = "";

    // Filter skills for this class
    const classSkills = skillsList.filter(skill => skill.class === selectedClass);

    // Group by tabName
    const tabs = {};
    classSkills.forEach(skill => {
        if (!tabs[skill.tabName]) tabs[skill.tabName] = [];
        tabs[skill.tabName].push(skill);
    });

    // Sort tabs with Mastery positioned 3rd from the end
    const tabNames = Object.keys(tabs);
    const sortedTabNames = tabNames.sort((a, b) => {
        // Define the special tabs that should be at the end
        const specialTabs = ['Mastery', 'Reward', 'Innate'];
        
        const aIsSpecial = specialTabs.includes(a);
        const bIsSpecial = specialTabs.includes(b);
        
        // If both are special tabs, sort by their position in the specialTabs array
        if (aIsSpecial && bIsSpecial) {
            return specialTabs.indexOf(a) - specialTabs.indexOf(b);
        }
        
        // If only one is special, put it at the end
        if (aIsSpecial) return 1;
        if (bIsSpecial) return -1;
        
        // If neither is special, maintain original order (don't sort alphabetically)
        return 0;
    });

    // Tabs nav
    const tabNav = document.createElement('div');
    tabNav.className = 'tabs';
    const ul = document.createElement('ul');

    const tabContent = document.createElement('div');
    let first = true;

    sortedTabNames.forEach(tabName => {
                // Tab nav button
                const li = document.createElement('li');
                if (first) {
                    li.classList.add('is-active');
                    // Set the current tab when rendering the first tab
                    setCurrentTab(tabName);
                }
                const a = document.createElement('a');
                a.textContent = tabName;
                a.dataset.tab = tabName;
                li.appendChild(a);
                ul.appendChild(li);

        // Tab content grid
        const contentDiv = document.createElement('div');
        contentDiv.className = 'skills-grid';
        contentDiv.id = `tab-${tabName}`;
        contentDiv.style.display = first ? 'grid' : 'none';

        const rows = tabs[tabName].map(s => s.row);
        const cols = tabs[tabName].map(s => s.col);
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);

        contentDiv.style.gridTemplateRows = `repeat(${maxRow - minRow + 1}, auto)`;
        contentDiv.style.gridTemplateColumns = `repeat(${maxCol - minCol + 1}, 1fr)`;

        const skillsInTab = tabs[tabName]; // Define skillsInTab for arrow calculations

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const skill = tabs[tabName].find(s => s.row === r && s.col === c);
                        if (skill) {
                            const card = createSkillCard(skill, tabName);
                            card.style.gridRow = r - minRow + 1;
                            card.style.gridColumn = c - minCol + 1;
                            contentDiv.appendChild(card);
                        } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'empty-skill-card';
                    placeholder.style.gridRow = r - minRow + 1;
                    placeholder.style.gridColumn = c - minCol + 1;
                    contentDiv.appendChild(placeholder);
                }
            }
        }

        tabContent.appendChild(contentDiv);
        
        // Only add arrows for the first (active) tab initially
        if (first) {
            setTimeout(() => {
                addOverlayArrows(contentDiv, skillsInTab, minRow, minCol, classSkills);
            }, 100);
        }
        
        first = false;
    });

    tabNav.appendChild(ul);
    skillsContainer.appendChild(tabNav);
    skillsContainer.appendChild(tabContent);

            // Add tab switching functionality
            ul.addEventListener('click', (e) => {
                if (e.target.tagName === 'A') {
                    const clickedTab = e.target.dataset.tab;
                    
                    // Update URL state with selected tab
                    setCurrentTab(clickedTab);
                    
                    // Remove active class from all tabs
                    ul.querySelectorAll('li').forEach(li => li.classList.remove('is-active'));
                    e.target.parentElement.classList.add('is-active');
                    
                    // Hide all tab contents
                    document.querySelectorAll('.skills-grid').forEach(grid => {
                        grid.style.display = 'none';
                    });
                    
                    // Show clicked tab content
                    const targetGrid = document.getElementById(`tab-${clickedTab}`);
                    if (targetGrid) {
                        targetGrid.style.display = 'grid';
                        
                        // Clear existing arrows and recreate them for the active tab
                        targetGrid.querySelectorAll('.overlay-arrow').forEach(arrow => arrow.remove());
                        
                        // Find the skills for this tab and recreate arrows
                        const tabSkills = classSkills.filter(skill => skill.tabName === clickedTab);
                        if (tabSkills.length > 0) {
                            const rows = tabSkills.map(s => s.row);
                            const cols = tabSkills.map(s => s.col);
                            const minRow = Math.min(...rows);
                            const minCol = Math.min(...cols);
                            
                            setTimeout(() => {
                                addOverlayArrows(targetGrid, tabSkills, minRow, minCol, classSkills);
                            }, 50);
                        }
                    }
                }
            });
}

// Create a skill card element
function createSkillCard(skill, currentTab) {
    const card = document.createElement('div');
    card.className = 'skill-card';

    // Parse prerequisites to find level requirements and tooltip content
    let levelRequirement = null;
    let hasPrerequisites = false;
    let tooltipContent = '';
    if (skill.prerequisites && skill.prerequisites.length > 0) {
        hasPrerequisites = true;
        const tooltipParts = [];
        
        skill.prerequisites.forEach(prereq => {
            const [type, value, target] = prereq.split(':');
            
            if (type === 'character_level' || type === 'class_level') {
                levelRequirement = value;
            } else if (type === 'tree_points') {
                tooltipParts.push(`Requires ${value} points in ${target}`);
            } else if (type === 'skill_level') {
                tooltipParts.push(`Requires ${target} at level ${value}`);
            }
        });
        if (tooltipParts.length > 0) {
            tooltipContent = tooltipParts.join('\n');
        }
    }

    let cardText = `
        ${getSkillIconHTML(skill.image, skill.class)}
        <div>
    `;
    if (skill.hasDetails) {
        // Get current URL parameters to preserve state
        const urlParams = new URLSearchParams(window.location.search);
        const currentClass = urlParams.get('class');
        // Use the passed currentTab parameter instead of reading from URL
        const tabToUse = currentTab || urlParams.get('tab');
        
        // Build skill link with preserved state
        let skillUrl = `./?skill=${skill.id}`;
        if (currentClass) skillUrl += `&class=${currentClass}`;
        if (tabToUse) skillUrl += `&tab=${tabToUse}`;
        
        cardText += `<a href="${skillUrl}">${skill.name}</a>`;
    } else {
        cardText += `${skill.name}`;
    }
    cardText += `</div>`;
    
    // Add level requirement at top right if present
    if (levelRequirement) {
        cardText += `<div class="has-text-danger is-size-7" style="position: absolute; top: 2px; right: 2px;">Lv.${levelRequirement}</div>`;
    }
    
    // Add tooltip at bottom right if present
    if (tooltipContent) {
        cardText += `<div class="has-text-info is-size-6 has-text-weight-bold" style="position: absolute; bottom: 3px; right: 8px;" title="${tooltipContent}">!</div>`;
    }
    
    // Add skill level info under skill name (orange value if skill reached max possible level)
    if (skill.canAddPoints) {
        // Regular skills that can have points added
        if (skill.canBeEnhanced) {
            cardText += `<div class="has-text-grey is-size-6">0 / ${skill.baseMaxLevel}</div>`;
        } else {
            cardText += `<div class="has-text-grey is-size-6">0 / <span class="has-text-warning">${skill.baseMaxLevel}</span></div>`;
        }
    } else {
        // Skills that cannot have points added
        if (skill.tabName == "Innate") {
            cardText += `<div class="has-text-grey is-size-6">0 / 0</div>`;
        } else {
            cardText += `<div class="has-text-grey is-size-6">? / ?</div>`;
        }
    }
    
    card.innerHTML = cardText;
    return card;
}
