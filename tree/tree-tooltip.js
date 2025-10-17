// Tooltip functionality for skill tree
import { getSkillIconHTML, expandPlaceholdersWithScaling, SKILL_CATEGORY_TAG_IDS, SUMMON_TAG_IDS, TELEPORT_TAG_IDS } from '../utils.js';
import { getDatabase } from './tree-data.js';
import { getSkillPoints, getOSkillPoints } from '../character/character-state.js';

let tooltipElement = null;
let currentHoveredSkill = null;
let tooltipHideTimeout = null;

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
    
    // Listen for skill point changes to update tooltip if it's showing
    window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
    
    // Listen for oSkills updates to hide tooltip if skill was removed
    window.addEventListener('oskillsUpdated', handleOSkillsUpdated);
}

/**
 * Handle mouse over events on skill images
 */
function handleMouseOver(e) {
    // Check if hovering over a skill card or its children
    const skillCard = e.target.closest('.skill-card');
    if (!skillCard) return;
    
    // Get skill ID from the card's data attribute
    const skillId = skillCard.dataset.skillId;
    if (!skillId) return;
    
    // Clear any pending hide timeout
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    
    currentHoveredSkill = skillId;
    showTooltip(skillId, e.clientX, e.clientY, skillCard);
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
    }
}

/**
 * Handle skill points changed event to update tooltip if showing
 */
function handleSkillPointsChanged() {
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
        
        const currentLevel = isOSkill 
            ? Math.max(1, getOSkillPoints(currentHoveredSkill))
            : Math.max(1, getSkillPoints(currentHoveredSkill));
        
        // Get warning message from the skill card's plus button (if any)
        // Skip warning for oSkills (they only have 150 level cap)
        let warningMessage = '';
        if (!isOSkill) {
            const plusBtn = skillCard?.querySelector('.skill-plus-btn');
            warningMessage = plusBtn?.dataset?.warningMessage || '';
        }
        
        const content = buildTooltipContent(skillData, currentLevel, db, warningMessage);
        
        tooltipElement.innerHTML = content;
    }
}

/**
 * Handle oSkills updated event to refresh or hide tooltip
 */
function handleOSkillsUpdated() {
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
            
            const currentLevel = isOSkillCard 
                ? Math.max(1, getOSkillPoints(currentHoveredSkill))
                : Math.max(1, getSkillPoints(currentHoveredSkill));
            
            // Get warning message from the skill card's plus button (if any)
            // Skip warning for oSkills (they only have 150 level cap)
            let warningMessage = '';
            if (!isOSkillCard) {
                const plusBtn = activeSkillCard?.querySelector('.skill-plus-btn');
                warningMessage = plusBtn?.dataset?.warningMessage || '';
            }
            
            const content = buildTooltipContent(skillData, currentLevel, db, warningMessage);
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
function showTooltip(skillId, mouseX, mouseY, hoveredCard = null) {
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
    
    const currentLevel = isOSkill 
        ? Math.max(1, getOSkillPoints(skillId))
        : Math.max(1, getSkillPoints(skillId));
    
    // Get warning message from the skill card's plus button (if any)
    // Skip warning for oSkills (they only have 150 level cap)
    let warningMessage = '';
    if (!isOSkill) {
        const plusBtn = skillCard?.querySelector('.skill-plus-btn');
        warningMessage = plusBtn?.dataset?.warningMessage || '';
    }
    
    // Build tooltip content
    const content = buildTooltipContent(skillData, currentLevel, db, warningMessage);
    
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
        const stmt = db.prepare(`
            SELECT s.id, s.name, s.display_name, s.description, s.skill_effect, s.restriction, s.image,
                   c.name AS class_name,
                   sml.base_max_level, sml.affected_by_specialization, sml.can_add_points
            FROM skills s
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN skill_max_levels sml ON s.id = sml.skill_id
            WHERE s.name = ?
        `);
        
        stmt.bind([skillId]);
        
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
function buildTooltipContent(skillData, level, db, warningMessage = '') {
    let html = '<div class="tooltip-content">';
    
    // Skill name and icon
    html += '<div class="tooltip-header">';
    html += `<div class="tooltip-icon">${getSkillIconHTML(skillData.image, skillData.className, 'is-64x64')}</div>`;
    
    // Skill category tags (if any)
    let tagsHtml = ''
    const tags = getSkillCategoryTags(db, skillData.dbId);
    if (tags.length > 0) {
        tagsHtml += '<p class="is-size-7 has-text-weight-bold has-text-grey-lighter">';
        tagsHtml += tags.join(', ');
        tagsHtml += '</p>';
    }

    html += `<div class="is-size-4 has-text-weight-bold">
                ${skillData.displayName}
                ${tagsHtml}
            </div>
    `;
    html += '</div>';
    
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
            const expandedDesc = expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.description);
            html += `<div class="tooltip-main-desc has-text-centered mb-2">${expandedDesc}</div>`;
        }
        
        // Render skill effect
        if (skillData.skillEffect) {
            const expandedEffect = expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.skillEffect);
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
        const expandedRestriction = expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.restriction);
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
    window.removeEventListener('oskillsUpdated', handleOSkillsUpdated);
}
