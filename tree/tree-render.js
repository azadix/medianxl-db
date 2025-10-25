// Skills rendering and grid layout functionality
import { setCurrentTab } from './tree-core.js';
import Innate from '../skills/Innate.js';
import { getDatabase } from './tree-data.js';
import { getSkillPoints, getAllSkillPoints, getMinimumRequiredLevel, calculateEffectiveMaxLevel, getSkillRestrictions, canAllocateSkillPoints, addSkillPoint, removeSkillPoint, addSkillPointsBatch, removeSkillPointsBatch } from '../character/character-state.js';
import { getSkillIconHTML } from '../utils.js';
import { ToastManager } from './ToastManager.js';

// Store current skills list for dependency checking
let currentSkillsList = [];

// Arrow exclusions: arrows that should NOT be drawn
// Format: { from: 'source_skill_display_name', to: 'target_skill_display_name' }
const ARROW_EXCLUSIONS = [
    { from: 'Shockwave Trap', to: 'Artifice Mastery' },
    { from: 'Catalyst Trap', to: 'Artifice Mastery' },
    { from: 'Heart of Stone', to: 'Aftermath' },
    { from: 'Blood Magic', to: 'Fire Elementals' },
    { from: 'Blood Magic', to: 'Crimson Rite' }
];

// Initialize ToastManager
const toastManager = new ToastManager();

/**
 * Update skill cards without redrawing arrows
 * This is more efficient for character level changes and skill point updates
 * Now uses unified services for both regular skills and oSkills
 */
function updateSkillCards(selectedClass, skillsList) {
    // Get all skill cards (including oSkills)
    const allCards = document.querySelectorAll('.skill-card');
    
    // Calculate minimum required level once for all cards
    const db = getDatabase();
    const minLevel = getMinimumRequiredLevel(db);
    const skillLevels = getAllSkillPoints();
    
    // Track which tabs have points
    const tabsWithPoints = new Set();
    
    allCards.forEach(card => {
        // Get skill ID from the card's button (if it exists)
        const plusBtn = card.querySelector('.skill-plus-btn');
        if (!plusBtn) return;
        
        const skillId = plusBtn.dataset.skill;
        
        // Check if this is an oSkill (in oSkills tab)
        const isOSkill = card.closest('#tab-oSkills') !== null;
        
        if (isOSkill) {
            // Handle oSkill update
            // oSkills are updated separately via updateOSkillsTab() in tree-core.js
            // But we still track tab highlights
            return;
        }
        
        // Regular skill update
        const skill = skillsList.find(s => s.id === skillId);
        if (!skill) return;
        
        // Get current points
        const currentPoints = getSkillPoints(skillId);
        
        // Track tabs with points
        if (currentPoints > 0 && skill.tabName) {
            tabsWithPoints.add(skill.tabName);
        }
        
        // Skip innate skills
        if (Innate.isInnateSkill(skill)) {
            return;
        }
        
        // Calculate effective max level
        const effectiveMaxLevel = calculateEffectiveMaxLevel(
            skill.skillId,
            'regular',
            skillLevels,
            minLevel,
            db
        ) || skill.baseMaxLevel;
        
        // Get restrictions
        const restrictions = getSkillRestrictions(
            skill,
            'regular',
            currentPoints,
            currentSkillsList,
            skillLevels,
            db
        );
        
        const canAllocate = canAllocateSkillPoints(
            skill,
            'regular',
            currentPoints,
            effectiveMaxLevel,
            currentSkillsList,
            skillLevels,
            db
        );
        
        // Update the level display
        const levelDisplay = card.querySelector('.is-size-6');
        if (levelDisplay) {
            const isMaxed = currentPoints >= effectiveMaxLevel;
            const levelColor = isMaxed ? 'has-text-warning' : 'has-text-grey';
            levelDisplay.className = `${levelColor} is-size-6`;
            levelDisplay.textContent = `${currentPoints} / ${effectiveMaxLevel}`;
        }
        
        // Update button states
        const minusBtn = card.querySelector('.skill-minus-btn');
        if (plusBtn && minusBtn) {
            // Build tooltip message from restrictions
            const tooltipMessage = restrictions.length > 0 ? restrictions[0].reason : '';
            
            // Update + button
            const plusDisabled = !canAllocate || currentPoints >= effectiveMaxLevel;
            plusBtn.disabled = plusDisabled;
            plusBtn.className = `button is-outlined is-small ${plusDisabled ? 'is-ghost' : 'is-success'} skill-plus-btn`;
            plusBtn.dataset.warningMessage = tooltipMessage;
            
            // Update - button
            const minusDisabled = currentPoints === 0;
            minusBtn.disabled = minusDisabled;
            minusBtn.className = `button is-outlined is-small ${minusDisabled ? 'is-ghost' : 'is-danger'} skill-minus-btn`;
        }
    });
    
    // Check if oSkills tab should be highlighted
    if (window.oSkills && (
        Array.isArray(window.oSkills) ? window.oSkills.length > 0 : Object.keys(window.oSkills).length > 0
    )) {
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
    if (window.oSkills && (
        Array.isArray(window.oSkills) ? window.oSkills.length > 0 : Object.keys(window.oSkills).length > 0
    )) {
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
        oskillPanel.style.display = 'flex';
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
                        oskillPanel.style.display = shouldShow ? 'flex' : 'none';
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
/**
 * Handle skill point change (consolidated from SkillTreeController)
 * @param {Object} skill - Skill object
 * @param {number} delta - Points to add (positive) or remove (negative)
 * @param {Array} allSkills - Array of all skills (for validation)
 */
function handleSkillPointChange(skill, delta, allSkills = []) {
    const db = getDatabase();
    const minLevel = getMinimumRequiredLevel(db);
    const skillLevels = getAllSkillPoints();
    
    // Calculate max level for validation
    const effectiveMaxLevel = calculateEffectiveMaxLevel(
        skill.skillId,
        'regular',
        skillLevels,
        minLevel,
        db
    ) || skill.baseMaxLevel;

    // Handle multiple points (shift/ctrl clicks) - use batch operations for performance
    if (Math.abs(delta) > 1) {
        const targetPoints = Math.abs(delta);
        
        if (delta > 0) {
            // Adding points - need to recalculate max level function for self-scaling skills
            const getMaxLevelFn = () => {
                const currentSkillLevels = getAllSkillPoints();
                return calculateEffectiveMaxLevel(
                    skill.skillId,
                    'regular',
                    currentSkillLevels,
                    minLevel,
                    db
                ) || skill.baseMaxLevel;
            };
            
            const result = addSkillPointsBatch(skill.id, skill, targetPoints, allSkills, getMaxLevelFn);
            
            if (!result.success && result.pointsAdded === 0) {
                toastManager.showToast(result.reason, true);
            }
        } else {
            // Removing points
            const result = removeSkillPointsBatch(skill.id, targetPoints, allSkills);
            
            if (!result.success && result.pointsRemoved === 0) {
                toastManager.showToast(result.reason, true);
            }
        }
        return;
    }
    
    // Handle single point
    let result;
    if (delta > 0) {
        result = addSkillPoint(skill.id, skill, effectiveMaxLevel, allSkills);
    } else {
        result = removeSkillPoint(skill.id, allSkills);
    }
    
    if (!result.success) {
        toastManager.showToast(result.reason, true);
    }
}

/**
 * Build card data for a regular skill (consolidated from SkillTreeController)
 * @param {Object} skill - Skill object
 * @param {Array} allSkills - Array of all skills
 * @param {Function} getIconFn - Function to get icon HTML
 * @returns {Object} Card data object
 */
function buildSkillCardData(skill, allSkills = [], getIconFn = null) {
    const currentPoints = getSkillPoints(skill.id);
    const db = getDatabase();
    const minLevel = getMinimumRequiredLevel(db);
    const skillLevels = getAllSkillPoints();
    
    const effectiveMaxLevel = calculateEffectiveMaxLevel(
        skill.skillId,
        'regular',
        skillLevels,
        minLevel,
        db
    ) || skill.baseMaxLevel;
    
    const restrictions = getSkillRestrictions(
        skill,
        'regular',
        currentPoints,
        allSkills,
        skillLevels,
        db
    );
    
    const canAllocate = canAllocateSkillPoints(
        skill,
        'regular',
        currentPoints,
        effectiveMaxLevel,
        allSkills,
        skillLevels,
        db
    );
    
    return {
        skillId: skill.id,
        displayName: skill.name,
        iconHTML: getIconFn ? getIconFn(skill.image, skill.class) : '',
        hasDescription: skill.hasDetails || false,
        currentPoints: currentPoints,
        maxPoints: effectiveMaxLevel,
        canAllocate: canAllocate,
        restrictions: restrictions,
        isInnate: false
    };
}

/**
 * Build card data for an oSkill (consolidated from SkillTreeController)
 * @param {Object} oskill - oSkill object
 * @param {Function} getIconFn - Function to get icon HTML
 * @returns {Object} Card data object
 */
export function buildOSkillCardData(oskill, getIconFn = null) {
    const skillLevels = {};
    const db = getDatabase();
    const currentPoints = oskill.points || 0;
    
    const maxPoints = calculateEffectiveMaxLevel(
        oskill.skillId || oskill.skillName,
        'oskill',
        skillLevels,
        1, // oSkills don't use character level
        db
    );
    
    const restrictions = getSkillRestrictions(
        oskill,
        'oskill',
        currentPoints,
        [],
        skillLevels,
        db
    );
    
    const canAllocate = canAllocateSkillPoints(
        oskill,
        'oskill',
        currentPoints,
        maxPoints,
        [],
        skillLevels,
        db
    );
    
    return {
        skillId: oskill.skillId || oskill.skillName,
        displayName: oskill.displayName || oskill.skillName || `Skill ${oskill.skillId}`,
        iconHTML: getIconFn ? getIconFn(oskill.image, oskill.className) : '',
        hasDescription: oskill.hasDetails || false,
        currentPoints: currentPoints,
        maxPoints: maxPoints,
        canAllocate: canAllocate,
        restrictions: restrictions,
        isInnate: false
    };
}

function createSkillCard(skill, currentTab) {
    // Build card data
    let cardData;
    
    if (Innate.isInnateSkill(skill)) {
        // Skills that cannot have points added - always level 1
        cardData = {
            skillId: skill.id,
            displayName: skill.name,
            iconHTML: getSkillIcon(skill.image, skill.class),
            hasDescription: skill.hasDetails || false,
            currentPoints: 1,
            maxPoints: 1,
            canAllocate: false,
            restrictions: [],
            isInnate: true
        };
    } else {
        // Build card data for regular skills
        cardData = buildSkillCardData(skill, currentSkillsList, getSkillIcon);
    }
    
    // Render card
    const card = renderSkillCard(cardData);
    
    // Add event listeners if skill can have points
    if (!Innate.isInnateSkill(skill)) {
        const plusBtn = card.querySelector('.skill-plus-btn');
        const minusBtn = card.querySelector('.skill-minus-btn');
        
        if (plusBtn && minusBtn) {
            // Get restriction message
            const tooltipMessage = cardData.restrictions.length > 0 
                ? cardData.restrictions[0].reason 
                : '';
            plusBtn.dataset.warningMessage = tooltipMessage;
            
            // Add event listeners
            plusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    handleSkillPointChange(skill, 25, currentSkillsList);
                } else {
                    handleSkillPointChange(skill, 1, currentSkillsList);
                }
            });
            
            minusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    handleSkillPointChange(skill, -25, currentSkillsList);
                } else {
                    handleSkillPointChange(skill, -1, currentSkillsList);
                }
            });
        }
    }
    
    return card;
}

// handleSkillPointChange is now defined above in createSkillCard section

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

// Arrow rendering functions

/**
 * Add overlay arrows to show skill prerequisites
 * @param {HTMLElement} contentDiv - The grid container for skills
 * @param {Array} skillsInTab - Array of skills in the current tab
 * @param {number} minRow - Minimum row index
 * @param {number} minCol - Minimum column index
 * @param {Array} allClassSkills - All skills for the current class
 */
export function addOverlayArrows(contentDiv, skillsInTab, minRow, minCol, allClassSkills) {
    // Find skills with prerequisites
    const skillsWithPrereqs = skillsInTab.filter(skill => 
        skill.prerequisites && skill.prerequisites.length > 0
    );

    skillsWithPrereqs.forEach(skill => {
        skill.prerequisites.forEach(prereq => {
            const [type, value, target] = prereq.split(':');
            
            if (type === 'skill_level' && target) {
                // Find the prerequisite skill in the same class AND same tab
                const prereqSkill = allClassSkills.find(s => s.name === target && s.class === skill.class && s.tab === skill.tab);
                if (prereqSkill) {
                    // Check if this arrow is excluded
                    const isExcluded = ARROW_EXCLUSIONS.some(exclusion => 
                        exclusion.from === prereqSkill.name && exclusion.to === skill.name
                    );
                    
                    if (!isExcluded) {
                        createOverlayArrow(contentDiv, prereqSkill, skill, minRow, minCol, skillsInTab);
                    }
                }
            }
        });
    });
}

function createOverlayArrow(contentDiv, fromSkill, toSkill, minRow, minCol, skillsInTab) {
    // Calculate positions relative to the grid
    const fromRow = fromSkill.row - minRow + 1;
    const fromCol = fromSkill.col - minCol + 1;
    const toRow = toSkill.row - minRow + 1;
    const toCol = toSkill.col - minCol + 1;

    // Find skill cards by looking for elements with the correct grid position
    const allCards = contentDiv.querySelectorAll('.skill-card, .empty-skill-card');
    let fromCard = null;
    let toCard = null;
    
    allCards.forEach(card => {
        // Check if using grid-area format (e.g., "1 / 2")
        const gridArea = card.style.gridArea;
        let gridRow, gridCol;
        
        if (gridArea && gridArea.includes('/')) {
            const parts = gridArea.split('/');
            gridRow = parseInt(parts[0].trim());
            gridCol = parseInt(parts[1].trim());
        } else {
            // Fallback to grid-row and grid-column
            gridRow = parseInt(card.style.gridRow);
            gridCol = parseInt(card.style.gridColumn);
        }
        
        if (gridRow === fromRow && gridCol === fromCol) {
            fromCard = card;
        }
        if (gridRow === toRow && gridCol === toCol) {
            toCard = card;
        }
    });
    
    if (!fromCard || !toCard) {
        return;
    }
    
    // Get the actual positions of the skill cards
    const fromRect = fromCard.getBoundingClientRect();
    const toRect = toCard.getBoundingClientRect();
    const gridRect = contentDiv.getBoundingClientRect();
    
    // Calculate center positions relative to the grid container
    const fromX = fromRect.left + fromRect.width / 2 - gridRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - gridRect.top;
    const toX = toRect.left + toRect.width / 2 - gridRect.left;
    const toY = toRect.top + toRect.height / 2 - gridRect.top;
    
    // Calculate arrow direction and position
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                
    // Calculate arrow position (midpoint between skills)
    const arrowX = (fromX + toX) / 2;
    const arrowY = (fromY + toY) / 2;
    
    // Calculate rotation angle (point from prerequisite to dependent skill)
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    
    // Create SVG line with arrowhead
    const arrow = document.createElement('div');
    arrow.className = 'overlay-arrow';
    arrow.style.position = 'absolute';
    arrow.style.left = '0';
    arrow.style.top = '0';
    arrow.style.width = '100%';
    arrow.style.height = '100%';
    arrow.style.pointerEvents = 'none';
    arrow.style.zIndex = '10';

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';

    // Calculate intersection points with card edges
    const cardWidth = 210;
    const cardHeight = 105;

    function getIntersectionPoint(centerX, centerY, targetX, targetY, cardWidth, cardHeight) {
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) {
            return { x: centerX, y: centerY };
        }
        
        const unitX = dx / length;
        const unitY = dy / length;

        const halfW = cardWidth / 2;
        const halfH = cardHeight / 2;

        const intersections = [];

        // Top edge (y = centerY - halfH)
        if (unitY !== 0) {
            const t = (-halfH) / unitY;
            if (t > 0) {
                const x = centerX + t * unitX;
                if (x >= centerX - halfW && x <= centerX + halfW) {
                    intersections.push({ x, y: centerY - halfH, t });
                }
            }
        }

        // Bottom edge (y = centerY + halfH)
        if (unitY !== 0) {
            const t = (halfH) / unitY;
            if (t > 0) {
                const x = centerX + t * unitX;
                if (x >= centerX - halfW && x <= centerX + halfW) {
                    intersections.push({ x, y: centerY + halfH, t });
                }
            }
        }

        // Left edge (x = centerX - halfW)
        if (unitX !== 0) {
            const t = (-halfW) / unitX;
            if (t > 0) {
                const y = centerY + t * unitY;
                if (y >= centerY - halfH && y <= centerY + halfH) {
                    intersections.push({ x: centerX - halfW, y, t });
                }
            }
        }

        // Right edge (x = centerX + halfW)
        if (unitX !== 0) {
            const t = (halfW) / unitX;
            if (t > 0) {
                const y = centerY + t * unitY;
                if (y >= centerY - halfH && y <= centerY + halfH) {
                    intersections.push({ x: centerX + halfW, y, t });
                }
            }
        }

        // Return the closest intersection point
        if (intersections.length > 0) {
            const closest = intersections.reduce((min, curr) => curr.t < min.t ? curr : min);
            return { x: closest.x, y: closest.y };
        }

        // Fallback to center if no intersection found
        return { x: centerX, y: centerY };
    }

    const startPoint = getIntersectionPoint(fromX, fromY, toX, toY, cardWidth, cardHeight);
    const endPoint = getIntersectionPoint(toX, toY, fromX, fromY, cardWidth, cardHeight);

    // Adjust for stroke width and arrowhead
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Check for zero length (same start and end points) - skip arrow creation
    if (length === 0) {
        return;
    }
    
    const unitX = dx / length;
    const unitY = dy / length;

    // Don't adjust start point (let it touch the card edge)
    const startX = startPoint.x;
    const startY = startPoint.y;
    // Pull end point inward more to account for arrowhead and stroke width
    const endPadding = 4; // pixels to account for 3.75px stroke + arrowhead
    const endX = endPoint.x - unitX * endPadding;
    const endY = endPoint.y - unitY * endPadding;

    // Create line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke', '#8a8a8a');
    line.setAttribute('stroke-width', '3.75');
    line.setAttribute('stroke-linecap', 'round');

    // Create arrowhead marker (wider to match thicker lines, shorter height)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `arrowhead-${Date.now()}-${Math.random()}`);
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '3.5');
    marker.setAttribute('refY', '2');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 5 2, 0 4');
    polygon.setAttribute('fill', '#8a8a8a');

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Add arrowhead to line
    line.setAttribute('marker-end', `url(#${marker.getAttribute('id')})`);

    svg.appendChild(line);
    arrow.appendChild(svg);

    contentDiv.appendChild(arrow);
}

// Skill card rendering functions

/**
 * Render a skill card with consistent styling
 * @param {Object} cardData - Card data object with skillId, displayName, iconHTML, currentPoints, maxPoints, etc.
 * @returns {HTMLElement} The skill card element
 */
export function renderSkillCard(cardData) {
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.dataset.skillId = cardData.skillId;
    
    // Build card HTML
    let html = '';
    
    // Section 1: Top row (left spacer | icon | buttons container)
    html += '<div class="skill-card-header">';
    html += '<div class="skill-card-spacer"></div>'; // Left spacer for centering
    html += `<div class="skill-card-icon">${cardData.iconHTML}</div>`;
    html += '<div class="skill-buttons-container"></div>';
    html += '</div>';
    
    // Section 2: Skill name
    html += '<div class="skill-card-name">';
    // Style name as link if skill has description, but don't make it clickable
    const nameClass = cardData.hasDescription ? 'has-text-info' : '';
    html += `<span class="${nameClass}">${cardData.displayName}</span>`;
    html += '</div>';
    
    // Section 3: Level display
    html += '<div class="skill-card-level">';
    const levelColor = getLevelColorClass(cardData.currentPoints || 0, cardData.maxPoints || 0);
    html += `<div class="${levelColor} is-size-6">${cardData.currentPoints || 0} / ${cardData.maxPoints || 0}</div>`;
    html += '</div>';
    
    card.innerHTML = html;
    
    // Add buttons if skill is not innate
    if (!cardData.isInnate) {
        const buttonsContainer = card.querySelector('.skill-buttons-container');
        if (buttonsContainer) {
            const plusDisabled = !canAddPoints(cardData.canAllocate, cardData.currentPoints || 0, cardData.maxPoints || 0);
            const minusDisabled = (cardData.currentPoints || 0) === 0;
            const plusClass = plusDisabled ? 'is-ghost' : 'is-success';
            const minusClass = minusDisabled ? 'is-ghost' : 'is-danger';
            const plusDisabledAttr = plusDisabled ? 'disabled' : '';
            const minusDisabledAttr = minusDisabled ? 'disabled' : '';
            const plusTooltip = getRestrictionMessage(cardData.restrictions) || '';
            
            buttonsContainer.innerHTML = `
                <div class="skill-buttons">
                    <button class="button is-outlined is-small ${plusClass} skill-plus-btn" 
                            data-skill="${cardData.skillId}" 
                            ${plusDisabledAttr} 
                            title="${plusTooltip}">+</button>
                    <button class="button is-outlined is-small ${minusClass} skill-minus-btn" 
                            data-skill="${cardData.skillId}" 
                            ${minusDisabledAttr}>−</button>
                </div>
            `;
        }
    }
    
    return card;
}

/**
 * Get level color class for display
 * @param {number} currentPoints - Current skill points
 * @param {number} maxPoints - Maximum skill points
 * @returns {string} CSS class name
 */
export function getLevelColorClass(currentPoints, maxPoints) {
    return currentPoints >= maxPoints ? 'has-text-warning' : 'has-text-grey';
}

/**
 * Check if skill can have points added
 * @param {boolean} canAllocate - Whether skill can allocate points
 * @param {number} currentPoints - Current skill points
 * @param {number} maxPoints - Maximum skill points
 * @returns {boolean}
 */
export function canAddPoints(canAllocate, currentPoints, maxPoints) {
    return canAllocate && currentPoints < maxPoints;
}

/**
 * Get restriction message from restrictions array
 * @param {Array} restrictions - Array of restriction objects
 * @returns {string} Restriction message
 */
export function getRestrictionMessage(restrictions) {
    if (restrictions && restrictions.length > 0) {
        return restrictions[0].reason || '';
    }
    return '';
}

/**
 * Get icon HTML for a skill
 * @param {string} image - Image filename
 * @param {string} className - Class name for the skill
 * @returns {string} HTML for the skill icon
 */
export function getSkillIcon(image, className) {
    return getSkillIconHTML(image, className, '', window.SkillDB?.db);
}
