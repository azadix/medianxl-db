// Tooltip functionality for skill tree
import { getSkillIconHTML, expandPlaceholdersWithScaling, escapeHtmlText } from '@/shared/utils.js';
import {
  buildSkillBonusSourcesTableHtml,
  buildSkillTooltipDescriptionBlock,
  buildSkillTooltipDisabledBannerHtml,
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipPrerequisiteWarningHtml,
  buildSkillTooltipRestrictionBlock,
  buildSkillTooltipScalingBlockHtml,
  wrapSkillTooltipContent,
} from '@/shared/tooltip-html.js';
import {
  getSkillPoints,
  getOSkillManualPoints,
  getOSkillItemPoints,
  getAllSkillPoints,
  getTreeSkillsCache,
  getAllStats,
  getCharacterInstance,
  isSkillDisabled,
  isOSkillSlotDisabled
} from '@/character/planner-core.js';
import { isConditionSelected } from '@/stores/planner-config-store.js';
import { resolveVariantKeyForTooltip, formatDisplayNameWithVariantHtml } from './skill-variants.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '@/shared/version-config.js';
import { getFileSkillStore, withBaseAttributeFormulaStats } from '@/shared/skill-data-store.js';
import { isInnateSkill } from '@/skills/domain/skill-skill-types.js';
import { getMaxLevelModifierDescriptionsForSkill } from '@/skills/domain/skill-calculations.js';
import { getRelicSkillBonusForSkill } from '@/items/skill-bonus-from-modifiers.js';
import { collectEnabledRelicOSkillGrants } from '@/items/item-granted-oskills.js';
import { computeSkillBonusSourceAmounts } from './skill-bonus-sources.js';
import Character from '@/character/Character.js';

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

/**
 * Refresh the open tooltip when Ctrl modifier state flips (raw formulas).
 */
function refreshTooltipForModifierKeys() {
    if (tooltipElement && tooltipElement.style.display !== 'none' && currentHoveredSkill) {
        handleSkillPointsChanged(null);
    }
}

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

function onPlannerConfigChangedForTooltip() {
    handleSkillPointsChanged(null);
}

function conditionGroupId(cond) {
    if (!cond || cond.group == null || String(cond.group).trim() === '') return null;
    return String(cond.group).toLowerCase();
}

/**
 * For mutual-exclusion groups: if any condition from that group (on this skill) is
 * selected, only show the active one(s). If none are selected, show all options.
 * Ungrouped conditions always show.
 * @param {object[]} conditions
 * @returns {object[]}
 */
function filterTooltipConditionsByGroup(conditions) {
    /** @type {Map<string, boolean>} */
    const groupHasActive = new Map();
    for (const cond of conditions) {
        const g = conditionGroupId(cond);
        if (!g) continue;
        if (isConditionSelected(cond.key)) groupHasActive.set(g, true);
        else if (!groupHasActive.has(g)) groupHasActive.set(g, false);
    }

    return conditions.filter((cond) => {
        const g = conditionGroupId(cond);
        if (!g) return true;
        if (!groupHasActive.get(g)) return true;
        return isConditionSelected(cond.key);
    });
}

function buildSkillTooltipConditionHtml(skillData) {
    const store = getFileSkillStore();
    if (!store || !skillData?.id) return '';
    const catalogRow = store.catalogByInternalId?.get(skillData.id);
    if (!catalogRow) return '';

    const conditions = store.getConditionsForSkill(catalogRow);
    if (!Array.isArray(conditions) || conditions.length === 0) return '';

    const visible = filterTooltipConditionsByGroup(conditions);
    if (visible.length === 0) return '';

    const rows = visible.map((cond) => {
        const active = isConditionSelected(cond.key);
        const label = cond.name || formatConditionLabel(cond.key || '');
        return `State:<span class="is-size-7 ${active ? 'has-text-success' : 'has-text-danger'}">` +
            `<span class="has-text-weight-semibold"> ${escapeHtmlText(label)}</span>` +
            ` ${active ? '' : '(disabled)'}` +
            `</span>`;
    });

    return `<div class="tooltip-condition mb-2">${rows.join('<br>')}</div>`;
}

function formatConditionLabel(rawKey) {
    return String(rawKey || '')
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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

    // Track Ctrl for raw formula display
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control' || e.ctrlKey) {
            if (!ctrlKeyPressed) {
                ctrlKeyPressed = true;
                refreshTooltipForModifierKeys();
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control' || (!e.ctrlKey && ctrlKeyPressed)) {
            if (ctrlKeyPressed) {
                ctrlKeyPressed = false;
                refreshTooltipForModifierKeys();
            }
        }
    });

    // Handle window blur (when Alt+Tab switches windows)
    window.addEventListener('blur', () => {
        if (ctrlKeyPressed) {
            ctrlKeyPressed = false;
            refreshTooltipForModifierKeys();
        }
    });
    
    // Listen for skill point changes to update tooltip if it's showing
    window.addEventListener('skillPointsChanged', onSkillPointsChangedForTooltip);
    // Refresh tooltip when planner Config toggles change condition state
    window.addEventListener('plannerConfigChanged', onPlannerConfigChangedForTooltip);
    
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

        // Refresh when Ctrl state changes while the tooltip is open
        const wasCtrlPressed = ctrlKeyPressed;
        const isCtrlPressedNow = e.ctrlKey;

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
        const skillData = getSkillDataFromStore(currentHoveredSkill, classIdNum);
        if (!skillData) return;
        const context = resolveTooltipContext(skillCard, skillData, currentHoveredSkill);
        applySkillVariantTextOverrides(skillData, context.variantKey);
        const content = await buildTooltipContent(
            skillData,
            context.currentLevel,
            context.warningMessage,
            context.isOSkill,
            context.variantKey,
            context.oskillSlotId
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
    const skillData = getSkillDataFromStore(skillId, classIdNum);
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
        context.variantKey,
        context.oskillSlotId
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
 * Refresh current tooltip (useful when soft-level bonuses change)
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
    const o = getFileSkillStore()?.getVariantTextOverrides(skillData.id, variantKey);
    if (!o) return;
    if (o.description != null && String(o.description).trim() !== '') skillData.description = o.description;
    if (o.skill_effect != null && String(o.skill_effect).trim() !== '') skillData.skillEffect = o.skill_effect;
    if (o.restriction != null && String(o.restriction).trim() !== '') skillData.restriction = o.restriction;
}

function getSkillDataFromFileStore(skillId, classIdNum = null) {
    const store = getFileSkillStore();
    if (!store?.gameMeta) return null;

    const internal = String(skillId || '').trim();
    if (!internal) return null;

    const cat =
        store.catalogByInternalId?.get(internal) ??
        store.catalog?.find((c) => c.id === internal) ??
        null;
    if (!cat) return null;

    if (classIdNum != null && Number.isFinite(classIdNum)) {
        if (!store.catalogRowMatchesPlannerClass(cat, classIdNum)) return null;
    }

    const det = store.getSkillDetail(internal);
    if (!det) return null;

    return {
        id: internal,
        displayName: det.display_name || cat.displayName || internal,
        description: det.description,
        skillEffect: det.skill_effect,
        restriction: det.restriction,
        image: det.image,
        className: det.className || store.primaryClassDisplayName(cat) || '',
        baseMaxLevel: cat.baseMaxLevel,
        affectedBySpecialization: cat.affectedBySpecialization ? 1 : 0,
        parentSkillId: cat.parentSkillId ?? null,
    };
}

/**
 * Resolve tooltip skill fields from the file skill store.
 * @param {string} skillId - Internal skill id (e.g. impale)
 * @param {number|null} classIdNum - class id from the hovered card (merged planner row disambiguation)
 */
function getSkillDataFromStore(skillId, classIdNum = null) {
    try {
        return getSkillDataFromFileStore(skillId, classIdNum);
    } catch (error) {
        console.error('Error fetching skill data for tooltip:', error);
    }
    return null;
}

/**
 * Get skill category tags for a skill
 * @param {string} skillId - catalog internal id
 * @returns {Array<string>} Array of tag names
 */
function getSkillCategoryTags(skillId) {
    const store = getFileSkillStore();
    const internal = skillId != null ? String(skillId).trim() : '';
    if (!internal || !store) return [];
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
 * @param {object} skillData - Skill fields from the file store
 * @param {number} level - Current skill level
 * @param {string} warningMessage - Optional warning message (e.g., prerequisite not met)
 * @param {string|null} [oskillSlotId] - Planner oSkill row id (data-oskill-slot-id); tree skills omit
 */
async function buildTooltipContent(
  skillData,
  level,
  warningMessage = '',
  isOSkill = false,
  variantKey = null,
  oskillSlotId = null
) {
    // Get skill soft-level bonuses for effective level calculation
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    const allSkillsBonus = allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
    const classSkillsBonusInput = document.getElementById('classSkillsBonus');
    const classSkillsBonus = classSkillsBonusInput
        ? Math.max(0, parseInt(classSkillsBonusInput.value) || 0)
        : 0;
    const character = getCharacterInstance();
    const charClassName = character?.className != null ? String(character.className) : '';
    const skillDisplayName =
        skillData.displayName != null && String(skillData.displayName).trim() !== ''
            ? String(skillData.displayName).trim()
            : String(skillData.id || '');
    const relicBonus = getRelicSkillBonusForSkill({
        skillId: skillData.id,
        displayName: skillDisplayName,
        isOSkill,
        className: charClassName,
        skillClass: skillData.className || skillData.class || '',
    });
    const itemOSkillBonus = isOSkill ? getOSkillItemPoints(skillData.id) : 0;
    const relicOSkillGrant = isOSkill
        ? Character.clampOSkillPoints(
            collectEnabledRelicOSkillGrants({ className: charClassName })[skillData.id] || 0
          )
        : 0;
    // Class skills bonus applies to tree skills only; oSkills get all-skills + item grants.
    // Item-granted oSkills have blvl 0; the relic/charm +N is slvl.
    const sourceAmounts = computeSkillBonusSourceAmounts({
        baseLevel: level,
        allSkillsBonus,
        classSkillsBonus,
        itemPoints: itemOSkillBonus,
        relicSoft: relicBonus,
        relicOSkillGrant,
        isOSkill,
    });
    const {
        effectiveLevel,
        appliedAllSkillsBonus,
        appliedClassSkillsBonus,
        appliedItemBonus,
        appliedRelicBonus,
    } = sourceAmounts;
    const scalingLevel = isOSkill ? effectiveLevel : level;
    
    const iconFolder = versionToTreeAssetFolder(getCurrentVersion());
    const iconHtml = getSkillIconHTML(skillData.image, skillData.className, 'is-64x64', iconFolder);

    let tagsHtml = '';
    const tags = getSkillCategoryTags(skillData.id);
    if (tags.length > 0) {
        tagsHtml += '<p class="is-size-7 has-text-weight-bold has-text-grey-lighter">';
        tagsHtml += tags.join(', ');
        tagsHtml += '</p>';
    }

    let subskillHtml = '';
    const parentId = skillData?.parentSkillId != null && String(skillData.parentSkillId).trim() !== '' ? String(skillData.parentSkillId).trim() : '';
    if (parentId) {
        const store = getFileSkillStore();
        const parentName = store?.lookupDisplayNameByInternalName(parentId) || parentId;
        subskillHtml = `<p class="is-size-7 has-text-grey-lighter">Subskill of <span class="has-text-weight-semibold">${escapeHtmlText(parentName)}</span></p>`;
    }

    const levelSectionHtml = `<div class="is-size-6 has-text-weight-bold has-text-warning-light">
                        Level ${effectiveLevel}
                    </div>`;

    const sourceRows = [
        {
            label: 'Base',
            valueHtml: `<span class="has-text-white">${level}</span>`,
        },
        {
            label: 'All skills',
            valueHtml: `<span class="has-text-info">+${appliedAllSkillsBonus}</span>`,
        },
        {
            label: 'Class skills',
            valueHtml: `<span class="skill-bonus-class">+${appliedClassSkillsBonus}</span>`,
        },
    ];
    if (isOSkill) {
        sourceRows.push({
            label: 'Item',
            valueHtml: `<span class="skill-bonus-item">+${appliedItemBonus}</span>`,
        });
    }
    sourceRows.push({
        label: 'Relic',
        valueHtml: `<span class="skill-bonus-relic">+${appliedRelicBonus}</span>`,
    });
    const sourcesHtml = buildSkillBonusSourcesTableHtml(sourceRows);

    const bodyParts = [
        buildSkillTooltipHeaderHtml({
            iconHtml,
            nameInnerHtml: formatDisplayNameWithVariantHtml(skillData.displayName, skillData.id, variantKey),
            tagsHtml,
            subskillHtml,
            levelSectionHtml,
        }),
    ];

    const conditionHtml = buildSkillTooltipConditionHtml(skillData);
    if (conditionHtml) {
        bodyParts.push(conditionHtml);
    }

    const slot = oskillSlotId != null ? String(oskillSlotId).trim() : '';
    const contributionsDisabled = isOSkill
      ? slot !== '' && isOSkillSlotDisabled(slot)
      : Boolean(skillData?.id && isSkillDisabled(skillData.id));
    if (contributionsDisabled) {
        bodyParts.push(buildSkillTooltipDisabledBannerHtml());
    }
    
    // Get character state for formula evaluation (needed for all tooltip content)
    const allSkillPoints = getAllSkillPoints();
    
    
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
    
    // Get character stats (include base_* attrs for formulas like ATMG Sentry)
    const characterInstance = getCharacterInstance();
    const characterStats = withBaseAttributeFormulaStats(getAllStats(), characterInstance);
    
    const oSkillRowsByName = new Map();
    for (const row of characterInstance?.oSkills || []) {
        const name = row?.skillName != null ? String(row.skillName).trim() : '';
        if (!name) continue;
        if (Character.effectiveOSkillPoints(row) <= 0) continue;
        oSkillRowsByName.set(name, row);
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
    
    const currentSkillName = skillData.id;
    const skillStore = getFileSkillStore();

    function relicSoftForSkill(skillName, skillIsOSkill) {
        const rowDisplay =
            skillStore?.lookupDisplayNameByInternalName?.(skillName) ||
            skillStore?.lookupDisplayNameByInternalName?.(String(skillName)) ||
            skillName;
        return getRelicSkillBonusForSkill({
            skillId: skillName,
            displayName: rowDisplay,
            isOSkill: skillIsOSkill,
            className: charClassName,
            skillClass: skillStore?.getSkillDetail?.(skillName)?.class
                || skillStore?.catalogByInternalId?.get?.(skillName)?.class
                || '',
        });
    }
    
    // Populate blvl based on whether this is a regular skill or oSkill
    if (isOSkill) {
        // For oSkills: use oSkill points for this skill, but regular skill points for all other skills
        // This allows oSkill formulas to reference other regular skills via [[skill_name]]
        for (const [skillName, points] of Object.entries(allSkillPoints)) {
            if (skillName !== currentSkillName && !oSkillRowsByName.has(skillName)) {
                characterState.blvl[skillName] = points;
            }
        }

        oSkillRowsByName.forEach((row, skillName) => {
            const extra = allSkillsBonus + relicSoftForSkill(skillName, true);
            const parts = Character.oSkillLevelParts(row, extra);
            characterState.blvl[skillName] = parts.blvl;
            characterState.lvl[skillName] = parts.slvl;
        });
        if (!oSkillRowsByName.has(currentSkillName)) {
            characterState.blvl[currentSkillName] = getOSkillManualPoints(currentSkillName);
            characterState.lvl[currentSkillName] = Math.min(
                allSkillsBonus + relicBonus + itemOSkillBonus,
                Math.max(0, 150 - (characterState.blvl[currentSkillName] || 0))
            );
        }
    } else {
        // For regular skills: only use regular skill points, exclude all oSkills
        // This ensures regular skill formulas don't use oSkill points
        for (const [skillName, points] of Object.entries(allSkillPoints)) {
            if (!oSkillRowsByName.has(skillName)) {
                characterState.blvl[skillName] = points;
            }
        }
        
        // Ensure current skill is included in blvl (even if 0 points)
        if (!characterState.blvl[currentSkillName]) {
            characterState.blvl[currentSkillName] = getSkillPoints(currentSkillName);
        }
    }
    
    // Calculate lvl for each skill (soft bonuses only, not including base points).
    // oSkills: all-skills + relic + item grants (capped so total <= 150). Tree skills: class + all + relic.
    for (const [skillName, points] of Object.entries(characterState.blvl)) {
        if (characterState.lvl[skillName] != null) continue;
        const skillIsOSkill =
            (isOSkill && skillName === currentSkillName) || oSkillRowsByName.has(skillName);
        const skillRelic = relicSoftForSkill(skillName, skillIsOSkill);
        const itemSlvl = skillIsOSkill
            ? Character.clampOSkillPoints(oSkillRowsByName.get(skillName)?.itemPoints ?? 0)
            : 0;
        const pointsOnly = Math.max(0, Math.floor(Number(points) || 0));

        if (skillIsOSkill) {
            characterState.lvl[skillName] = Math.min(
                allSkillsBonus + skillRelic + itemSlvl,
                Math.max(0, 150 - pointsOnly)
            );
        } else {
            characterState.lvl[skillName] = allSkillsBonus + classSkillsBonus + skillRelic;
        }
    }
    
    // Check if Ctrl key is pressed (for formula display)
    const showFormulas = ctrlKeyPressed;
    
    let mainDescHtml = '';
    if (skillData.description) {
        mainDescHtml = await expandPlaceholdersWithScaling(
            skillData.id,
            scalingLevel,
            skillData.description,
            skillData.id,
            characterState,
            showFormulas,
            variantKey
        );
    }

    const hasScaling = checkSkillHasScaling(skillData.id);
    const levelIndicatorHtml = hasScaling
        ? `<div class="tooltip-level-indicator is-italic">Level ${scalingLevel} values:</div>`
        : '';

    let effectExpanded = '';
    if (skillData.skillEffect) {
        effectExpanded = await expandPlaceholdersWithScaling(
            skillData.id,
            scalingLevel,
            skillData.skillEffect,
            skillData.id,
            characterState,
            showFormulas,
            variantKey
        );
    }

    if (skillData.description || skillData.skillEffect) {
        bodyParts.push(
            buildSkillTooltipDescriptionBlock({
                mainDescHtml,
                levelIndicatorHtml,
                effectExpanded,
                preserveBlankEffectLines: true,
                wrapperClass: 'tooltip-description p-0',
            })
        );
    }

    if (skillData.restriction) {
        const expandedRestriction = await expandPlaceholdersWithScaling(
            skillData.id,
            scalingLevel,
            skillData.restriction,
            skillData.id,
            characterState,
            showFormulas,
            variantKey
        );
        bodyParts.push(buildSkillTooltipRestrictionBlock(expandedRestriction));
    }

    bodyParts.push(buildSkillTooltipPrerequisiteWarningHtml(warningMessage));

    if (!isOSkill && skillData.id) {
        const scalingLines = getMaxLevelModifierDescriptionsForSkill(
            skillData.id,
            characterState.blvl,
            characterLevel
        );
        bodyParts.push(buildSkillTooltipScalingBlockHtml(scalingLines));
    }

    return wrapSkillTooltipContent(bodyParts.join(''), sourcesHtml);
}

/**
 * Check if a skill has scaling data
 */
function checkSkillHasScaling(internalId) {
    try {
        const store = getFileSkillStore();
        if (!store || !internalId) return false;
        return store.hasScalingData(String(internalId), store.getBalanceVersionIds());
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
    window.removeEventListener('plannerConfigChanged', onPlannerConfigChangedForTooltip);
    window.removeEventListener('tooltipRefresh', onTooltipRefreshEvent);
    
    // Reset Ctrl key state
    ctrlKeyPressed = false;
}

function resolveTooltipContext(skillCard, skillData, skillId) {
    const isOSkill = Boolean(skillCard && skillCard.closest('#tab-oSkills'));
    const rawSlot = skillCard?.dataset?.oskillSlotId;
    const oskillSlotId =
        rawSlot != null && String(rawSlot).trim() !== '' ? String(rawSlot).trim() : null;
    const isInnate = Boolean(
        skillCard &&
        skillData &&
        isInnateSkill({ id: skillData.id })
    );
    const currentLevel = isOSkill
        ? getOSkillManualPoints(skillId)
        : isInnate
            ? 1
            : getSkillPoints(skillId);
    const warningMessage = isOSkill
        ? ''
        : (skillCard?.querySelector('.skill-plus-btn')?.dataset?.warningMessage || '');
    const variantKey = resolveVariantKeyForTooltip(skillData.id, skillCard);
    return { isOSkill, currentLevel, warningMessage, variantKey, oskillSlotId };
}
