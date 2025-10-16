// Skills rendering and grid layout functionality
import { addOverlayArrows } from './tree-arrows.js';
import { setCurrentTab } from './tree-core.js';
import { calculateMaxLevel, checkDevotionRestriction } from '../skill-calculations.js';
import { getDatabase } from './tree-data.js';
import { CHARACTER_CONFIG } from '../character-config.js';
import { getSkillPoints, addSkillPoint, removeSkillPoint, checkPrerequisites, getAllSkillPoints, checkMasteryRestriction, checkCovenRestriction, checkProficiencyRestriction, getMinimumRequiredLevel } from '../character-state.js';
import { ToastManager } from './ToastManager.js';
import { renderSkillCard, getSkillIcon } from './tree-card-renderer.js';

// Store current skills list for dependency checking
let currentSkillsList = [];

// Initialize ToastManager
const toastManager = new ToastManager();

/**
 * Update skill cards without redrawing arrows
 * This is more efficient for character level changes and skill point updates
 */
function updateSkillCards(selectedClass, skillsList) {
    // Get all skill cards
    const allCards = document.querySelectorAll('.skill-card');
    
    // Track which tabs have points
    const tabsWithPoints = new Set();
    
    allCards.forEach(card => {
        // Skip oSkills tab cards - they have their own unrestricted logic
        if (card.closest('#tab-oSkills')) {
            return;
        }
        
        // Get skill ID from the card's button (if it exists)
        const plusBtn = card.querySelector('.skill-plus-btn');
        if (!plusBtn) return;
        
        const skillId = plusBtn.dataset.skill;
        const skill = skillsList.find(s => s.id === skillId);
        if (!skill) return;
        
        // Get current points
        const currentPoints = getSkillPoints(skillId);
        
        // Track tabs with points
        if (currentPoints > 0 && skill.tabName) {
            tabsWithPoints.add(skill.tabName);
        }
        
        // Update the level display
        const levelDisplay = card.querySelector('.is-size-6');
        if (levelDisplay && !skill.isInnate()) {
            const db = getDatabase();
            const skillLevels = getAllSkillPoints();
            const minLevel = getMinimumRequiredLevel(db);
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, minLevel, db) : skill.baseMaxLevel;
            const isMaxed = currentPoints >= effectiveMaxLevel;
            const levelColor = isMaxed ? 'has-text-warning' : 'has-text-grey';
            
            levelDisplay.className = `${levelColor} is-size-6`;
            levelDisplay.textContent = `${currentPoints} / ${effectiveMaxLevel}`;
        }
        
        // Update button states
        const minusBtn = card.querySelector('.skill-minus-btn');
        if (plusBtn && minusBtn && !skill.isInnate()) {
            const db = getDatabase();
            const skillLevels = getAllSkillPoints();
            const minLevel = getMinimumRequiredLevel(db);
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, minLevel, db) : skill.baseMaxLevel;
            
            // Check prerequisites, ultimate, mastery, coven, proficiency, and devotion restrictions
            const prereqCheck = checkPrerequisites(skill, currentSkillsList);
            const ultimateRestriction = checkUltimateSkillBlock(skill, currentSkillsList);
            const masteryRestriction = checkMasteryRestriction(skill, currentSkillsList);
            const covenRestriction = checkCovenRestriction(skill, currentSkillsList);
            const proficiencyRestriction = checkProficiencyRestriction(skill, currentSkillsList);
            const devotionRestriction = checkDevotionRestriction(skill.skillId, skillLevels, db);
            const canAddPoint = (prereqCheck.met && !ultimateRestriction.blocked && masteryRestriction.allowed && covenRestriction.allowed && proficiencyRestriction.allowed && devotionRestriction.canAllocate) || currentPoints > 0;
            
            // Build tooltip message
            let tooltipMessage = '';
            if (!prereqCheck.met && currentPoints === 0) {
                tooltipMessage = prereqCheck.reasons.join('\n');
            } else if (ultimateRestriction.blocked && currentPoints === 0) {
                tooltipMessage = ultimateRestriction.reason;
            } else if (!masteryRestriction.allowed && currentPoints === 0) {
                tooltipMessage = masteryRestriction.reason;
            } else if (!covenRestriction.allowed && currentPoints === 0) {
                tooltipMessage = covenRestriction.reason;
            } else if (!proficiencyRestriction.allowed && currentPoints === 0) {
                tooltipMessage = proficiencyRestriction.reason;
            } else if (!devotionRestriction.canAllocate && currentPoints === 0) {
                tooltipMessage = devotionRestriction.reason;
            }
            
            // Update + button
            const plusDisabled = !canAddPoint || currentPoints >= effectiveMaxLevel;
            plusBtn.disabled = plusDisabled;
            plusBtn.className = `button is-outlined is-small ${plusDisabled ? 'is-ghost' : 'is-success'} skill-plus-btn`;
            // Store tooltip message as data attribute instead of title (to avoid double display)
            plusBtn.dataset.warningMessage = tooltipMessage;
            
            // Update - button
            const minusDisabled = currentPoints === 0;
            minusBtn.disabled = minusDisabled;
            minusBtn.className = `button is-outlined is-small ${minusDisabled ? 'is-ghost' : 'is-danger'} skill-minus-btn`;
        }
    });
    
    // Check if oSkills tab should be highlighted
    // Access oSkills from tree-core.js if available
    if (window.oSkills && window.oSkills.length > 0) {
        tabsWithPoints.add('oSkills');
    }
    
    // Update tab colors based on points allocated
    updateTabColors(tabsWithPoints);
}

/**
 * Update tab colors to highlight tabs with skill points
 * @param {Set} tabsWithPoints - Set of tab names that have points allocated
 */
export function updateTabColors(tabsWithPoints) {
    // Get all tab links
    const tabLinks = document.querySelectorAll('.tabs a');
    
    tabLinks.forEach(link => {
        const tabName = link.dataset.tab;
        if (tabName) {
            if (tabsWithPoints.has(tabName)) {
                link.classList.add('has-text-info');
            } else {
                link.classList.remove('has-text-info');
            }
        }
    });
}

// Main render function
export function renderSkills(selectedClass, skillsList, skillsContainer, preserveTab = null, redrawArrows = true) {
    // Store skills list for dependency checking
    currentSkillsList = skillsList;
    
    // If not redrawing arrows, just update existing cards
    if (!redrawArrows && skillsContainer.children.length > 0) {
        updateSkillCards(selectedClass, skillsList);
        return;
    }
    
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
                const isActiveTab = preserveTab ? (tabName === preserveTab) : first;
                if (isActiveTab) {
                    li.classList.add('is-active');
                    // Set current tab for the active tab
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
        contentDiv.style.display = isActiveTab ? 'grid' : 'none';

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
        
        first = false;
    });
    
    // Add oSkills tab
    const oSkillsLi = document.createElement('li');
    const isOSkillsActive = preserveTab === 'oSkills';
    if (isOSkillsActive) {
        oSkillsLi.classList.add('is-active');
        // Set current tab for the active tab
        setCurrentTab('oSkills');
    }
    const oSkillsA = document.createElement('a');
    oSkillsA.textContent = 'oSkills';
    oSkillsA.dataset.tab = 'oSkills';
    oSkillsLi.appendChild(oSkillsA);
    ul.appendChild(oSkillsLi);
    
    // Create oSkills tab content (grid like regular tabs)
    const oSkillsContent = document.createElement('div');
    oSkillsContent.className = 'skills-grid';
    oSkillsContent.id = 'tab-oSkills';
    oSkillsContent.style.display = isOSkillsActive ? 'grid' : 'none';
    tabContent.appendChild(oSkillsContent);

    
    tabNav.appendChild(ul);
    skillsContainer.appendChild(tabNav);
    skillsContainer.appendChild(tabContent);
    
    // Update tab colors on initial render
    const tabsWithPoints = new Set();
    classSkills.forEach(skill => {
        if (getSkillPoints(skill.id) > 0 && skill.tabName) {
            tabsWithPoints.add(skill.tabName);
        }
    });
    
    // Check if oSkills tab should be highlighted
    if (window.oSkills && window.oSkills.length > 0) {
        tabsWithPoints.add('oSkills');
    }
    
    updateTabColors(tabsWithPoints);
    
    // Add arrows for the active tab after DOM is appended
    const activeTabName = preserveTab || sortedTabNames[0];
    const activeGrid = document.getElementById(`tab-${activeTabName}`);
    
    if (activeGrid) {
        const tabSkills = tabs[activeTabName];
        
        if (tabSkills) {
            const rows = tabSkills.map(s => s.row);
            const cols = tabSkills.map(s => s.col);
            const minRow = Math.min(...rows);
            const minCol = Math.min(...cols);
            
            setTimeout(() => {
                addOverlayArrows(activeGrid, tabSkills, minRow, minCol, classSkills);
            }, 100);
        }
    }
    
    // Show oSkills panel if oSkills tab is active on initial load
    const oskillPanel = document.getElementById('oskillPanel');
    if (oskillPanel && activeTabName === 'oSkills') {
        oskillPanel.style.display = 'block';
    }

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
                    
                    // Show/hide oSkills panel based on active tab
                    const oskillPanel = document.getElementById('oskillPanel');
                    if (oskillPanel) {
                        const shouldShow = clickedTab === 'oSkills';
                        oskillPanel.style.display = shouldShow ? 'block' : 'none';
                    }
                    
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
    // Get current skill points
    const currentPoints = getSkillPoints(skill.id);
    
    // Prepare card data
    let cardData;
    
    if (!skill.isInnate()) {
        const db = getDatabase();
        const skillLevels = getAllSkillPoints();
        const minLevel = getMinimumRequiredLevel(db);
        const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, minLevel, db) : skill.baseMaxLevel;
        const isMaxed = currentPoints >= effectiveMaxLevel;
        
        cardData = {
            skillId: skill.id,
            iconHTML: getSkillIcon(skill.image, skill.class),
            displayName: skill.name,
            hasDescription: skill.hasDetails || false,
            currentPoints: currentPoints,
            maxPoints: effectiveMaxLevel,
            levelColor: isMaxed ? 'has-text-warning' : 'has-text-grey',
            buttons: {
                show: true,
                plusDisabled: false, // Will be set below
                minusDisabled: currentPoints === 0,
                plusTooltip: '',
                dataSkill: skill.id
            }
        };
    } else {
        // Skills that cannot have points added
        const maxDisplay = skill.isInnate() ? "0" : "?";
        
        cardData = {
            skillId: skill.id,
            iconHTML: getSkillIcon(skill.image, skill.class),
            displayName: skill.name,
            hasDescription: skill.hasDetails || false,
            currentPoints: skill.isInnate() ? 0 : "?",
            maxPoints: maxDisplay,
            levelColor: 'has-text-grey',
            buttons: {
                show: false,
                plusDisabled: true,
                minusDisabled: true,
                plusTooltip: '',
                dataSkill: skill.id
            }
        };
    }
    
    // Render card using shared renderer
    const card = renderSkillCard(cardData);
    
    // Add restriction checks and event listeners if skill can have points
    if (!skill.isInnate()) {
        const db = getDatabase();
        const skillLevels = getAllSkillPoints();
        const minLevel = getMinimumRequiredLevel(db);
        const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, minLevel, db) : skill.baseMaxLevel;
        
        // Check all restrictions
        const prereqCheck = checkPrerequisites(skill, currentSkillsList);
        const ultimateRestriction = checkUltimateSkillBlock(skill, currentSkillsList);
        const masteryRestriction = checkMasteryRestriction(skill, currentSkillsList);
        const covenRestriction = checkCovenRestriction(skill, currentSkillsList);
        const proficiencyRestriction = checkProficiencyRestriction(skill, currentSkillsList);
        const devotionRestriction = checkDevotionRestriction(skill.skillId, skillLevels, db);
        
        // Can add point if: prereqs met AND (not blocked by restrictions OR already has points)
        const canAddPoint = (prereqCheck.met && !ultimateRestriction.blocked && masteryRestriction.allowed && covenRestriction.allowed && proficiencyRestriction.allowed && devotionRestriction.canAllocate) || currentPoints > 0;
        
        // Build tooltip message
        let tooltipMessage = '';
        if (!prereqCheck.met && currentPoints === 0) {
            tooltipMessage = prereqCheck.reasons.join('\n');
        } else if (ultimateRestriction.blocked && currentPoints === 0) {
            tooltipMessage = ultimateRestriction.reason;
        } else if (!masteryRestriction.allowed && currentPoints === 0) {
            tooltipMessage = masteryRestriction.reason;
        } else if (!covenRestriction.allowed && currentPoints === 0) {
            tooltipMessage = covenRestriction.reason;
        } else if (!proficiencyRestriction.allowed && currentPoints === 0) {
            tooltipMessage = proficiencyRestriction.reason;
        } else if (!devotionRestriction.canAllocate && currentPoints === 0) {
            tooltipMessage = devotionRestriction.reason;
        }
        
        // Update button states
        const plusBtn = card.querySelector('.skill-plus-btn');
        const minusBtn = card.querySelector('.skill-minus-btn');
        
        if (plusBtn && minusBtn) {
            const plusDisabled = !canAddPoint || currentPoints >= effectiveMaxLevel;
            
            plusBtn.disabled = plusDisabled;
            plusBtn.className = `button is-outlined is-small ${plusDisabled ? 'is-ghost' : 'is-success'} skill-plus-btn`;
            // Store tooltip message as data attribute instead of title (to avoid double display)
            plusBtn.dataset.warningMessage = tooltipMessage;
            
            // Add event listeners
            plusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift-click: add 25 points
                    handleSkillPointChange(skill, 25);
                } else if (e.ctrlKey) {
                    // Ctrl-click: add 5 points
                    handleSkillPointChange(skill, 5);
                } else {
                    // Normal click: add 1 point
                    handleSkillPointChange(skill, 1);
                }
            });
            
            minusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift-click: remove 25 points
                    handleSkillPointChange(skill, -25);
                } else if (e.ctrlKey) {
                    // Ctrl-click: remove 5 points
                    handleSkillPointChange(skill, -5);
                } else {
                    // Normal click: remove 1 point
                    handleSkillPointChange(skill, -1);
                }
            });
        }
    }
    
    return card;
}

/**
 * Check if an Ultimate skill is blocked by another Ultimate skill having points
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { blocked: boolean, reason: string }
 */
function checkUltimateSkillBlock(skill, allSkills) {
    // Check if this skill has the Ultimate tag
    const isUltimate = skill.hasTag('Ultimate');
    
    if (!isUltimate) {
        return { blocked: false, reason: '' };
    }
    
    // If this skill already has points, it's not blocked
    const currentPoints = getSkillPoints(skill.id);
    if (currentPoints > 0) {
        return { blocked: false, reason: '' };
    }
    
    // Find all Ultimate skills from the same class
    const classUltimateSkills = allSkills.filter(s => 
        s.class === skill.class && 
        s.hasTag('Ultimate')
    );
    
    // Check if any other Ultimate skill from this class has points
    for (const ultimateSkill of classUltimateSkills) {
        if (ultimateSkill.id !== skill.id) {
            const points = getSkillPoints(ultimateSkill.id);
            if (points > 0) {
                return { 
                    blocked: true, 
                    reason: `${ultimateSkill.name} already has points. Only one Ultimate skill per class is allowed.` 
                };
            }
        }
    }
    
    return { blocked: false, reason: '' };
}

/**
 * Handle skill point changes (add or remove)
 */
function handleSkillPointChange(skill, delta) {
    const db = getDatabase();
    
    // Use minimum required level for max level calculations
    const actualCharacterLevel = getMinimumRequiredLevel(db);
    
    // Handle multiple points
    if (Math.abs(delta) > 1) {
        let pointsChanged = 0;
        const direction = delta > 0 ? 1 : -1;
        const targetPoints = Math.abs(delta);
        
        for (let i = 0; i < targetPoints; i++) {
            // Recalculate max level for each point (important for self-scaling skills)
            const skillLevels = getAllSkillPoints();
            const currentSkillPoints = skillLevels[skill.id] || 0;
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, actualCharacterLevel, db) : skill.baseMaxLevel;
            
            let result;
            if (direction > 0) {
                result = addSkillPoint(skill.id, skill, effectiveMaxLevel, currentSkillsList);
            } else {
                result = removeSkillPoint(skill.id, currentSkillsList);
            }
            
            if (!result.success) {
                // Stop if we hit a limit or error
                if (pointsChanged > 0) {
                    break; // Some points were added/removed successfully
                } else {
                    toastManager.showToast(result.reason, true);
                }
                break; // Stop the loop
            }
            pointsChanged++;
        }
        
        // Trigger re-render after all points are processed
        window.dispatchEvent(new CustomEvent('skillPointsChanged'));
        return;
    }
    
    // Handle single point
    // Recalculate max level with current points (important for self-scaling skills)
    const skillLevels = getAllSkillPoints();
    const currentSkillPoints = skillLevels[skill.id] || 0;
    const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, actualCharacterLevel, db) : skill.baseMaxLevel;
    
    let result;
    if (delta > 0) {
        // Pass all skills for prerequisite checking (including tree_points)
        result = addSkillPoint(skill.id, skill, effectiveMaxLevel, currentSkillsList);
    } else {
        // Pass all skills for dependency checking
        result = removeSkillPoint(skill.id, currentSkillsList);
    }
    
    if (!result.success) {
        toastManager.showToast(result.reason, true);
    }
    
    // Trigger re-render to update all skills
    window.dispatchEvent(new CustomEvent('skillPointsChanged'));
}

/**
 * Render difficulty checkboxes
 * @param {Object} questState - Current quest completion state
 */
export function renderDifficultyCheckboxes(questState = null) {
    const container = document.querySelector('.field:has(#characterLevel)');
    if (!container) return;
    
    // Find or create difficulty field
    let difficultyField = container.nextElementSibling;
    if (!difficultyField || !difficultyField.querySelector('#difficultyNormal')) {
        // Create difficulty field if it doesn't exist
        difficultyField = document.createElement('div');
        difficultyField.className = 'field';
        difficultyField.innerHTML = `
            <label class="label">Difficulty</label>
            <div class="control difficulty-checkboxes ml-1">
                <label class="checkbox">
                    <input type="checkbox" id="difficultyNormal" checked>
                    Normal
                </label>
                <label class="checkbox">
                    <input type="checkbox" id="difficultyNightmare" checked>
                    Nightmare
                </label>
                <label class="checkbox">
                    <input type="checkbox" id="difficultyHell" checked>
                    Hell
                </label>
            </div>
        `;
        container.parentNode.insertBefore(difficultyField, container.nextElementSibling);
    }
    
    // Update checkbox states if quest state is provided
    if (questState) {
        const normalCheckbox = difficultyField.querySelector('#difficultyNormal');
        const nightmareCheckbox = difficultyField.querySelector('#difficultyNightmare');
        const hellCheckbox = difficultyField.querySelector('#difficultyHell');
        
        if (normalCheckbox && nightmareCheckbox && hellCheckbox) {
            normalCheckbox.checked = questState.hasNormal;
            nightmareCheckbox.checked = questState.hasNightmare;
            hellCheckbox.checked = questState.hasHell;
        }
    }
}
