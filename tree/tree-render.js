// Skills rendering and grid layout functionality
import { getSkillIconHTML } from '../utils.js';
import { addOverlayArrows } from './tree-arrows.js';
import { setCurrentTab } from './tree-core.js';
import { calculateMaxLevel, checkDevotionRestriction, getCurrentDevotion, getDevotionDisplayName } from '../skill-calculations.js';
import { getDatabase } from './tree-data.js';
import { CHARACTER_CONFIG } from '../character-config.js';
import { getSkillPoints, addSkillPoint, removeSkillPoint, checkPrerequisites, getAllSkillPoints } from '../character-state.js';
import { ToastManager } from './ToastManager.js';

// Store current skills list for dependency checking
let currentSkillsList = [];

// Initialize ToastManager
const toastManager = new ToastManager();

/**
 * Update skill cards without redrawing arrows
 * This is more efficient for character level changes and skill point updates
 */
function updateSkillCards(selectedClass, skillsList, characterLevel) {
    // Get all skill cards
    const allCards = document.querySelectorAll('.skill-card');
    
    // Track which tabs have points
    const tabsWithPoints = new Set();
    
    allCards.forEach(card => {
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
        if (levelDisplay && skill.canAddPoints) {
            const db = getDatabase();
            const skillLevels = getAllSkillPoints();
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
            const isMaxed = currentPoints >= effectiveMaxLevel;
            const levelColor = isMaxed ? 'has-text-warning' : 'has-text-grey';
            
            levelDisplay.className = `${levelColor} is-size-6`;
            levelDisplay.textContent = `${currentPoints} / ${effectiveMaxLevel}`;
        }
        
        // Update button states
        const minusBtn = card.querySelector('.skill-minus-btn');
        if (plusBtn && minusBtn && skill.canAddPoints) {
            const db = getDatabase();
            const skillLevels = getAllSkillPoints();
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
            
            // Check prerequisites, ultimate, mastery, coven, and devotion restrictions
            const prereqCheck = checkPrerequisites(skill, currentSkillsList);
            const ultimateRestriction = checkUltimateSkillBlock(skill, currentSkillsList);
            const masteryRestriction = checkMasterySkillBlock(skill, currentSkillsList);
            const covenRestriction = checkCovenSkillBlock(skill, currentSkillsList);
            const devotionRestriction = checkDevotionRestriction(skill.skillId, skillLevels, db);
            const canAddPoint = (prereqCheck.met && !ultimateRestriction.blocked && !masteryRestriction.blocked && !covenRestriction.blocked && devotionRestriction.canAllocate) || currentPoints > 0;
            
            // Build tooltip (show Coven restriction, but not Mastery)
            let tooltipMessage = '';
            if (!prereqCheck.met && currentPoints === 0) {
                tooltipMessage = prereqCheck.reasons.join(', ');
            } else if (ultimateRestriction.blocked && currentPoints === 0) {
                tooltipMessage = ultimateRestriction.reason;
            } else if (covenRestriction.blocked && currentPoints === 0) {
                tooltipMessage = covenRestriction.reason;
            } else if (!devotionRestriction.canAllocate && currentPoints === 0) {
                tooltipMessage = devotionRestriction.reason;
            }
            
            // Update + button
            const plusDisabled = !canAddPoint || currentPoints >= effectiveMaxLevel;
            plusBtn.disabled = plusDisabled;
            plusBtn.className = `button is-outlined is-small ${plusDisabled ? 'is-ghost' : 'is-success'} skill-plus-btn`;
            plusBtn.title = tooltipMessage;
            
            // Update - button
            const minusDisabled = currentPoints === 0;
            minusBtn.disabled = minusDisabled;
            minusBtn.className = `button is-outlined is-small ${minusDisabled ? 'is-ghost' : 'is-danger'} skill-minus-btn`;
        }
    });
    
    // Update tab colors based on points allocated
    updateTabColors(tabsWithPoints);
}

/**
 * Update tab colors to highlight tabs with skill points
 * @param {Set} tabsWithPoints - Set of tab names that have points allocated
 */
function updateTabColors(tabsWithPoints) {
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
export function renderSkills(selectedClass, skillsList, skillsContainer, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL, preserveTab = null, redrawArrows = true) {
    // Store skills list for dependency checking
    currentSkillsList = skillsList;
    
    // If not redrawing arrows, just update existing cards
    if (!redrawArrows && skillsContainer.children.length > 0) {
        updateSkillCards(selectedClass, skillsList, characterLevel);
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
                            const card = createSkillCard(skill, tabName, characterLevel);
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

    // Add skill points display to the right side of tabs
    const skillPointsLi = document.createElement('li');
    skillPointsLi.style.marginLeft = 'auto';
    skillPointsLi.style.pointerEvents = 'none'; // Not clickable
    const skillPointsSpan = document.createElement('span');
    skillPointsSpan.id = 'tabSkillPointsDisplay';
    skillPointsSpan.className = 'has-text-light has-text-weight-bold';
    skillPointsSpan.style.padding = '0.5em 1em';
    skillPointsLi.appendChild(skillPointsSpan);
    ul.appendChild(skillPointsLi);
    
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
function createSkillCard(skill, currentTab, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.dataset.skillId = skill.id; // Add skill ID as data attribute for tooltip

    // Parse prerequisites to find level requirements
    let levelRequirement = null;
    if (skill.prerequisites && skill.prerequisites.length > 0) {
        skill.prerequisites.forEach(prereq => {
            const [type, value] = prereq.split(':');
            
            if (type === 'character_level' || type === 'class_level') {
                levelRequirement = value;
            }
        });
    }

    // Get current skill points
    const currentPoints = getSkillPoints(skill.id);
    
    // Section 1: Top row with 3 columns (empty space | icon | buttons)
    let cardText = `<div style="display: grid; grid-template-columns: auto 1fr auto; gap: 4px; align-items: center; width: 100%;">`;
    
    // Column 1: Empty (keeping grid structure but no content)
    cardText += `<div style="min-width: 32px;"></div>`;
    
    // Column 2: Icon
    cardText += `<div style="display: flex; justify-content: center;">${getSkillIconHTML(skill.image, skill.class)}</div>`;
    
    // Column 3: +/- buttons (will be added later if canAddPoints)
    cardText += `<div class="skill-buttons-container" style="min-width: 32px;"></div>`;
    
    cardText += `</div>`; // End section 1
    
    // Section 2: Skill name
    cardText += `<div style="text-align: center;">`;
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
    cardText += `</div>`; // End section 2
    
    // Section 3: Skill level display
    if (skill.canAddPoints) {
        const db = getDatabase();
        const skillLevels = getAllSkillPoints();
        const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
        const isMaxed = currentPoints >= effectiveMaxLevel;
        
        // Apply warning color only when maxed, otherwise grey
        const levelColor = isMaxed ? 'has-text-warning' : 'has-text-grey';
        
        cardText += `<div style="text-align: center;">`;
        cardText += `<div class="${levelColor} is-size-6">${currentPoints} / ${effectiveMaxLevel}</div>`;
        cardText += `</div>`; // End section 3
    } else {
        // Skills that cannot have points added
        cardText += `<div style="text-align: center;">`;
        if (skill.tabName == "Innate") {
            cardText += `<div class="has-text-grey is-size-6">0 / 0</div>`;
        } else {
            cardText += `<div class="has-text-grey is-size-6">? / ?</div>`;
        }
        cardText += `</div>`; // End section 3
    }
    
    card.innerHTML = cardText;
    
    // Add +/- buttons to the container if skill can have points
    if (skill.canAddPoints) {
        const db = getDatabase();
        const skillLevels = getAllSkillPoints();
        const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
        
        // Check if prerequisites are met
        const prereqCheck = checkPrerequisites(skill, currentSkillsList);
        
        // Check Ultimate skill restriction
        const ultimateRestriction = checkUltimateSkillBlock(skill, currentSkillsList);
        
        // Check Mastery skill restriction
        const masteryRestriction = checkMasterySkillBlock(skill, currentSkillsList);
        
        // Check Coven skill restriction (Sorceress)
        const covenRestriction = checkCovenSkillBlock(skill, currentSkillsList);
        
        // Check Devotion restriction (for Paladin and Amazon)
        const devotionRestriction = checkDevotionRestriction(skill.skillId, skillLevels, db);
        
        // Can add point if: prereqs met AND (not blocked by Ultimate, Mastery, Coven, or Devotion restrictions OR already has points)
        const canAddPoint = (prereqCheck.met && !ultimateRestriction.blocked && !masteryRestriction.blocked && !covenRestriction.blocked && devotionRestriction.canAllocate) || currentPoints > 0;
        
        // Build tooltip message (show Coven restriction, but not Mastery)
        let tooltipMessage = '';
        if (!prereqCheck.met && currentPoints === 0) {
            tooltipMessage = prereqCheck.reasons.join(', ');
        } else if (ultimateRestriction.blocked && currentPoints === 0) {
            tooltipMessage = ultimateRestriction.reason;
        } else if (covenRestriction.blocked && currentPoints === 0) {
            tooltipMessage = covenRestriction.reason;
        } else if (!devotionRestriction.canAllocate && currentPoints === 0) {
            tooltipMessage = devotionRestriction.reason;
        }
        
        const buttonsContainer = card.querySelector('.skill-buttons-container');
        if (buttonsContainer) {
            const plusDisabled = !canAddPoint || currentPoints >= effectiveMaxLevel;
            const minusDisabled = currentPoints === 0;
            
            buttonsContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px; padding: 2px;">
                    <button class="button is-outlined is-small ${plusDisabled ? 'is-ghost' : 'is-success'} skill-plus-btn" data-skill="${skill.id}" style="padding: 0; font-size: 1rem; width: 26px; height: 22px; border-width: 1px; line-height: 1;" ${plusDisabled ? 'disabled' : ''} title="${tooltipMessage}">+</button>
                    <button class="button is-outlined is-small ${minusDisabled ? 'is-ghost' : 'is-danger'} skill-minus-btn" data-skill="${skill.id}" style="padding: 0; font-size: 1rem; width: 26px; height: 22px; border-width: 1px; line-height: 1;" ${minusDisabled ? 'disabled' : ''}>-</button>
                </div>
            `;
            
            // Add event listeners
            const plusBtn = buttonsContainer.querySelector('.skill-plus-btn');
            const minusBtn = buttonsContainer.querySelector('.skill-minus-btn');
            
            if (plusBtn) {
                plusBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    // Shift-click: add maximum points, normal click: add 1 point
                    if (e.shiftKey) {
                        // Recalculate effective max level at click time (don't use cached value)
                        const db = getDatabase();
                        const skillLevels = getAllSkillPoints();
                        const currentEffectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
                        
                        // Get current points fresh from state
                        const currentPointsNow = getSkillPoints(skill.id);
                        const pointsToAdd = currentEffectiveMaxLevel - currentPointsNow;
                        handleSkillPointChange(skill, pointsToAdd, characterLevel);
                    } else {
                        handleSkillPointChange(skill, 1, characterLevel);
                    }
                });
            }
            
            if (minusBtn) {
                minusBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    // Shift-click: remove all points, normal click: remove 1 point
                    if (e.shiftKey) {
                        // Get current points fresh from state
                        const currentPointsNow = getSkillPoints(skill.id);
                        handleSkillPointChange(skill, -currentPointsNow, characterLevel);
                    } else {
                        handleSkillPointChange(skill, -1, characterLevel);
                    }
                });
            }
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
    const isUltimate = skill.tags && skill.tags.includes('Ultimate');
    
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
        s.tags && 
        s.tags.includes('Ultimate')
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
 * Check if a Mastery skill is blocked by the 3-skill limit
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { blocked: boolean, reason: string }
 */
function checkMasterySkillBlock(skill, allSkills) {
  // Check if this skill is in the Mastery tab
  const isMastery = skill.tabName === 'Mastery';
  
  if (!isMastery) {
    return { blocked: false, reason: '' };
  }
  
  // If this skill already has points, it's not blocked
  const currentPoints = getSkillPoints(skill.id);
  if (currentPoints > 0) {
    return { blocked: false, reason: '' };
  }
  
  // Count how many different Mastery skills have points
  const masterySkillsWithPoints = allSkills.filter(s => 
    s.tabName === 'Mastery' && 
    s.class === skill.class &&
    getSkillPoints(s.id) > 0
  );
  
  // Check if we've reached the limit
  const maxMasterySkills = 3; // CHARACTER_CONFIG.MAX_MASTERY_SKILLS
  if (masterySkillsWithPoints.length >= maxMasterySkills) {
    return { 
      blocked: true, 
      reason: `Cannot allocate points to more than ${maxMasterySkills} different Mastery skills.` 
    };
  }
  
  return { blocked: false, reason: '' };
}

/**
 * Check if a Coven skill is blocked by the 2-skill limit
 * Only applies to 4 exclusive skills: Living Flame, Warp Armor, Snow Queen, Vengeful Power
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { blocked: boolean, reason: string }
 */
function checkCovenSkillBlock(skill, allSkills) {
  // List of exclusive Coven skills (skill names)
  const exclusiveCovenSkills = ['living_flame', 'warp_armor', 'snow_queen', 'vengeful_power'];
  
  // Check if this skill is one of the exclusive Coven skills
  const isExclusiveCoven = exclusiveCovenSkills.includes(skill.id);
  
  if (!isExclusiveCoven) {
    return { blocked: false, reason: '' };
  }
  
  // If this skill already has points, it's not blocked
  const currentPoints = getSkillPoints(skill.id);
  if (currentPoints > 0) {
    return { blocked: false, reason: '' };
  }
  
  // Count how many different exclusive Coven skills have points
  const exclusiveCovenSkillsWithPoints = allSkills.filter(s => 
    exclusiveCovenSkills.includes(s.id) &&
    getSkillPoints(s.id) > 0
  );
  
  // Check if we've reached the limit (2 out of 4)
  const maxCovenSkills = 2; // CHARACTER_CONFIG.MAX_COVEN_SKILLS
  if (exclusiveCovenSkillsWithPoints.length >= maxCovenSkills) {
    return { 
      blocked: true, 
      reason: `Cannot allocate points to more than ${maxCovenSkills} of these Coven skills: Living Flame, Warp Armor, Snow Queen, Vengeful Power.` 
    };
  }
  
  return { blocked: false, reason: '' };
}

/**
 * Handle skill point changes (add or remove)
 */
function handleSkillPointChange(skill, delta, characterLevel) {
    const db = getDatabase();
    
    // Handle multiple points
    if (Math.abs(delta) > 1) {
        let pointsChanged = 0;
        const direction = delta > 0 ? 1 : -1;
        const targetPoints = Math.abs(delta);
        
        for (let i = 0; i < targetPoints; i++) {
            const skillLevels = getAllSkillPoints();
            const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
            
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
            }
            pointsChanged++;
        }
        
        // Trigger re-render after all points are processed
        window.dispatchEvent(new CustomEvent('skillPointsChanged'));
        return;
    }
    
    // Handle single point
    const skillLevels = getAllSkillPoints();
    const effectiveMaxLevel = db ? calculateMaxLevel(skill.skillId, skillLevels, characterLevel, db) : skill.baseMaxLevel;
    
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
            <div class="columns mx-1">
                <div class="column">
                    <label class="checkbox">
                        <input type="checkbox" id="difficultyNormal" checked>
                        Normal
                    </label>
                </div>
                <div class="column">
                    <label class="checkbox">
                        <input type="checkbox" id="difficultyNightmare" checked>
                        Nightmare
                    </label>
                </div>
                <div class="column">
                    <label class="checkbox">
                        <input type="checkbox" id="difficultyHell" checked>
                        Hell
                    </label>
                </div>
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
