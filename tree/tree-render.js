// Skills rendering and grid layout functionality
import { getFileSkillStore } from './skill-data-store.js';
import { getSkillPoints, getAllSkillPoints, getMinimumRequiredLevel, calculateEffectiveMaxLevel, getSkillRestrictions, canAllocateSkillPoints, addSkillPoint, removeSkillPoint, addSkillPointsBatch, removeSkillPointsBatch } from '../character/character-state.js';
import { getSkillIconHTML } from '../utils.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '../version-config.js';
import { ToastManager } from './ToastManager.js';
import { listSkillVariants } from './skill-variants.js';
import { notifySkillGridDomReset } from './tree-tooltip.js';

// Initialize ToastManager
const toastManager = new ToastManager();

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

// Main render function (Vue PlannerSkillsTree listens for events; DOM is not built here)
export function renderSkills(selectedClass, skillsList, skillsContainer, preserveTab = null, redrawArrows = true) {
    if (!redrawArrows && skillsContainer && skillsContainer.querySelector('.skills-grid')) {
        window.dispatchEvent(
            new CustomEvent('plannerSkillsLightUpdate', {
                detail: { selectedClass, skillsList },
            })
        );
        return;
    }

    // Do not clear skillsContainer: PlannerSkillsTree is mounted inside it. Clearing innerHTML
    // removes Vue's root from the document and the next patch throws (insertBefore on null parent).
    notifySkillGridDomReset();

    window.dispatchEvent(
        new CustomEvent('plannerSkillsRenderRequested', {
            detail: { selectedClass, skillsList, preserveTab, redrawArrows },
        })
    );
}

/**
 * Handle skill point change (consolidated from SkillTreeController)
 * @param {Object} skill - Skill object
 * @param {number} delta - Points to add (positive) or remove (negative)
 * @param {Array} allSkills - Array of all skills (for validation)
 */
export function handleSkillPointChange(skill, delta, allSkills = []) {
    const minLevel = getMinimumRequiredLevel(allSkills);
    const skillLevels = getAllSkillPoints();

    const effectiveMaxLevel = calculateEffectiveMaxLevel(
        skill.skillId,
        'regular',
        skillLevels,
        minLevel
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
                    minLevel
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
 * Build planner card data for both regular skills and oSkills.
 * @param {Object} skillEntry
 * @param {{ skillType?: 'regular'|'oskill', allSkills?: Array, getIconFn?: Function }} opts
 * @returns {Object}
 */
export function buildPlannerSkillCardData(skillEntry, opts = {}) {
    const skillType = opts.skillType || 'regular';
    const allSkills = Array.isArray(opts.allSkills) ? opts.allSkills : [];
    const getIconFn = opts.getIconFn || null;
    const skillLevels = getAllSkillPoints();
    const minLevel = getMinimumRequiredLevel(allSkills);
    const isOSkill = skillType === 'oskill';

    const currentPoints = isOSkill
        ? (skillEntry.points || 0)
        : getSkillPoints(skillEntry.id);
    const maxPoints = calculateEffectiveMaxLevel(
        isOSkill ? (skillEntry.skillId || skillEntry.skillName) : skillEntry.skillId,
        skillType,
        skillLevels,
        minLevel
    ) || skillEntry.baseMaxLevel;
    const restrictions = getSkillRestrictions(
        skillEntry,
        skillType,
        currentPoints,
        allSkills,
        skillLevels
    );
    const canAllocate = canAllocateSkillPoints(
        skillEntry,
        skillType,
        currentPoints,
        maxPoints,
        allSkills,
        skillLevels
    );

    if (!isOSkill) {
        return {
            skillId: skillEntry.id,
            numericId: skillEntry.skillId,
            classId: skillEntry.classId,
            displayName: skillEntry.name,
            iconHTML: getIconFn ? getIconFn(skillEntry.image, skillEntry.class) : '',
            hasDescription: skillEntry.hasDetails || false,
            currentPoints,
            maxPoints,
            canAllocate,
            restrictions,
            isInnate: false
        };
    }

    const numericId =
        typeof skillEntry.numericId === 'number'
            ? skillEntry.numericId
            : typeof skillEntry.skillId === 'number'
                ? skillEntry.skillId
                : null;
    let variantStateKey =
        skillEntry.skillName && String(skillEntry.skillName).trim() !== ''
            ? skillEntry.skillName
            : null;
    if (!variantStateKey && numericId != null) {
        const internal = getFileSkillStore()?.internalNameByNumericId(numericId);
        if (internal) variantStateKey = internal;
    }

    return {
        skillId: skillEntry.skillId || skillEntry.skillName,
        numericId,
        variantStateKey: variantStateKey || undefined,
        displayName: skillEntry.displayName || skillEntry.skillName || `Skill ${skillEntry.skillId}`,
        iconHTML: getIconFn ? getIconFn(skillEntry.image, skillEntry.className) : '',
        hasDescription: skillEntry.hasDetails || false,
        currentPoints,
        maxPoints,
        canAllocate,
        restrictions,
        isInnate: false,
        variants: numericId != null ? listSkillVariants(numericId) : []
    };
}

export function buildSkillCardData(skill, allSkills = [], getIconFn = null) {
    return buildPlannerSkillCardData(skill, {
        skillType: 'regular',
        allSkills,
        getIconFn
    });
}

export function buildOSkillCardData(oskill, getIconFn = null) {
    return buildPlannerSkillCardData(oskill, {
        skillType: 'oskill',
        allSkills: [],
        getIconFn
    });
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
 * Get restriction text from restrictions array (all reasons, for tooltip / native title).
 * @param {Array<{ reason?: string }>|undefined|null} restrictions
 * @returns {string} Non-empty reasons joined by newlines
 */
export function getRestrictionMessage(restrictions) {
    if (!restrictions || restrictions.length === 0) {
        return '';
    }
    return restrictions
        .map((r) => String(r?.reason ?? '').trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * Get icon HTML for a skill
 * @param {string} image - Image filename
 * @param {string} className - Class name for the skill
 * @returns {string} HTML for the skill icon
 */
export function getSkillIcon(image, className) {
    const folder = versionToTreeAssetFolder(getCurrentVersion());
    return getSkillIconHTML(image, className, '', folder);
}
