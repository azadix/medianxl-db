// Tooltip functionality for skill tree
import { getSkillIconHTML, expandPlaceholdersWithScaling } from '../utils.js';
import { getDatabase } from './tree-data.js';
import { getSkillPoints } from '../character-state.js';

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
    showTooltip(skillId, e.clientX, e.clientY);
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
    
    // Delay hiding to prevent flicker when moving between elements
    tooltipHideTimeout = setTimeout(() => {
        hideTooltip();
        currentHoveredSkill = null;
    }, 100);
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
        
        const currentLevel = Math.max(1, getSkillPoints(currentHoveredSkill));
        const content = buildTooltipContent(skillData, currentLevel, db);
        
        tooltipElement.innerHTML = content;
    }
}

/**
 * Handle oSkills updated event to hide tooltip if skill card was removed
 */
function handleOSkillsUpdated() {
    // Always hide tooltip when oSkills are updated and clear any pending timeouts
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    
    // Force hide tooltip immediately
    hideTooltip();
    currentHoveredSkill = null;
}

/**
 * Show tooltip for a skill
 */
function showTooltip(skillId, mouseX, mouseY) {
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
    
    // Get current skill level (or 1 if no points allocated)
    const currentLevel = Math.max(1, getSkillPoints(skillId));
    
    // Build tooltip content
    const content = buildTooltipContent(skillData, currentLevel, db);
    
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
            SELECT s.id, s.name, s.display_name, s.description, s.restriction, s.image,
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
 * Build tooltip HTML content
 */
function buildTooltipContent(skillData, level, db) {
    let html = '<div class="tooltip-content">';
    
    // Skill name and icon
    html += '<div class="tooltip-header">';
    html += `<div class="tooltip-icon">${getSkillIconHTML(skillData.image, skillData.className, 'is-64x64')}</div>`;
    html += `<div class="tooltip-name has-text-warning">${skillData.displayName}</div>`;
    html += '</div>';
    
    // Restriction (if any)
    if (skillData.restriction) {
        html += '<div class="tooltip-restriction">';
        const restrictionLines = skillData.restriction.split('\n');
        restrictionLines.forEach(line => {
            html += `<div class="has-text-danger">${line}</div>`;
        });
        html += '</div>';
    }
    
    // Description with scaling
    if (skillData.description) {
        html += '<div class="tooltip-description p-0">';
        
        // Check if skill has scaling data
        const hasScaling = checkSkillHasScaling(db, skillData.dbId);
        
        if (hasScaling) {
            html += `<div class="tooltip-level-indicator">Level ${level} values:</div>`;
        }
        
        const expandedDesc = expandPlaceholdersWithScaling(db, skillData.dbId, level, skillData.description);
        const lines = expandedDesc.split('\n');
        
        // Add extra newline after first line if there are multiple lines
        if (lines.length > 1) {
            lines.splice(1, 0, '');
        }
        
        lines.forEach(line => {
            if (line.trim()) {
                html += `<div>${line}</div>`;
            } else {
                html += '<div>&nbsp;</div>';
            }
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
