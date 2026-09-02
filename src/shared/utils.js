import Skill from '@/skills/domain/Skill.js';
import { isSubskillActive } from '@/skills/domain/conditional-subskills.js';
import { isScalingConstantRowActive } from '@/skills/domain/show-conditions.js';
import {
    lookupMergedDisplayNameByInternalName,
    getFileSkillStore
} from '@/shared/skill-data-store.js';
import { formulaEvaluator } from '@/skills/domain/formula-evaluator.js';
import { formatScalingValuesToDescriptionHtml } from '@/skills/domain/scaling-display-html.js';
import { DEFAULT_TREE_ASSET_FOLDER } from '@/shared/version-constants.js';

// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);

/** Sentinel / JSON key for a missing skill icon (not a file path). */
export const MISSING_IMAGE_NAME = 'icons-shared_missing';

/**
 * HTML classes used by scaling placeholder rendering (tooltips / descriptions).
 * Single source of truth (was duplicated in skills/scaling-display-html.js).
 */
export const SCALING_DISPLAY_HTML_CLASSES = Object.freeze({
    unknown: "has-text-danger",
    formula: "has-text-info",
    default: "has-text-primary",
    constants: "has-text-white",
    skill: "has-text-success"
});

/**
 * Escape text for safe insertion into HTML text or attribute values.
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtmlText(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** @type {typeof escapeHtmlText} */
export const escapeHtmlAttr = escapeHtmlText;

/**
 * Same 48×48 div shell as atlas sprites so callers (e.g. HomeView `scale(5)`) size them equally.
 * @param {string} className
 */
function missingIconPictureHTML(className) {
    const webp = getAssetUrl(`icons/${MISSING_IMAGE_NAME}.webp`);
    const cls = escapeHtmlAttr(`image ${className}`.trim());
    const webpEsc = escapeHtmlAttr(webp);
    const bgImage = `background-image:url('${webpEsc}');`;
    return `<div class="${cls}" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;${bgImage}background-size:${ICON_SIZE}px ${ICON_SIZE}px;background-repeat:no-repeat;" role="img" aria-label="missing icon"></div>`;
}

/**
 * Skill Tag Group Constants
 * Shared across the application for consistent tag categorization
 */
export const TAG_GROUPS = {
    "Skill Category": [8, 9, 11, 12, 14, 15, 17, 22, 25, 26, 27, 28, 29, 32, 35, 36, 38, 39],
    "Damage": [1, 2, 3, 4, 5, 6, 7, 21, 23],
    "Summon": [13, 30, 31],
    "Teleport": [10, 20, 24],
    "Custom": [16, 18, 19, 33, 34, 37]
};

// --- Skill data (tree_data JSON) load error ---

export function showSkillDataLoadError(errorMessage, contentElement = null) {
    const targetElement = contentElement || document.getElementById('content');
    if (!targetElement) {
        console.error('No content element found for skill data error display');
        return;
    }

    const safeMsg = escapeHtmlText(errorMessage ?? 'Unknown error');

    targetElement.innerHTML = `
        <div class="box">
            <div class="content">
                <h3 class="title is-4 has-text-danger">Could not load skill data</h3>
                <p>Skill trees and descriptions are loaded from <code>tree_data/</code> (JSON). Something went wrong while fetching or parsing those files.</p>
                <p>Try:</p>
                <ul>
                    <li>Refresh the page (or hard refresh if assets were cached)</li>
                    <li>Confirm you are opening the site from a server or path where <code>tree_data/</code> is deployed</li>
                    <li>Check your network connection if this is hosted remotely</li>
                </ul>
                <p class="has-text-danger"><strong>Details:</strong> ${safeMsg}</p>
                <button class="button is-danger" onclick="location.reload()">Refresh page</button>
            </div>
        </div>
    `;
}

// --- URL Helpers ---

/**
 * Resolve a public asset path with Vite `BASE_URL` (GitHub Pages subpath, etc.).
 * @param {string} relativePath - e.g. `tree_data/2_13/class-ama.webp`
 * @returns {string} Absolute URL
 */
export function getAssetUrl(relativePath) {
    const base = import.meta.env.BASE_URL || '/';
    return new URL(relativePath, window.location.origin + base).href;
}

/**
 * Resolve a planner item inventory icon URL from its catalog `icon` stem.
 * @param {string|null|undefined} iconKey - e.g. `invpa4`
 * @returns {string} Absolute URL, or empty string when `iconKey` is missing
 */
export function getItemIconUrl(iconKey) {
    const key = (iconKey && String(iconKey).trim()) || '';
    if (!key) return '';
    return getAssetUrl(`icons/item_icons/${key}.webp`);
}

export function getUrlParams() {
    return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

export function updateUrl(skillId = null) {
    const url = new URL(window.location.href);
    if (skillId) {
        url.searchParams.set('skill', skillId);
        // Preserve filter state when navigating to skill detail
        const currentFilter = url.searchParams.get('filter');
        if (currentFilter) {
            // Filter is already in URL, keep it
        }
    } else {
        url.searchParams.delete('skill');
    }
    window.history.pushState({ skillId }, '', url.toString());
}

export function sanitizeSkillId(skillId) {
    return skillId.replace(/[^a-zA-Z0-9_-]/g, ''); // safe only
}

// --- Formatting ---
export function formatStatName(stat) {
    return stat.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

/**
 * @param {string} gameVersionFolder - e.g. "2_14"; atlas URLs are tree_data/<folder>/class-<prefix>.webp; if omitted, uses {@link DEFAULT_TREE_ASSET_FOLDER}.
 */
export function getIconHTML(imagePath, className = '', gameVersionFolder = null) {
    if (!imagePath) return "";
    if (imagePath === MISSING_IMAGE_NAME) {
        return missingIconPictureHTML(className);
    }

    // Atlas keys: "icons-<prefix>_<index>" (not a file path)
    const match = imagePath.match(/^(?:icons|image)-([a-z]+)_(\d+)$/i);
    if (!match) {
        return missingIconPictureHTML(className);
    }

    const prefix = match[1];
    const index = parseInt(match[2], 10);
    const x = (index % ICONS_PER_ROW) * ICON_SIZE;
    const y = Math.floor(index / ICONS_PER_ROW) * ICON_SIZE;

    const folder = (gameVersionFolder && String(gameVersionFolder).trim())
        ? String(gameVersionFolder).trim()
        : DEFAULT_TREE_ASSET_FOLDER;
    const atlasWebp = getAssetUrl(`tree_data/${folder}/class-${prefix}.webp`);
    const webpEsc = escapeHtmlAttr(atlasWebp);
    const bgImage = `background-image:url('${webpEsc}');`;

    return `
        <div class="image ${className}"
            style="
                width:${ICON_SIZE}px;
                height:${ICON_SIZE}px;
                ${bgImage}
                background-position:-${x}px -${y}px;
            ">
        </div>
    `;
}

// --- Skill icon resolver ---
// Atlas-style keys (icons-<prefix>_N / image-<prefix>_N) load sprites from
// tree_data/<version>/class-<prefix>.webp. Missing / unknown names use icons/ placeholders.

/**
 * @param {string|null|undefined} imageFileName - atlas key from data (e.g. "icons-pal_132")
 * @param {string|null|undefined} _humanClassName - unused; kept for call-site compatibility
 * @param {string} [className] - extra CSS class on the icon element
 * @param {string|null|undefined} gameVersionFolder - e.g. "2_14"; atlas sprites from tree_data/<folder>/class-*.webp
 */
export function getSkillIconHTML(imageFileName, _humanClassName, className = '', gameVersionFolder = null) {
    const file = (imageFileName && imageFileName.trim().length > 0) ? imageFileName.trim() : MISSING_IMAGE_NAME;
    const atlasVersionFolder = gameVersionFolder && String(gameVersionFolder).trim().length > 0
        ? String(gameVersionFolder).trim()
        : null;

    if (/^(?:icons|image)-[a-z]+_\d+$/i.test(file)) {
        return getIconHTML(file, className, atlasVersionFolder);
    }

    return missingIconPictureHTML(className);
}


// --- Placeholder Expansion Utilities ---

/**
 * Calculate mana cost from mana, lvlmana, manashift parameters
 * @param {number|string} mana - Base mana cost at level 1 (value0)
 * @param {number|string} lvlmana - Change in mana cost per skill level (value1)
 * @param {number|string} manashift - Bitwise shift multiplier for precision (value2)
 * @param {number} level - Current skill level
 * @param {number|string|undefined|null} [minMana] - Optional floor from `mana_cost` min_mana / value3; omitted means cost may be 0
 * @param {{ channeled?: boolean, manaCostOfSkillsPercent?: number }} [options]
 *   `manaCostOfSkillsPercent` — planner "% Mana cost of skills" included in the formula:
 *   lvlmana is scaled as trunc(lvlmana * (100 + pct) / 100) before level growth
 *   (matches Dragonbone 35/57/79 at blvl 1/2/3 with pct 10/11/11).
 * @returns {number} Calculated mana cost (integer, or one decimal when channeled)
 */
export function calculateManaCost(mana, lvlmana, manashift, level, minMana, options = {}) {
    const channeled = Boolean(options.channeled);
    const manaCostOfSkillsPercent = Math.trunc(Number(options.manaCostOfSkillsPercent) || 0);
    // Ensure level is at least 1
    const effectiveLevel = Math.max(1, level || 1);
    
    // Convert to numbers, defaulting to 0 if invalid
    const manaNum = parseFloat(mana) || 0;
    const lvlmanaNum = parseFloat(lvlmana) || 0;
    const manashiftNum = parseFloat(manashift) || 0;
    
    // Truncate mana and lvlmana before adding
    const truncatedMana = Math.trunc(manaNum);
    let truncatedLvlmana = Math.trunc(lvlmanaNum);
    // Include "% Mana cost of skills" in the per-level term (not a post-replace of the cost).
    if (manaCostOfSkillsPercent !== 0) {
        truncatedLvlmana = Math.trunc((truncatedLvlmana * (100 + manaCostOfSkillsPercent)) / 100);
    }
    
    // Calculate base mana: trunc(mana) + trunc(lvlmana') * (level - 1)
    const baseMana = truncatedMana + truncatedLvlmana * (effectiveLevel - 1);
    
    // Apply manashift: (baseMana * (2^manashift)) / 256
    const shiftMultiplier = Math.pow(2, manashiftNum);
    const totalMana256ths = (baseMana * shiftMultiplier) / 256;
    
    let cost = channeled ? totalMana256ths : Math.trunc(totalMana256ths);
    const useMin =
        minMana !== undefined &&
        minMana !== null &&
        !(typeof minMana === 'string' && minMana.trim() === '');
    if (useMin) {
        const minFloor = channeled
            ? Math.max(0, parseFloat(minMana) || 0)
            : Math.max(0, Math.trunc(parseFloat(minMana) || 0));
        cost = Math.max(minFloor, cost);
    } else {
        cost = Math.max(0, cost);
    }
    if (channeled) {
        return Math.round(cost * 10) / 10;
    }
    return cost;
}

/**
 * @param {number} cost
 * @param {{ channeled?: boolean }} [options]
 * @returns {string}
 */
export function formatManaCostDisplay(cost, options = {}) {
    if (options.channeled) {
        return (Math.round(Number(cost) * 10) / 10).toFixed(1);
    }
    return String(cost);
}

/**
 * @deprecated Prefer calculateManaCost(..., { manaCostOfSkillsPercent }).
 * Kept for tests/callers that scale an already-computed cost.
 * @param {number} cost
 * @param {number|string|undefined|null} percentIncrease
 * @param {{ channeled?: boolean }} [options]
 * @returns {number}
 */
export function applyManaCostMultiplier(cost, percentIncrease, options = {}) {
    // Legacy post-scale; Dragonbone series needs lvlmana scaling inside calculateManaCost instead.
    const base = Number(cost);
    if (!Number.isFinite(base)) return 0;
    const pct = Math.trunc(Number(percentIncrease) || 0);
    if (pct === 0) {
        return options.channeled ? Math.round(base * 10) / 10 : Math.trunc(base);
    }
    const scaled = (base * (100 + pct)) / 100;
    if (options.channeled) {
        return Math.round(scaled * 10) / 10;
    }
    return Math.trunc(scaled);
}

/**
 * Total "% Mana cost of skills" for planner mana display.
 * Prefers character mana_cost_of_skills (manual base + skill pairedStat bonuses);
 * falls back to summing allocated mana_cost_multiplier rows.
 * @param {object|null|undefined} characterState
 * @returns {Promise<number>}
 */
export async function getPlannerManaCostOfSkillsPercent(characterState) {
    try {
        const { getCharacterInstance } = await import('@/character/planner-instance.js');
        const character = getCharacterInstance();
        if (character && typeof character.getStat === 'function') {
            const fromChar = Math.trunc(Number(character.getStat('mana_cost_of_skills')) || 0);
            // Prefer live character total whenever the planner is available.
            return fromChar;
        }
    } catch {
        // browse / tests without planner instance
    }

    const fromState = characterState?.stats?.mana_cost_of_skills;
    if (fromState != null && String(fromState).trim() !== '') {
        const n = Math.trunc(Number(fromState) || 0);
        if (Number.isFinite(n)) return n;
    }

    return sumPlannerManaCostMultiplierPercent(characterState);
}

/**
 * Sum mana_cost_multiplier % from allocated skills (and oSkills).
 * Fallback when character mana_cost_of_skills is unavailable.
 * @param {object|null|undefined} characterState
 * @returns {Promise<number>}
 */
export async function sumPlannerManaCostMultiplierPercent(characterState) {
    if (!characterState || typeof characterState !== 'object') return 0;
    const store = getFileSkillStore();
    if (!store?.catalogByInternalId) return 0;

    /** @type {Record<string, number>} */
    const blvlMap = { ...(characterState.blvl || {}) };

    /** @type {{ isSkillDisabled?: (id: string) => boolean, oSkills?: object[] } | null} */
    let character = null;
    try {
        const { getCharacterInstance } = await import('@/character/planner-instance.js');
        character = getCharacterInstance();
    } catch {
        // keep character null when planner instance is unavailable
    }

    // Regular-skill tooltips omit oSkills from blvl; still fold in oSkill multipliers.
    // Item-granted oSkills have blvl 0; their grant is slvl.
    /** @type {Record<string, number>} */
    const slvlMap = { ...(characterState.lvl || {}) };
    if (character && Array.isArray(character.oSkills)) {
        const { default: Character } = await import('@/character/Character.js');
        for (const row of character.oSkills) {
            const name = row?.skillName != null ? String(row.skillName).trim() : '';
            if (!name) continue;
            const parts = Character.oSkillLevelParts(row, 0);
            if (parts.effective <= 0) continue;
            blvlMap[name] = Math.max(blvlMap[name] || 0, parts.blvl);
            if (slvlMap[name] == null) {
                slvlMap[name] = parts.itemSlvl;
            }
        }
    }

    const defaultSlvl = Math.max(
        0,
        ...Object.values(slvlMap)
            .map((v) => Math.floor(Number(v) || 0))
            .filter((n) => Number.isFinite(n))
    );

    let total = 0;
    const ulvl = Math.max(1, Math.floor(Number(characterState.level) || 1));

    for (const [rawId, rawPts] of Object.entries(blvlMap)) {
        const internalId = String(rawId || '').trim();
        if (!internalId) continue;
        const blvlPoints = Math.max(0, Math.floor(Number(rawPts) || 0));
        const slvlRaw = slvlMap[internalId];
        const slvl =
            slvlRaw != null && String(slvlRaw).trim() !== ''
                ? Math.max(0, Math.floor(Number(slvlRaw) || 0))
                : defaultSlvl;
        if (blvlPoints <= 0 && slvl <= 0) continue;
        if (character?.isSkillDisabled?.(internalId)) continue;

        const catRow = store.catalogByInternalId.get(internalId);
        if (!catRow) continue;
        const scalingConstants = Array.isArray(catRow.scalingConstants) ? catRow.scalingConstants : [];
        const multRows = scalingConstants.filter(
            (r) => String(r?.statKey || '').trim().toLowerCase() === 'mana_cost_multiplier'
        );
        if (multRows.length === 0) continue;

        const lvl = blvlPoints + slvl || 1;
        const formulaVariables = {
            blvl: blvlPoints,
            slvl,
            lvl,
            ulvl,
            _blvl: blvlMap,
            _lvl: slvlMap,
            characterState: { ...characterState, blvl: blvlMap, lvl: slvlMap }
        };

        for (const scRow of multRows) {
            if (!isScalingConstantRowActive(catRow, scRow)) continue;
            const formula = scRow?.value0;
            if (formula == null || String(formula).trim() === '') continue;
            const str = String(formula).trim();
            if (/^-?\d+(\.\d+)?$/.test(str)) {
                total += Math.trunc(parseFloat(str) || 0);
                continue;
            }
            const evalResult = formulaEvaluator.evaluate(str, formulaVariables);
            if (evalResult.success) {
                total += Math.trunc(Number(evalResult.value) || 0);
            }
        }
    }

    return total;
}

/**
 * Minion summon mana cost matching game integer math for % of Maximum Mana skills:
 *   unit = trunc(mana / 100)           // trunc(stat(9,0) / 25600)
 *   raw  = trunc(percent) * unit
 *   lvlmana = trunc(raw / max(1, lvl-1))
 *   cost = mana_cost(1, lvlmana, manashift=8, lvl, minmana=1)
 * Cap / per-minion math belongs in the value0 formula (e.g. min(5*pets, 50)).
 * @param {number|string} percentManaCost - value0: % of Maximum Mana
 * @param {number|string|undefined|null} [maxMana] - planner Maximum Mana when available
 * @param {number|string|undefined|null} [skillLevel] - effective skill level (blvl+slvl)
 * @param {{ manaCostOfSkillsPercent?: number }} [options]
 * @returns {{ percent: number, cost: number|null, mode: 'absolute'|'percent' }}
 */
export function calculateMinionManaCost(percentManaCost, maxMana, skillLevel, options = {}) {
    const rawPercent = Math.max(0, parseFloat(percentManaCost) || 0);
    // Keep one decimal for display (e.g. 4.5); cost math uses trunc(percent)
    const percent = Math.round(rawPercent * 10) / 10;
    const pctInt = Math.max(0, Math.trunc(percent));

    const manaNum = maxMana === undefined || maxMana === null || String(maxMana).trim() === ''
        ? null
        : Number(maxMana);
    if (manaNum != null && Number.isFinite(manaNum)) {
        const mana = Math.max(0, Math.trunc(manaNum));
        const lvl = Math.max(1, Math.trunc(Number(skillLevel) || 1));
        const unit = Math.trunc(mana / 100);
        const raw = pctInt * unit;
        const denom = Math.max(1, lvl - 1);
        const lvlmana = Math.trunc(raw / denom);
        const cost = calculateManaCost(1, lvlmana, 8, lvl, 1, {
            manaCostOfSkillsPercent: options.manaCostOfSkillsPercent
        });
        return { percent, cost, mode: 'absolute' };
    }
    return { percent, cost: null, mode: 'percent' };
}

/**
 * @param {{ percent: number, cost: number|null, mode: 'absolute'|'percent' }} result
 * @returns {{ value0: string, value1: string }}
 */
export function formatMinionManaCostDisplay(result) {
    const pct = result?.percent ?? 0;
    const pctStr = Number.isInteger(pct) ? String(pct) : String(pct);
    if (result?.mode === 'absolute' && result.cost != null) {
        return { value0: String(result.cost), value1: pctStr };
    }
    return { value0: null, value1: pctStr };
}

// Expand using values sourced from skill_scaling for a given skill and level.
// If inline values are provided in the token, they take precedence; otherwise fetch by stat key.
// Also supports [[internal_name]] which expand to display_name in success color
// Also supports <<internal_name>> which expands to a labeled subskill "block":
// the referenced skill's display name + its full skillEffect text with placeholders resolved.
export async function expandPlaceholdersWithScaling(skillId, level, description, skillName = null, characterState = null, showFormulas = false, variantKey = null) {
    if (!description) return '';
    
    if (!getFileSkillStore()) return description;
    
    // Track occurrence counts for each stat key to maintain order
    const occurrenceCounts = new Map();

    const crossSkillDotStatRe =
        /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/gi;

    let expandedDescription = description;
    if (characterState) {
        const charLevel = characterState.level ?? 1;
        expandedDescription = await Skill.expandCrossSkillCompoundPlaceholdersHtml(
            expandedDescription,
            characterState,
            charLevel,
            showFormulas,
            0
        );
    } else {
        expandedDescription = expandedDescription.replace(
            crossSkillDotStatRe,
            '<span class="has-text-grey">[set character to preview]</span>'
        );
    }

    // Expand <<internal_name>> into a subskill block (name + all effect lines).
    // Blocks are fully expanded first, then shielded from parent [[...]] and {{...}} passes
    // (showFormulas may leave [[skill]].{{stat}} / {{character_stat}} inside formula text).
    const subskillBlockRe = /<<([a-zA-Z_][a-zA-Z0-9_]*)>>/gi;
    const subskillMatches = [...String(expandedDescription).matchAll(subskillBlockRe)];
    const subskillBlockPlaceholders = [];
    if (subskillMatches.length > 0) {
        const store = getFileSkillStore();
        for (const m of subskillMatches) {
            const full = m[0];
            const refToken = m[1];
            const resolved = store?.resolveCrossSkillRef(refToken, []);
            if (!resolved) {
                expandedDescription = expandedDescription.replace(
                    full,
                    `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[unknown skill ${escapeHtmlAttr(refToken)}]</span>`
                );
                continue;
            }

            const det = store.getSkillDetail(resolved.internalName);
            const rawEffect = det?.skill_effect ?? '';
            const subskillRow = store.catalogByInternalId?.get?.(resolved.internalName) ?? null;
            const active = isSubskillActive(subskillRow, characterState);
            const expandedEffect = await expandPlaceholdersWithScaling(
                resolved.internalName,
                level,
                rawEffect,
                resolved.internalName,
                characterState,
                showFormulas,
                null
            );
            const effectHtml = String(expandedEffect).replace(/\r?\n/g, '<br>');
            const label = escapeHtmlText(resolved.displayName || resolved.internalName);
            const blockClass = active
                ? 'subskill-inline-block'
                : 'subskill-inline-block subskill-inline-block--inactive';
            const labelClass = active
                ? 'subskill-inline-legend has-text-warning has-text-weight-semibold'
                : 'subskill-inline-legend has-text-grey has-text-weight-semibold';
            const bodyClass = active ? 'subskill-inline-body' : 'subskill-inline-body has-text-grey';
            // Keep the block on one line so tooltip line-splitting does not break the wrapper.
            const block = `<fieldset class="${blockClass}"><legend class="${labelClass}">${label}</legend><div class="${bodyClass}">${effectHtml}</div></fieldset>`;
            const placeholderToken = `\x00SUBSKILL_BLOCK_${subskillBlockPlaceholders.length}\x00`;
            subskillBlockPlaceholders.push(block);
            expandedDescription = expandedDescription.replace(full, placeholderToken);
        }
    }

    const restoreSubskillBlocks = (text) => {
        let out = String(text);
        for (let i = 0; i < subskillBlockPlaceholders.length; i++) {
            out = out.split(`\x00SUBSKILL_BLOCK_${i}\x00`).join(subskillBlockPlaceholders[i]);
        }
        return out;
    };
    
    // First, expand [[internal_name]]
    expandedDescription = expandedDescription.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
        const trimmed = inner.trim();
        if (!trimmed) return match;

        try {
            const displayName = lookupMergedDisplayNameByInternalName(trimmed);
            if (displayName) {
                return `<span class='${SCALING_DISPLAY_HTML_CLASSES.skill}'>${displayName}</span>`;
            }
            return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[unknown skill:${trimmed}]</span>`;
        } catch (error) {
            console.warn('Error expanding skill name placeholder:', error);
            return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[skill placeholder error]</span>`;
        }
    });

    // Expand parent {{stat}} while subskill blocks stay shielded, then restore.
    // Restoring earlier re-expands {{character_stat}} left inside Ctrl formula text as skill stats (???%).
    const placeholderMatches = expandedDescription.match(/\{\{(.*?)\}\}/g);
    if (!placeholderMatches) {
        return restoreSubskillBlocks(expandedDescription);
    }
    
    let result = expandedDescription;
    for (const match of placeholderMatches) {
        const token = match.slice(2, -2); // Remove {{ and }}
        const [rawKey, _rawValues] = token.split(':').map(s => s.trim());
        const key = (rawKey || '').toLowerCase();
        
        // Track occurrence index for this stat key
        const occurrenceIndex = occurrenceCounts.get(key) || 0;
        occurrenceCounts.set(key, occurrenceIndex + 1);

        let output = `[Unknown stat: ${rawKey}]`;
        let name = null;
        let format = null;
        let actualSkillName = skillName;
        let placeholderConditionInactive = false;

        const store = getFileSkillStore();
        const statRow = store?.getStatByKeyLower(key);
        if (statRow) {
            name = statRow.name;
            format = statRow.format;
        }
        if (!actualSkillName && store && skillId != null) {
            const id = String(skillId);
            if (store.catalogByInternalId?.get(id)) actualSkillName = id;
        }

        if (name != null) {
            if (actualSkillName) {
                const mergedDisplay = lookupMergedDisplayNameByInternalName(actualSkillName);
                const displayName = mergedDisplay || actualSkillName;

                // Subskills are not allocated directly; they should scale with their parent's points.
                // If this row has a parentSkillId, mirror the parent's blvl/slvl onto this skill id
                // for placeholder evaluation.
                let effectiveCharacterState = characterState;
                let effectiveLevel = level;
                const catalogRow = store?.catalogByInternalId?.get?.(String(actualSkillName)) ?? null;
                if (characterState && store) {
                    const cat = catalogRow;
                    const parentIdRaw = cat?.parentSkillId;
                    const parentId =
                        parentIdRaw != null && String(parentIdRaw).trim() !== ''
                            ? String(parentIdRaw).trim()
                            : null;
                    if (parentId) {
                        const parentBlvl = characterState.blvl?.[parentId] ?? 0;
                        const parentSlvl = characterState.lvl?.[parentId] ?? 0;
                        const patchedBlvl = { ...(characterState.blvl || {}), [actualSkillName]: parentBlvl };
                        const patchedSlvl = { ...(characterState.lvl || {}), [actualSkillName]: parentSlvl };
                        effectiveCharacterState = { ...characterState, blvl: patchedBlvl, lvl: patchedSlvl };
                        const lvlSum = (Number(parentBlvl) || 0) + (Number(parentSlvl) || 0);
                        if (Number.isFinite(lvlSum) && lvlSum > 0) {
                            effectiveLevel = lvlSum;
                        }
                    }
                }

                // Match Soulchain inactive subskills: grey showCondition-gated lines when off
                const scRows = Array.isArray(catalogRow?.scalingConstants)
                    ? catalogRow.scalingConstants
                    : [];
                const vk =
                    variantKey != null && String(variantKey).trim() !== ''
                        ? String(variantKey).trim()
                        : null;
                const scHit = scRows.find((r) => {
                    if (String(r?.statKey || '').toLowerCase() !== key) return false;
                    if (Number(r?.occurrenceIndex ?? 0) !== occurrenceIndex) return false;
                    const rowVk =
                        r?.variantKey != null && String(r.variantKey).trim() !== ''
                            ? String(r.variantKey).trim()
                            : null;
                    if (vk) return rowVk === vk;
                    return rowVk == null;
                });
                if (scHit && !isScalingConstantRowActive(catalogRow, scHit)) {
                    placeholderConditionInactive = true;
                }

                const skill = new Skill({
                    id: actualSkillName,
                    name: displayName,
                    tags: Array.isArray(catalogRow?.tags) ? catalogRow.tags : [],
                });
                const scalingValues = await skill.getScalingValues(
                    effectiveLevel,
                    key,
                    occurrenceIndex,
                    effectiveCharacterState,
                    effectiveCharacterState?.level,
                    showFormulas,
                    0,
                    variantKey
                );
                
                if (scalingValues) {
                    const blvl = effectiveCharacterState?.blvl?.[actualSkillName] || 0;
                    const slvl = effectiveCharacterState?.lvl?.[actualSkillName] || 0;
                    const lvl = (Number(blvl) || 0) + (Number(slvl) || 0) || Math.max(1, Number(effectiveLevel) || 1);
                    const formulaVariables = {
                        blvl,
                        slvl,
                        lvl,
                        ulvl: effectiveCharacterState?.level || 1,
                        _blvl: effectiveCharacterState?.blvl || {},
                        _lvl: effectiveCharacterState?.lvl || {},
                        characterState: effectiveCharacterState || null
                    };

                    // Helper to parse or evaluate a numeric value.
                    const parseOrEvaluate = (value) => {
                        const strValue = String(value ?? '').trim();
                        if (!strValue) return 0;
                        const isPureNumber = /^-?\d+(\.\d+)?$/.test(strValue);
                        if (isPureNumber) return parseFloat(strValue) || 0;
                        const evalResult = formulaEvaluator.evaluate(strValue, formulaVariables);
                        if (evalResult.success) return Number(evalResult.value) || 0;
                        return 0;
                    };

                    if (key === 'mana_cost') {
                        const v0 = scalingValues.value0 ?? ''; // mana
                        const v1 = scalingValues.value1 ?? ''; // lvlmana
                        const v2 = scalingValues.value2 ?? ''; // manashift
                        
                        // Check if any values are missing
                        const hasMissingValues = v0 === '' || v0 === null || v0 === undefined ||
                                               v1 === '' || v1 === null || v1 === undefined ||
                                               v2 === '' || v2 === null || v2 === undefined;
                        
                        if (hasMissingValues) {
                            // Show ??? if any required values are missing
                            const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', q)
                                .replace('{value1}', q)
                                .replace('{value2}', q)
                                .replace('{value3}', q);
                        } else {
                            const mana = parseOrEvaluate(v0);
                            const lvlmana = parseOrEvaluate(v1);
                            const manashift = parseOrEvaluate(v2);
                            const v3 = scalingValues.value3 ?? '';
                            const hasMinMana =
                                v3 !== '' && v3 !== null && v3 !== undefined;
                            const minManaNum = hasMinMana ? parseOrEvaluate(v3) : undefined;

                            const channeled = skill.hasTag("Channeled");
                            const manaCostOfSkillsPercent = await getPlannerManaCostOfSkillsPercent(
                                effectiveCharacterState
                            );

                            const calculatedMana = calculateManaCost(
                                mana,
                                lvlmana,
                                manashift,
                                lvl,
                                hasMinMana ? minManaNum : undefined,
                                { channeled, manaCostOfSkillsPercent }
                            );

                            const manaDisplay = formatManaCostDisplay(calculatedMana, { channeled });
                            const calculatedValueHtml = `<span class="${SCALING_DISPLAY_HTML_CLASSES.formula}">${manaDisplay}</span>`;
                            
                            // Replace all value placeholders with the calculated value
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', calculatedValueHtml)
                                .replace('{value1}', "")
                                .replace('{value2}', "")
                                .replace('{value3}', "");
                        }
                    // Special handling for minion_mana_cost:
                    // value0 = % of Maximum Mana; flat cost from game integer mana path
                    } else if (key === 'minion_mana_cost') {
                        const v0 = scalingValues.value0 ?? ''; // percent mana cost (or formula when Ctrl)
                        const hasMissingPercent =
                            v0 === '' || v0 === null || v0 === undefined;

                        const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                        if (hasMissingPercent) {
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', q)
                                .replace('{value1}', q)
                                .replace('{value2}', '')
                                .replace('{value3}', '');
                        } else {
                            // Ctrl/showFormulas keeps the formula string in value0; use the
                            // properly cross-skill-evaluated number for the flat cost.
                            const percentSource =
                                showFormulas && scalingValues.value0_evaluated != null
                                    ? scalingValues.value0_evaluated
                                    : v0;
                            const percentManaCost = parseOrEvaluate(percentSource);
                            const maxManaRaw = effectiveCharacterState?.stats?.mana;
                            const manaCostOfSkillsPercent = await getPlannerManaCostOfSkillsPercent(
                                effectiveCharacterState
                            );
                            const result = calculateMinionManaCost(percentManaCost, maxManaRaw, lvl, {
                                manaCostOfSkillsPercent
                            });
                            const display = formatMinionManaCostDisplay(result);
                            const formulaClass = SCALING_DISPLAY_HTML_CLASSES.formula;
                            const value0Html = display.value0 != null
                                ? `<span class="${formulaClass}">${display.value0}</span>`
                                : q;
                            const value1Html =
                                showFormulas && scalingValues.value0_formula
                                    ? `<span class="${formulaClass}">${escapeHtmlText(
                                          scalingValues.value0_original || v0
                                      )}</span>`
                                    : `<span class="${formulaClass}">${display.value1}</span>`;
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', value0Html)
                                .replace('{value1}', value1Html)
                                .replace('{value2}', '')
                                .replace('{value3}', '');
                        }
                    } else {
                        output = formatScalingValuesToDescriptionHtml(scalingValues, key);
                    }
                } else {
                    // No scaling values found at all - show ??? for required slots
                    if (key === 'mana_cost') {
                        const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', q)
                            .replace('{value1}', "")
                            .replace('{value2}', "")
                            .replace('{value3}', "");
                    } else if (key === 'minion_mana_cost') {
                        const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', q)
                            .replace('{value1}', q)
                            .replace('{value2}', "")
                            .replace('{value3}', "");
                    } else {
                        const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', q)
                            .replace('{value1}', q)
                            .replace('{value2}', q)
                            .replace('{value3}', q);
                    }
                }
            }
        }

        // If no scaling row for this level, but stat exists: show format with ??? placeholders
        if (output === `[Unknown stat: ${rawKey}]`) {
            let statDisplayName = null;
            let statFormat = null;
            const fallbackStatRow = getFileSkillStore()?.getStatByKeyLower(key);
            if (fallbackStatRow) {
                statDisplayName = fallbackStatRow.name;
                statFormat = fallbackStatRow.format;
            }
            if (statDisplayName != null) {
                const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                output = (statFormat || '{name}: {value}')
                    .replace('{name}', statDisplayName)
                    .replace('{value0}', q)
                    .replace('{value1}', q)
                    .replace('{value2}', q)
                    .replace('{value3}', q);
            } else if (actualSkillName) {
                // Skill text used {{stat}} not in stats.json (e.g. typo vs activation_frequency_multiplier).
                // Do not fall through to planner characterState.stats — keys like activation_frequency exist there as 0.
                const esc = escapeHtmlAttr(rawKey);
                output = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">MISSING STAT - {{${esc}}}</span>`;
            }
        }

        // Character panel stats (life, resistances, etc.) must NOT override skill_scaling for the
        // hovered skill — keys often collide (e.g. {{cold_resistance}} on Warmth is the skill bonus,
        // not the planner's cold_resistance). Only substitute from characterState.stats when skill
        // data did not resolve this placeholder at all, and not when expanding a skill's own text.
        if (
            output === `[Unknown stat: ${rawKey}]` &&
            !actualSkillName &&
            characterState &&
            characterState.stats &&
            Object.prototype.hasOwnProperty.call(characterState.stats, key)
        ) {
            const statValue = characterState.stats[key];
            output =
                statValue === undefined || statValue === null ? '' : String(statValue);
        }

        // Grey out showCondition-gated stats when the condition is off (Soulchain-style)
        if (placeholderConditionInactive && output && output !== `[Unknown stat: ${rawKey}]`) {
            output = `<span class="has-text-grey">${output}</span>`;
        }
        
        // Only replace standalone {{stat}} — skip tokens that belong to [[skill]].{{stat}}
        // (e.g. Ctrl formula display keeps raw cooldown formulas containing those compounds).
        result = replaceFirstStandaloneStatPlaceholder(result, match, output);
    }
    
    return restoreSubskillBlocks(result);
}

/**
 * Replace the first `{{stat}}` that is not part of `[[ref]].{{stat}}`.
 * String.replace(match, …) would otherwise hit an embedded compound inserted by an
 * earlier placeholder (e.g. cooldown formula with [[fire_elementals]].{{minions}}).
 *
 * @param {string} text
 * @param {string} placeholder full token including braces, e.g. "{{minions}}"
 * @param {string} replacement
 * @returns {string}
 */
function replaceFirstStandaloneStatPlaceholder(text, placeholder, replacement) {
    let searchFrom = 0;
    while (true) {
        const idx = text.indexOf(placeholder, searchFrom);
        if (idx === -1) return text;
        const before = text.slice(0, idx);
        if (/\[\[[^\]]*\]\]\.$/.test(before)) {
            searchFrom = idx + placeholder.length;
            continue;
        }
        return before + replacement + text.slice(idx + placeholder.length);
    }
}

/**
 * Check if the page is running on localhost (for development vs production)
 * @returns {boolean} True if running on localhost, false if on GitHub Pages or other hosting
 */
export function isLocalhost() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' || 
           window.location.hostname === '';
}
