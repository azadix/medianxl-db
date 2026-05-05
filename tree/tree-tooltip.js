// Tooltip functionality for skill tree
import { getSkillIconHTML, expandPlaceholdersWithScaling } from '../utils.js';
import { getSkillPoints, getOSkillPoints, getAllSkillPoints, getAllOSkills, getTreeSkillsCache, getAllStats, getCharacterInstance } from '../character/character-state.js';
import { resolveVariantKeyForTooltip, formatDisplayNameWithVariantHtml } from './skill-variants.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '../version-config.js';
import { getFileSkillStore } from './skill-data-store.js';
import Innate from '../skills/Innate.js';
import { getMaxLevelModifierDescriptionsForSkill } from '../skills/skill-calculations.js';

let tooltipElement = null;
let currentHoveredSkill = null;
/** Last skill card hovered (disambiguates duplicate data-skill-id nodes after re-render). */
let lastHoveredSkillCard = null;
let lastMouseX = 0;
let lastMouseY = 0;
let tooltipHideTimeout = null;
/** When pointer leaves the hovered card without a clean mouseout, hide after this delay (ms). */
let pointerAwayHideTimeout = null;
const POINTER_AWAY_HIDE_MS = 1000;
let ctrlKeyPressed = false;

function tooltipDataSourceReady() {
    return Boolean(getFileSkillStore());
}

function clearPointerAwayHideTimer() {
    if (pointerAwayHideTimeout) {
        clearTimeout(pointerAwayHideTimeout);
        pointerAwayHideTimeout = null;
    }
}

function onTooltipRefreshEvent(e) {
    handleSkillPointsChanged(e.detail?.skillCard ?? null);
}

function onSkillPointsChangedForTooltip() {
    handleSkillPointsChanged(null);
}

function cardMatchesCurrentHover(card) {
    return Boolean(card && currentHoveredSkill != null && card.dataset?.skillId === currentHoveredSkill);
}

function isCardInDocument(card) {
    return Boolean(card && typeof card.isConnected === 'boolean' && card.isConnected);
}

/**
 * Prefer the card the user interacted with / hovered; avoid a stale detached node after re-render.
 */
function pickSkillCardForTooltip(preferredCard) {
    if (cardMatchesCurrentHover(preferredCard) && isCardInDocument(preferredCard)) {
        return preferredCard;
    }
    if (cardMatchesCurrentHover(lastHoveredSkillCard) && isCardInDocument(lastHoveredSkillCard)) {
        return lastHoveredSkillCard;
    }
    const allSkillCards = document.querySelectorAll(`.skill-card[data-skill-id="${currentHoveredSkill}"]`);
    let skillCard = null;
    allSkillCards.forEach((c) => {
        if (c.closest('#tab-oSkills')) {
            skillCard = c;
        } else if (!skillCard) {
            skillCard = c;
        }
    });
    return skillCard;
}

function parseClassIdDataset(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? null : n;
}

function parseSkillNumericIdDataset(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? null : n;
}

/**
 * Initialize tooltip functionality
 * Creates the tooltip element and attaches event listeners
 */
let tooltipInitialized = false;

export function initializeTooltip() {
    if (tooltipInitialized) return;
    tooltipInitialized = true;
    // Prefer Vue Teleport host (#skill-tooltip-portal) when present; else create a legacy node.
    tooltipElement = document.getElementById('skill-tooltip-portal');
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'skill-tooltip-portal';
        tooltipElement.className = 'skill-tooltip';
        tooltipElement.style.display = 'none';
        document.body.appendChild(tooltipElement);
    }

    // Add event delegation for skill card images
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', onWindowScrollForTooltip, true);

    // Track Ctrl key for formula display
    // Using Ctrl to avoid conflicts with browser shortcuts (Alt+click, Alt+Tab, etc.)
    document.addEventListener('keydown', (e) => {
        // Track Ctrl key (either left or right)
        if (e.key === 'Control' || e.ctrlKey) {
            if (!ctrlKeyPressed) {
                ctrlKeyPressed = true;
                // Refresh tooltip if showing
                if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
                    handleSkillPointsChanged(null);
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
                    handleSkillPointsChanged(null);
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
                handleSkillPointsChanged(null);
            }
        }
    });
    
    // Listen for skill point changes to update tooltip if it's showing
    window.addEventListener('skillPointsChanged', onSkillPointsChangedForTooltip);
    
    // Listen for tooltip refresh events (triggered after minLevelDisplay is updated)
    window.addEventListener('tooltipRefresh', onTooltipRefreshEvent);
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
    
    // Update Ctrl key state from mouse event
    ctrlKeyPressed = e.ctrlKey;
    
    // Clear any pending hide timeout
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    clearPointerAwayHideTimer();

    currentHoveredSkill = skillId;
    lastHoveredSkillCard = skillCard;
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

    // Browsers often set relatedTarget to null during rapid clicks or in-place DOM updates
    // (e.g. + button state). Re-check pointer position before hiding to avoid flicker.
    if (relatedTarget == null) {
        const skillId = skillCard.dataset.skillId;
        if (!skillId) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (currentHoveredSkill !== skillId) return;
                let el;
                try {
                    el = document.elementFromPoint(lastMouseX, lastMouseY);
                } catch {
                    return;
                }
                const card = el && el.closest('.skill-card');
                if (card && String(card.dataset.skillId) === String(skillId)) {
                    return;
                }
                hideTooltip();
                if (currentHoveredSkill === skillId) {
                    currentHoveredSkill = null;
                }
            });
        });
        return;
    }

    hideTooltip();
    currentHoveredSkill = null;
}

/**
 * Handle mouse move to update tooltip position
 */
function handleMouseMove(e) {
    if (tooltipElement && tooltipElement.style.display !== 'none') {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        updateTooltipPosition(e.clientX, e.clientY);

        // Check if Ctrl key state changed and refresh tooltip if needed
        const wasCtrlPressed = ctrlKeyPressed;
        const isCtrlPressedNow = e.ctrlKey;
        
        // If Ctrl state changed, refresh the tooltip
        if (wasCtrlPressed !== isCtrlPressedNow) {
            ctrlKeyPressed = isCtrlPressedNow;
            if (currentHoveredSkill) {
                handleSkillPointsChanged(null);
            }
        }

        scheduleTooltipHideWhenPointerLeavesCard(e.clientX, e.clientY);
    }
}

/**
 * Handle skill points changed event to update tooltip if showing
 * @param {HTMLElement|null} preferredCard - Card from variant menu or other explicit UI
 */
async function handleSkillPointsChanged(preferredCard = null) {
    // If tooltip is showing for a skill, refresh it
    if (currentHoveredSkill && tooltipElement && tooltipElement.style.display !== 'none') {
        if (!tooltipDataSourceReady()) return;

        const skillCard = pickSkillCardForTooltip(preferredCard);
        const classIdNum = parseClassIdDataset(skillCard?.dataset?.classId);
        const cardNumericId = parseSkillNumericIdDataset(skillCard?.dataset?.skillNumericId);
        const skillData = getSkillDataFromStore(currentHoveredSkill, classIdNum, cardNumericId);
        if (!skillData) return;
        const context = resolveTooltipContext(skillCard, skillData, currentHoveredSkill);
        applySkillVariantTextOverrides(skillData, context.variantKey);
        const content = await buildTooltipContent(
            skillData,
            context.currentLevel,
            context.warningMessage,
            context.isOSkill,
            context.variantKey
        );
        
        tooltipElement.innerHTML = content;
        updateTooltipPosition(lastMouseX, lastMouseY);
    }
}

/**
 * Show tooltip for a skill
 * @param {string} skillId - Internal skill name
 * @param {number} mouseX - Mouse X position
 * @param {number} mouseY - Mouse Y position
 * @param {HTMLElement} hoveredCard - The actual card element being hovered (optional)
 */
async function showTooltip(skillId, mouseX, mouseY, hoveredCard = null) {
    clearPointerAwayHideTimer();
    // Store mouse coordinates for potential tooltip refresh
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    if (!tooltipDataSourceReady()) {
        console.warn('Tooltip: Skill data not loaded yet');
        return;
    }

    let skillCard = hoveredCard;
    if (!skillCard) {
        skillCard = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`);
    }
    if (skillCard) {
        lastHoveredSkillCard = skillCard;
    }

    const classIdNum = parseClassIdDataset(skillCard?.dataset?.classId);
    const cardNumericId = parseSkillNumericIdDataset(skillCard?.dataset?.skillNumericId);
    const skillData = getSkillDataFromStore(skillId, classIdNum, cardNumericId);
    if (!skillData) {
        console.warn('Tooltip: No skill data found for', skillId);
        return;
    }

    const context = resolveTooltipContext(skillCard, skillData, skillId);
    applySkillVariantTextOverrides(skillData, context.variantKey);
    const content = await buildTooltipContent(
        skillData,
        context.currentLevel,
        context.warningMessage,
        context.isOSkill,
        context.variantKey
    );
    
    // Update tooltip
    tooltipElement.innerHTML = content;
    tooltipElement.style.display = 'block';
    updateTooltipPosition(mouseX, mouseY);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    clearPointerAwayHideTimer();
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
    lastHoveredSkillCard = null;
}

/**
 * Call before replacing skill grid DOM (innerHTML etc.). Removed nodes do not reliably emit mouseout.
 */
export function notifySkillGridDomReset() {
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
    hideTooltip();
    currentHoveredSkill = null;
}

/**
 * If the pointer is not over the same skill card as the tooltip, start a 1s timer to dismiss
 * (fast hovers often skip mouseout; immediate hide was too aggressive).
 */
function scheduleTooltipHideWhenPointerLeavesCard(clientX, clientY) {
    if (!currentHoveredSkill || !tooltipElement || tooltipElement.style.display === 'none') {
        return;
    }
    let el;
    try {
        el = document.elementFromPoint(clientX, clientY);
    } catch {
        return;
    }
    const card = el && el.closest('.skill-card');
    const overSameCard =
        card && String(card.dataset.skillId) === String(currentHoveredSkill);

    if (overSameCard) {
        clearPointerAwayHideTimer();
        return;
    }

    if (!pointerAwayHideTimeout) {
        pointerAwayHideTimeout = setTimeout(() => {
            pointerAwayHideTimeout = null;
            notifySkillGridDomReset();
        }, POINTER_AWAY_HIDE_MS);
    }
}

function onWindowScrollForTooltip() {
    scheduleTooltipHideWhenPointerLeavesCard(lastMouseX, lastMouseY);
}

/**
 * Refresh current tooltip (useful when All Skills bonus changes)
 */
export function refreshCurrentTooltip() {
    if (currentHoveredSkill) {
        const card =
            cardMatchesCurrentHover(lastHoveredSkillCard) && isCardInDocument(lastHoveredSkillCard)
                ? lastHoveredSkillCard
                : null;
        showTooltip(currentHoveredSkill, lastMouseX, lastMouseY, card);
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
 * Apply optional description / effect / restriction overrides from skill_variants (mutates skillData).
 */
function applySkillVariantTextOverrides(skillData, variantKey) {
    if (!skillData || !variantKey) return;
    const o = getFileSkillStore()?.getVariantTextOverrides(skillData.numericId, variantKey);
    if (!o) return;
    if (o.description != null && String(o.description).trim() !== '') skillData.description = o.description;
    if (o.skill_effect != null && String(o.skill_effect).trim() !== '') skillData.skillEffect = o.skill_effect;
    if (o.restriction != null && String(o.restriction).trim() !== '') skillData.restriction = o.restriction;
}

function getSkillDataFromFileStore(skillId, classIdNum = null, cardNumericId = null) {
    const store = getFileSkillStore();
    if (!store?.gameMeta) return null;

    let internal = null;
    if (cardNumericId != null && Number.isFinite(cardNumericId)) {
        internal = store.internalNameByNumericId(cardNumericId);
    } else if (/^\d+$/.test(String(skillId))) {
        internal = store.lookupSkillNameAndDisplayByNumericId(parseInt(String(skillId), 10))?.name ?? null;
    } else {
        internal = String(skillId);
    }
    if (!internal) return null;

    const cat =
        cardNumericId != null && Number.isFinite(cardNumericId)
            ? store.catalog.find((c) => c.numericId === cardNumericId)
            : store.catalog.find((c) => c.id === internal);
    if (!cat) return null;

    if (classIdNum != null && Number.isFinite(classIdNum)) {
        const matchesClass = store.catalogRowMatchesPlannerClass(cat, classIdNum);
        const sameRowAsCard =
            cardNumericId != null &&
            Number.isFinite(cardNumericId) &&
            cat.numericId === cardNumericId;
        if (!matchesClass && !sameRowAsCard) return null;
    }

    const det = store.getSkillDetail(internal);
    if (!det) return null;

    return {
        numericId: cat.numericId,
        id: internal,
        displayName: det.display_name || cat.displayName || internal,
        description: det.description,
        skillEffect: det.skill_effect,
        restriction: det.restriction,
        image: det.image,
        className: det.className || store.primaryClassDisplayName(cat) || '',
        baseMaxLevel: cat.baseMaxLevel,
        affectedBySpecialization: cat.affectedBySpecialization ? 1 : 0
    };
}

/**
 * Resolve tooltip skill fields from the file skill store.
 * @param {string} skillId - Internal skill name (e.g. impale) or numeric catalog id as string
 * @param {number|null} classIdNum - class id from the hovered card (merged planner row disambiguation)
 * @param {number|null} cardNumericId - catalog numericId from the card (disambiguates cloned Mastery/Paragon rows)
 */
function getSkillDataFromStore(skillId, classIdNum = null, cardNumericId = null) {
    try {
        return getSkillDataFromFileStore(skillId, classIdNum, cardNumericId);
    } catch (error) {
        console.error('Error fetching skill data for tooltip:', error);
    }
    return null;
}

/**
 * Get skill category tags for a skill
 * @param {number} numericId - catalog numericId
 * @returns {Array<string>} Array of tag names
 */
function getSkillCategoryTags(numericId) {
    const store = getFileSkillStore();
    const internal = store?.internalNameByNumericId(numericId);
    if (!internal) return [];
    const det = store.getSkillDetail(internal);
    const nameLc = new Set((det?.tags || []).map((t) => String(t).toLowerCase()));

    const out = [];
    for (const t of store.gameMeta.skilltags || []) {
        if (nameLc.has(String(t.name).toLowerCase())) {
            out.push(t.name);
        }
    }
    return out.sort();
}

/**
 * Build tooltip HTML content
 * @param {Object} skillData - Skill fields from the file store
 * @param {number} level - Current skill level
 * @param {string} warningMessage - Optional warning message (e.g., prerequisite not met)
 */
async function buildTooltipContent(skillData, level, warningMessage = '', isOSkill = false, variantKey = null) {
    // Get All Skills bonus for effective level calculation (used in multiple places)
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    const allSkillsBonus = allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
    // For oSkills, cap effective level at 150 (points + bonus combined)
    const effectiveLevel = isOSkill 
        ? Math.min(150, level + allSkillsBonus)
        : level + allSkillsBonus;
    const scalingLevel = isOSkill ? effectiveLevel : level;
    
    let html = '<div class="tooltip-content">';
    
    // Skill name and icon
    html += '<div class="tooltip-header">';
    const iconFolder = versionToTreeAssetFolder(getCurrentVersion());
    html += `<div class="tooltip-icon">${getSkillIconHTML(skillData.image, skillData.className, 'is-64x64', iconFolder)}</div>`;
    
    // Skill category tags (if any)
    let tagsHtml = ''
    const tags = getSkillCategoryTags(skillData.numericId);
    if (tags.length > 0) {
        tagsHtml += '<p class="is-size-7 has-text-weight-bold has-text-grey-lighter">';
        tagsHtml += tags.join(', ');
        tagsHtml += '</p>';
    }

    html += `<div class="tooltip-name-container">
                <div class="tooltip-name-section">
                    <div class="is-size-4 has-text-weight-bold">
                        ${formatDisplayNameWithVariantHtml(skillData.displayName, skillData.numericId, variantKey)}
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
            
            if (/^\d+$/.test(skillIdOrName)) {
                const internal = getFileSkillStore()?.internalNameByNumericId(
                    parseInt(skillIdOrName, 10)
                );
                if (internal) skillName = internal;
            }
            
            oSkillsMap.set(skillName, points);
        });
    }
    
    // Create base character state with tree skill points
    // For regular skills: exclude oSkills from blvl (they shouldn't affect regular skill formulas)
    // For oSkills: exclude regular skill points for this specific skill, but keep other regular skills for references
    const characterState = {
        level: characterLevel,
        className: getCharacterInstance()?.className ?? null,
        blvl: {}, // Will be populated below
        lvl: {}, // Will be populated below
        treeSkillsCache: getTreeSkillsCache(), // Add tree skills cache for tree() function
        stats: { ...characterStats } // Add character stats for formula evaluation
    };
    
    // skillData.id is always the skill name (internal identifier) from getSkillDataFromStore
    // skillData.numericId is the catalog numeric id (skills.json)
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
    for (const [skillName, points] of Object.entries(characterState.blvl)) {
        if (isOSkill && skillName === currentSkillName) {
            // Keep formulas and level-table lookups aligned for oSkills by using a capped effective level.
            characterState.blvl[skillName] = Math.min(150, points + allSkillsBonus);
            characterState.lvl[skillName] = 0;
        } else {
            characterState.lvl[skillName] = allSkillsBonus;
        }
    }
    
    // Check if Ctrl key is pressed (for formula display)
    const showFormulas = ctrlKeyPressed;
    
    // Description with scaling
    // Render description and skill effect
    if (skillData.description || skillData.skillEffect) {
        html += '<div class="tooltip-description p-0">';
        
        // Check if skill has scaling data
        const hasScaling = checkSkillHasScaling(skillData.numericId);

        // Render main description first
        if (skillData.description) {
            const expandedDesc = await expandPlaceholdersWithScaling(skillData.numericId, scalingLevel, skillData.description, skillData.id, characterState, showFormulas, variantKey);
            html += `<div class="tooltip-main-desc has-text-centered mb-2">${expandedDesc}</div>`;
        }

        if (hasScaling) {
            html += `<div class="tooltip-level-indicator is-italic">Level ${scalingLevel} values:</div>`;
        }

        // Render skill effect (stat lines)
        if (skillData.skillEffect) {
            const expandedEffect = await expandPlaceholdersWithScaling(skillData.numericId, scalingLevel, skillData.skillEffect, skillData.id, characterState, showFormulas, variantKey);
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
        const expandedRestriction = await expandPlaceholdersWithScaling(skillData.numericId, scalingLevel, skillData.restriction, skillData.id, characterState, showFormulas, variantKey);
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

    // Max-level scaling (MAX_LEVEL_MODIFIERS descriptions) — bottom section, info styling
    if (!isOSkill && skillData.numericId != null) {
        const scalingLines = getMaxLevelModifierDescriptionsForSkill(
            skillData.numericId,
            characterState.blvl,
            characterLevel
        );
        if (scalingLines.length > 0) {
            html += '<div class="tooltip-scaling">';
            scalingLines.forEach((line) => {
                const safe = String(line)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
                html += `<div class="has-text-info">${safe}</div>`;
            });
            html += '</div>';
        }
    }
    
    html += '</div>';
    return html;
}

/**
 * Check if a skill has scaling data
 */
function checkSkillHasScaling(numericId) {
    try {
        const store = getFileSkillStore();
        if (!store || numericId == null) return false;
        const internal = store.internalNameByNumericId(numericId);
        if (!internal) return false;
        return store.hasScalingData(internal, store.getBalanceVersionIds());
    } catch (error) {
        console.error('Error checking scaling data:', error);
    }
    return false;
}

/**
 * Clean up tooltip (call when page is unloaded)
 */
export function destroyTooltip() {
    clearPointerAwayHideTimer();
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('scroll', onWindowScrollForTooltip, true);
    window.removeEventListener('skillPointsChanged', onSkillPointsChangedForTooltip);
    window.removeEventListener('tooltipRefresh', onTooltipRefreshEvent);
    
    // Reset Ctrl key state
    ctrlKeyPressed = false;
}

function resolveTooltipContext(skillCard, skillData, skillId) {
    const isOSkill = Boolean(skillCard && skillCard.closest('#tab-oSkills'));
    const isInnate = Boolean(
        skillCard &&
        skillData &&
        Innate.isInnateSkill({ id: skillData.id })
    );
    const currentLevel = isOSkill
        ? Math.max(1, getOSkillPoints(skillId))
        : isInnate
            ? 1
            : getSkillPoints(skillId);
    const warningMessage = isOSkill
        ? ''
        : (skillCard?.querySelector('.skill-plus-btn')?.dataset?.warningMessage || '');
    const variantKey = resolveVariantKeyForTooltip(skillData.id, skillCard);
    return { isOSkill, currentLevel, warningMessage, variantKey };
}
