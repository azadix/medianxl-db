// Tooltip functionality for skill tree
import { getSkillIconHTML, expandPlaceholdersWithScaling, SKILL_CATEGORY_TAG_IDS, SUMMON_TAG_IDS, TELEPORT_TAG_IDS, isLocalhost } from '../utils.js';
import { getDatabase } from './tree-data.js';
import { getSkillPoints, getOSkillPoints, getAllSkillPoints, getAllOSkills, getTreeSkillsCache, getAllStats } from '../character/character-state.js';
import { getCurrentVersionId } from '../version-config.js';
import Innate from '../skills/Innate.js';

let tooltipElement = null;
let currentHoveredSkill = null;
let lastMouseX = 0;
let lastMouseY = 0;
let tooltipHideTimeout = null;
let ctrlKeyPressed = false;

/**
 * Initialize tooltip functionality
 * Creates the tooltip element and attaches event listeners
 */
export function initializeTooltip() {
    // Create tooltip element
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'skill-tooltip';
    tooltipElement.style.display = 'none';
    document.body.appendChild(tooltipElement);

    // Add event delegation for skill card images
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
    
    // Track Ctrl key for formula display (localhost only)
    // Using Ctrl to avoid conflicts with browser shortcuts (Alt+click, Alt+Tab, etc.)
    if (isLocalhost()) {
        document.addEventListener('keydown', (e) => {
            // Track Ctrl key (either left or right)
            if (e.key === 'Control' || e.ctrlKey) {
                if (!ctrlKeyPressed) {
                    ctrlKeyPressed = true;
                    // Refresh tooltip if showing
                    if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
                        handleSkillPointsChanged();
                    }
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            // Track Ctrl key release
            if (e.key === 'Control' || (!e.ctrlKey && ctrlKeyPressed)) {
                if (ctrlKeyPressed) {
                    ctrlKeyPressed = false;
                    // Refresh tooltip if showing
                    if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
                        handleSkillPointsChanged();
                    }
                }
            }
        });
        
        // Handle window blur (when Alt+Tab switches windows)
        window.addEventListener('blur', () => {
            if (ctrlKeyPressed) {
                ctrlKeyPressed = false;
                // Refresh tooltip if showing
                if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
                    handleSkillPointsChanged();
                }
            }
        });
    }
    
    // Listen for skill point changes to update tooltip if it's showing
    window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
    
    // Listen for tooltip refresh events (triggered after minLevelDisplay is updated)
    window.addEventListener('tooltipRefresh', handleSkillPointsChanged);
    
    // Listen for oSkills updates to hide tooltip if skill was removed
    window.addEventListener('oskillsUpdated', handleOSkillsUpdated);
}

/**
 * Handle mouse over events on skill images
 */
async function handleMouseOver(e) {
    // Check if hovering over a skill card or its children
    const skillCard = e.target.closest('.skill-card');
    if (!skillCard) return;
    
    // Get skill ID from the card's data attribute
    const skillId = skillCard.dataset.skillId;
    if (!skillId) return;
    
    // Update Ctrl key state from mouse event (localhost only)
    if (isLocalhost()) {
        ctrlKeyPressed = e.ctrlKey;
    }
    
    // Clear any pending hide timeout
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    
    currentHoveredSkill = skillId;
    await showTooltip(skillId, e.clientX, e.clientY, skillCard);
}

/**
 * Handle mouse out events
 */
function handleMouseOut(e) {
    const skillCard = e.target.closest('.skill-card');
    if (!skillCard) return;
    
    // Only hide if we're leaving the skill card entirely
    const relatedTarget = e.relatedTarget;
    if (relatedTarget && skillCard.contains(relatedTarget)) {
        return; // Still hovering within the same skill card
    }
    
    // Hide tooltip immediately
    hideTooltip();
    currentHoveredSkill = null;
}

/**
 * Handle mouse move to update tooltip position
 */
function handleMouseMove(e) {
    if (tooltipElement && tooltipElement.style.display !== 'none') {
        updateTooltipPosition(e.clientX, e.clientY);
        
        // Check if Ctrl key state changed and refresh tooltip if needed (localhost only)
        if (isLocalhost()) {
            const wasCtrlPressed = ctrlKeyPressed;
            const isCtrlPressedNow = e.ctrlKey;
            
            // If Ctrl state changed, refresh the tooltip
            if (wasCtrlPressed !== isCtrlPressedNow) {
                ctrlKeyPressed = isCtrlPressedNow;
                if (currentHoveredSkill) {
                    handleSkillPointsChanged();
                }
            }
        }
    }
}

/**
 * Handle skill points changed event to update tooltip if showing
 */
async function handleSkillPointsChanged() {
    // If tooltip is showing for a skill, refresh it
    if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
        const db = getDatabase();
        if (!db) return;
        
        const skillData = getSkillDataFromDB(db, currentHoveredSkill);
        if (!skillData) return;
        
        // Check if this is an oSkill
        // Note: There might be multiple cards with same skill ID (regular tree + oSkills)
        const allSkillCards = document.querySelectorAll(`.skill-card[data-skill-id="${currentHoveredSkill}"]`);
        let skillCard = null;
        let isOSkill = false;
        
        // Find the correct card - prefer oSkills tab if it exists there
        allSkillCards.forEach(card => {
            if (card.closest('#tab-oSkills')) {
                skillCard = card;
                isOSkill = true;
            } else if (!skillCard) {
                // Use regular skill card as fallback
                skillCard = card;
            }
        });
        
        // Check if this is an innate skill (they're always level 1)
        const isInnate = skillCard && skillData && Innate.isInnateSkill({ name: skillData.id, canAddPoints: skillData.canAddPoints });
        
        const currentLevel = isOSkill 
            ? Math.max(1, getOSkillPoints(currentHoveredSkill))
            : isInnate
            ? 1
            : getSkillPoints(currentHoveredSkill);
        
        // Get warning message from the skill card's plus button (if any)
        // Skip warning for oSkills (they only have 150 level cap)
        let warningMessage = '';
        if (!isOSkill) {
            const plusBtn = skillCard?.querySelector('.skill-plus-btn');
            warningMessage = plusBtn?.dataset?.warningMessage || '';
        }
        
        const content = await buildTooltipContent(skillData, currentLevel, db, warningMessage, isOSkill);
        
        tooltipElement.innerHTML = content;
    }
}

/**
 * Handle oSkills updated event to refresh or hide tooltip
 */
async function handleOSkillsUpdated() {
    // If we're hovering over an oSkill, refresh the tooltip to show updated values
    if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
        const skillCard = document.querySelector(`.skill-card[data-skill-id="${currentHoveredSkill}"]`);
        const isOSkill = skillCard && skillCard.closest('#tab-oSkills');
        
        if (isOSkill) {
            // Skill still exists, refresh tooltip (same logic as handleSkillPointsChanged)
            const db = getDatabase();
            if (!db) return;
            
            const skillData = getSkillDataFromDB(db, currentHoveredSkill);
            if (!skillData) return;
            
            // Check if this is an oSkill
            const allSkillCards = document.querySelectorAll(`.skill-card[data-skill-id="${currentHoveredSkill}"]`);
            let activeSkillCard = null;
            let isOSkillCard = false;
            
            // Find the correct card - prefer oSkills tab if it exists there
            allSkillCards.forEach(card => {
                if (card.closest('#tab-oSkills')) {
                    activeSkillCard = card;
                    isOSkillCard = true;
                } else if (!activeSkillCard) {
                    activeSkillCard = card;
                }
            });
            
            // Check if this is an innate skill (they're always level 1)
            const isInnate = activeSkillCard && skillData && Innate.isInnateSkill({ name: skillData.id, canAddPoints: skillData.canAddPoints });
            
            const currentLevel = isOSkillCard 
                ? Math.max(1, getOSkillPoints(currentHoveredSkill))
                : isInnate
                ? 1
                : getSkillPoints(currentHoveredSkill);
            
            // Get warning message from the skill card's plus button (if any)
            // Skip warning for oSkills (they only have 150 level cap)
            let warningMessage = '';
            if (!isOSkillCard) {
                const plusBtn = activeSkillCard?.querySelector('.skill-plus-btn');
                warningMessage = plusBtn?.dataset?.warningMessage || '';
            }
            
            const content = await buildTooltipContent(skillData, currentLevel, db, warningMessage, isOSkillCard);
            tooltipElement.innerHTML = content;
            return;
        }
    }
    
    // Otherwise, hide tooltip (skill was removed or not an oSkill)
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    
    hideTooltip();
    currentHoveredSkill = null;
}

/**
 * Show tooltip for a skill
 * @param {string} skillId - Internal skill name
 * @param {number} mouseX - Mouse X position
 * @param {number} mouseY - Mouse Y position
 * @param {HTMLElement} hoveredCard - The actual card element being hovered (optional)
 */
async function showTooltip(skillId, mouseX, mouseY, hoveredCard = null) {
    // Store mouse coordinates for potential tooltip refresh
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    const db = getDatabase();
    if (!db) {
        console.warn('Tooltip: Database not loaded yet');
        return;
    }
    
    // Get skill data from database
    const skillData = getSkillDataFromDB(db, skillId);
    if (!skillData) {
        console.warn('Tooltip: No skill data found for', skillId);
        return;
    }
    
    // Use the provided card or search for it
    let skillCard = hoveredCard;
    if (!skillCard) {
        skillCard = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`);
    }
    
    // Check if this is an oSkill
    const isOSkill = skillCard && skillCard.closest('#tab-oSkills');
    
    // Check if this is an innate skill (they're always level 1)
    const isInnate = skillCard && Innate.isInnateSkill({ name: skillData.id, canAddPoints: skillData.canAddPoints });
    
    const currentLevel = isOSkill 
        ? Math.max(1, getOSkillPoints(skillId))
        : isInnate
        ? 1
        : getSkillPoints(skillId);
    
    // Get warning message from the skill card's plus button (if any)
    // Skip warning for oSkills (they only have 150 level cap)
    let warningMessage = '';
    if (!isOSkill) {
        const plusBtn = skillCard?.querySelector('.skill-plus-btn');
        warningMessage = plusBtn?.dataset?.warningMessage || '';
    }
    
    // Build tooltip content
    const content = await buildTooltipContent(skillData, currentLevel, db, warningMessage, isOSkill);
    
    // Update tooltip
    tooltipElement.innerHTML = content;
    tooltipElement.style.display = 'block';
    updateTooltipPosition(mouseX, mouseY);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
}

/**
 * Refresh current tooltip (useful when All Skills bonus changes)
 */
export function refreshCurrentTooltip() {
    if (currentHoveredSkill) {
        showTooltip(currentHoveredSkill, lastMouseX, lastMouseY);
    }
}

/**
 * Update tooltip position to follow mouse
 */
function updateTooltipPosition(mouseX, mouseY) {
    if (!tooltipElement) return;
    
    const offset = 15; // Offset from cursor
    const tooltipRect = tooltipElement.getBoundingClientRect();
    
    let left = mouseX + offset;
    let top = mouseY + offset;
    
    // Prevent tooltip from going off-screen to the right
    if (left + tooltipRect.width > window.innerWidth) {
        left = mouseX - tooltipRect.width - offset;
    }
    
    // Prevent tooltip from going off-screen at the bottom
    if (top + tooltipRect.height > window.innerHeight) {
        top = mouseY - tooltipRect.height - offset;
    }
    
    // Ensure tooltip doesn't go off-screen to the left
    if (left < 0) {
        left = offset;
    }
    
    // Ensure tooltip doesn't go off-screen at the top
    if (top < 0) {
        top = offset;
    }
    
    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

/**
 * Get skill data from database
 */
function getSkillDataFromDB(db, skillId) {
    try {
        // Get active version ID
        const versionId = getCurrentVersionId(db);
        if (!versionId) {
            console.error('No active version found');
            return null;
        }
        
        // Check if skillId is numeric (skill ID) or string (skill name)
        const isNumericId = /^\d+$/.test(skillId);
        const whereClause = isNumericId ? 'WHERE s.id = ? AND s.version_id = ?' : 'WHERE s.name = ? AND s.version_id = ?';
        
        const stmt = db.prepare(`
            SELECT s.id, s.name, s.display_name, s.description, s.skill_effect, s.restriction, s.image,
                   c.name AS class_name,
                   sml.base_max_level, sml.affected_by_specialization, sml.can_add_points
            FROM skills s
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN skill_max_levels sml ON s.id = sml.skill_id AND sml.version_id = ?
            ${whereClause}
        `);
        
        stmt.bind([versionId, isNumericId ? parseInt(skillId) : skillId, versionId]);
        
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return {
                dbId: row.id,
                id: row.name,
                displayName: row.display_name,
                description: row.description,
                skillEffect: row.skill_effect,
                restriction: row.restriction,
                image: row.image,
                className: row.class_name,
                baseMaxLevel: row.base_max_level,
                affectedBySpecialization: row.affected_by_specialization === 1,
                canAddPoints: row.can_add_points === 1
            };
        }
        stmt.free();
    } catch (error) {
        console.error('Error fetching skill data for tooltip:', error);
    }
    return null;
}

/**
 * Get skill category tags for a skill
 * @param {Object} db - Database instance
 * @param {number} skillId - Skill database ID
 * @returns {Array<string>} Array of tag names
 */
function getSkillCategoryTags(db, skillId) {
    if (!db) return [];
    
    try {
        // Combine all relevant tag IDs
        const allTagIds = [...SKILL_CATEGORY_TAG_IDS, ...SUMMON_TAG_IDS, ...TELEPORT_TAG_IDS];
        
        const res = db.exec(`
            SELECT st.name
            FROM skill_skilltags sst
            JOIN skilltags st ON sst.tag_id = st.id
            WHERE sst.skill_id = ? AND st.id IN (${allTagIds.join(',')})
            ORDER BY st.name
        `, [skillId]);
        
        if (res[0] && res[0].values.length > 0) {
            return res[0].values.map(row => row[0]);
        }
    } catch (error) {
        console.warn('Error fetching skill tags:', error);
    }
    
    return [];
}

/**
 * Build tooltip HTML content
 * @param {Object} skillData - Skill data from database
 * @param {number} level - Current skill level
 * @param {Object} db - Database instance
 * @param {string} warningMessage - Optional warning message (e.g., prerequisite not met)
 */
async function buildTooltipContent(skillData, level, db, warningMessage = '', isOSkill = false) {
    // Get All Skills bonus for effective level calculation (used in multiple places)
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    const allSkillsBonus = allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
    // For oSkills, cap effective level at 150 (points + bonus combined)
    const effectiveLevel = isOSkill 
        ? Math.min(150, level + allSkillsBonus)
        : level + allSkillsBonus;
    
    let html = '<div class="tooltip-content">';
    
    // Skill name and icon
    html += '<div class="tooltip-header">';
    html += `<div class="tooltip-icon">${getSkillIconHTML(skillData.image, skillData.className, 'is-64x64', window.SkillDB?.db)}</div>`;
    
    // Skill category tags (if any)
    let tagsHtml = ''
    const tags = getSkillCategoryTags(db, skillData.dbId);
    if (tags.length > 0) {
        tagsHtml += '<p class="is-size-7 has-text-weight-bold has-text-grey-lighter">';
        tagsHtml += tags.join(', ');
        tagsHtml += '</p>';
    }

    html += `<div class="tooltip-name-container">
                <div class="tooltip-name-section">
                    <div class="is-size-4 has-text-weight-bold">
                        ${skillData.displayName}
                        ${tagsHtml}
                    </div>
                </div>
                <div class="tooltip-level-section">
                    <div class="is-size-6 has-text-weight-bold has-text-info">
                        Level ${effectiveLevel}
                    </div>
                    <div class="is-size-7 has-text-grey">
                        ${level} from points<br>
                        ${allSkillsBonus > 0 ? `${allSkillsBonus} from all skills` : ''}
                    </div>
                </div>
            </div>
    `;
    html += '</div>';
    
    // Get character state for formula evaluation (needed for all tooltip content)
    const allSkillPoints = getAllSkillPoints();
    const allOSkills = getAllOSkills();
    
    
    // Get character level from minimum level display (this is what ulvl should use)
    const minLevelDisplay = document.getElementById('minLevelDisplay');
    let characterLevel = 1; // fallback
    if (minLevelDisplay) {
        const levelText = minLevelDisplay.textContent;
        const levelMatch = levelText.match(/Level (\d+)/);
        if (levelMatch) {
            characterLevel = parseInt(levelMatch[1], 10);
        }
    }
    
    // All Skills bonus already calculated at the top of the function
    
    // Get character stats
    const characterStats = getAllStats();
    
    // Build oSkills lookup map (skill name -> points) for efficient checking
    const oSkillsMap = new Map();
    if (Array.isArray(allOSkills)) {
        allOSkills.forEach(oskill => {
            if (oskill.skillName) {
                oSkillsMap.set(oskill.skillName, oskill.points);
            }
        });
    } else if (typeof allOSkills === 'object') {
        Object.entries(allOSkills).forEach(([skillIdOrName, points]) => {
            let skillName = skillIdOrName;
            
            // If it's a skill ID, look up the skill name from database
            if (/^\d+$/.test(skillIdOrName) && db) {
                try {
                    const stmt = db.prepare('SELECT name FROM skills WHERE id = ?');
                    stmt.bind([parseInt(skillIdOrName)]);
                    if (stmt.step()) {
                        skillName = stmt.get()[0];
                    }
                    stmt.free();
                } catch (error) {
                    console.warn('Could not look up skill name for ID:', skillIdOrName);
                    skillName = skillIdOrName; // Fallback to ID
                }
            }
            
            oSkillsMap.set(skillName, points);
        });
    }
    
    // Create base character state with tree skill points
    // For regular skills: exclude oSkills from blvl (they shouldn't affect regular skill formulas)
    // For oSkills: exclude regular skill points for this specific skill, but keep other regular skills for references
    const characterState = {
        level: characterLevel,
        blvl: {}, // Will be populated below
        lvl: {}, // Will be populated below
        treeSkillsCache: getTreeSkillsCache(), // Add tree skills cache for tree() function
        stats: { ...characterStats } // Add character stats for formula evaluation
    };
    
    // skillData.id is always the skill name (internal identifier) from getSkillDataFromDB
    // skillData.dbId is the numeric database ID
    const currentSkillName = skillData.id; // This is the skill name used in blvl
    
    // Populate blvl based on whether this is a regular skill or oSkill
    if (isOSkill) {
        // For oSkills: use oSkill points for this skill, but regular skill points for all other skills
        // This allows oSkill formulas to reference other regular skills via [[skill_name]]
        for (const [skillName, points] of Object.entries(allSkillPoints)) {
            // Exclude this skill's regular points (we'll use oSkill points instead)
            // Also exclude any other skills that are oSkills
            if (skillName !== currentSkillName && !oSkillsMap.has(skillName)) {
                characterState.blvl[skillName] = points;
            }
        }
        
        // Add oSkill points for this specific skill (from oSkills)
        // oSkillsMap uses skill names as keys (after conversion from IDs if needed)
        const currentOSkillPoints = oSkillsMap.get(currentSkillName) || 0;
        characterState.blvl[currentSkillName] = currentOSkillPoints;
        
        // Also add other oSkills (for references in formulas like [[other_oskill]])
        oSkillsMap.forEach((points, skillName) => {
            if (skillName !== currentSkillName) {
                characterState.blvl[skillName] = points;
            }
        });
    } else {
        // For regular skills: only use regular skill points, exclude all oSkills
        // This ensures regular skill formulas don't use oSkill points
        for (const [skillName, points] of Object.entries(allSkillPoints)) {
            // Exclude oSkills - they shouldn't affect regular skill formulas
            if (!oSkillsMap.has(skillName)) {
                characterState.blvl[skillName] = points;
            }
        }
        
        // Ensure current skill is included in blvl (even if 0 points)
        if (!characterState.blvl[currentSkillName]) {
            characterState.blvl[currentSkillName] = getSkillPoints(currentSkillName);
        }
    }
    
    // Calculate lvl for each skill (only allSkillsBonus, not including base points)
    // For oSkills, cap effective level (blvl + bonus) at 150, giving priority to bonus
    for (const [skillName, points] of Object.entries(characterState.blvl)) {
        if (isOSkill && skillName === currentSkillName) {
            // For oSkills: cap effective level at 150, but ensure bonus takes priority
            // If blvl + bonus > 150, cap blvl down so that blvl + bonus = 150 (bonus takes priority)
            const effectiveLevel = points + allSkillsBonus;
            if (effectiveLevel > 150) {
                // Cap blvl so that blvl + bonus = 150 (bonus takes priority)
                characterState.blvl[skillName] = Math.max(0, 150 - allSkillsBonus);
                characterState.lvl[skillName] = allSkillsBonus;
            } else {
                characterState.lvl[skillName] = allSkillsBonus;
            }
        } else {
            characterState.lvl[skillName] = allSkillsBonus;
        }
    }
    
    // Check if Ctrl key is pressed (for formula display, localhost only)
    const showFormulas = isLocalhost() && ctrlKeyPressed;
    
    // Description with scaling
    // Render description and skill effect
    if (skillData.description || skillData.skillEffect) {
        html += '<div class="tooltip-description p-0">';
        
        // Check if skill has scaling data
        const hasScaling = checkSkillHasScaling(db, skillData.dbId);
        
        if (hasScaling) {
            html += `<div class="tooltip-level-indicator is-italic">Level ${level} values:</div>`;
        }
        
        // Render main description
        if (skillData.description) {
            const expandedDesc = await expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.description, skillData.id, characterState, showFormulas);
            html += `<div class="tooltip-main-desc has-text-centered mb-2">${expandedDesc}</div>`;
        }
        
        // Render skill effect
        if (skillData.skillEffect) {
            const expandedEffect = await expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.skillEffect, skillData.id, characterState, showFormulas);
            const lines = expandedEffect.split('\n');
            
            lines.forEach(line => {
                if (line.trim()) {
                    html += `<div class="tooltip-effect has-text-centered">${line}</div>`;
                } else {
                    html += '<div>&nbsp;</div>';
                }
            });
        }
        
        html += '</div>';
    }

    // Restriction (if any)
    if (skillData.restriction) {
        html += '<div class="tooltip-warning">';
        // Expand placeholders in restriction text
        const expandedRestriction = await expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.restriction, skillData.id, characterState, showFormulas);
        const restrictionLines = expandedRestriction.split('\n');
        restrictionLines.forEach(line => {
            html += `<div class="has-text-warning">${line}</div>`;
        });
        html += '</div>';
    }
    
    // Warning message (if any) - for prerequisites, devotion, etc.
    if (warningMessage) {
        html += '<div class="tooltip-restriction">';
        const warningLines = warningMessage.split('\n');
        warningLines.forEach(line => {
            html += `<div class="has-text-danger">${line}</div>`;
        });
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

/**
 * Check if a skill has scaling data
 */
function checkSkillHasScaling(db, skillDbId) {
    try {
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM skill_scaling
            WHERE skill_id = ?
        `);
        stmt.bind([skillDbId]);
        
        if (stmt.step()) {
            const count = stmt.get()[0];
            stmt.free();
            return count > 0;
        }
        stmt.free();
    } catch (error) {
        console.error('Error checking scaling data:', error);
    }
    return false;
}

/**
 * Clean up tooltip (call when page is unloaded)
 */
export function destroyTooltip() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('skillPointsChanged', handleSkillPointsChanged);
    window.removeEventListener('tooltipRefresh', handleSkillPointsChanged);
    window.removeEventListener('oskillsUpdated', handleOSkillsUpdated);
    
    // Reset Ctrl key state
    if (isLocalhost()) {
        ctrlKeyPressed = false;
    }
}
