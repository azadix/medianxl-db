// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);
export const MISSING_IMAGE_NAME = "icons-shared_missing.png";
export const MISSING_IMAGE_WEBP_NAME = "icons-shared_missing.webp";

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

function escapeHtmlAttr(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {string} className
 */
function missingIconPictureHTML(className) {
    const png = `icons/${MISSING_IMAGE_NAME}`;
    const webp = `icons/${MISSING_IMAGE_WEBP_NAME}`;
    const cls = escapeHtmlAttr(`image ${className}`.trim());
    return `<picture><source srcset="${escapeHtmlAttr(webp)}" type="image/webp"><img src="${escapeHtmlAttr(png)}" class="${cls}" alt="missing icon"></picture>`;
}

/**
 * Skill Tag Group Constants
 * Shared across the application for consistent tag categorization
 */
export const TAG_GROUPS = {
    "Skill Category": [8, 9, 11, 12, 14, 15, 17, 22, 25, 26, 27, 28, 29, 32, 35, 36, 38],
    "Damage": [1, 2, 3, 4, 5, 6, 7, 21, 23],
    "Summon": [13, 30, 31],
    "Teleport": [10, 20, 24],
    "Custom": [16, 18, 19, 33, 34, 37]
};

// Import Skill class for scaling values
import Skill from '../skills/domain/Skill.js';
import {
    lookupMergedDisplayNameByInternalName,
    lookupSkillNameAndDisplayByNumericId,
    getFileSkillStore
} from '../../tree/skill-data-store.js';
import { formulaEvaluator } from '../skills/domain/formula-evaluator.js';
import { formatScalingValuesToDescriptionHtml } from '../skills/domain/scaling-display-html.js';

// --- Skill data (tree_data JSON) load error ---
export function escapeHtmlText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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

// When no patch folder is passed, use this tree_data subdirectory (underscore major_minor).
const ATLAS_DEFAULT_VERSION_FOLDER = '2_13';

/**
 * @param {string} gameVersionFolder - e.g. "2_12"; atlas URLs are tree_data/<folder>/class-<prefix>.{webp,png}; if omitted, uses ATLAS_DEFAULT_VERSION_FOLDER.
 */
export function getIconHTML(imagePath, className = '', gameVersionFolder = null) {
    if (!imagePath) return "";
    if (imagePath === MISSING_IMAGE_NAME) {
        return missingIconPictureHTML(className);
    }

    // Support both "icons-<prefix>_<index>.png" and "image-<prefix>_<index>.png"
    const match = imagePath.match(/^(?:icons|image)-([a-z]+)_(\d+)\.png$/);
    if (!match) {
        return missingIconPictureHTML(className);
    }

    const prefix = match[1];
    const index = parseInt(match[2], 10);
    const x = (index % ICONS_PER_ROW) * ICON_SIZE;
    const y = Math.floor(index / ICONS_PER_ROW) * ICON_SIZE;

    const folder = (gameVersionFolder && String(gameVersionFolder).trim())
        ? String(gameVersionFolder).trim()
        : ATLAS_DEFAULT_VERSION_FOLDER;
    const atlasPng = `tree_data/${folder}/class-${prefix}.png`;
    const atlasWebp = `tree_data/${folder}/class-${prefix}.webp`;
    const pngEsc = escapeHtmlAttr(atlasPng);
    const webpEsc = escapeHtmlAttr(atlasWebp);
    // PNG fallback, then WebP-first image-set (reduces bytes where supported).
    const bgImage =
        `background-image:url('${pngEsc}');` +
        `background-image:-webkit-image-set(url('${webpEsc}') 1x, url('${pngEsc}') 1x);` +
        `background-image:image-set(url('${webpEsc}') type('image/webp'), url('${pngEsc}') type('image/png'));`;

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

// --- Class-derived icon resolver ---
// Accepts a raw image filename (e.g., "image.png") and the human-readable class name
// Maps the class to a directory prefix and returns an <img> element pointing to icons/<prefix>/<filename>
// For class "Other", shared images are used (icons/shared)

/**
 * @param {string|null|undefined} imageFileName - raw filename from data (e.g. "image.png")
 * @param {string|null|undefined} humanClassName - class display name for prefix lookup
 * @param {string} [className] - extra CSS class on the img element
 * @param {string|null|undefined} gameVersionFolder - e.g. "2_12"; only atlas-style names (icons-*_n.png / image-*_n.png).
 * Those load sprites from tree_data/<folder>/class-<prefix>.{webp,png}. Loose PNGs use icons/<prefix>/<file> (not versioned).
 */
export function getSkillIconHTML(imageFileName, humanClassName, className = '', gameVersionFolder = null) {
    const file = (imageFileName && imageFileName.trim().length > 0) ? imageFileName.trim() : MISSING_IMAGE_NAME;
    const atlasVersionFolder = gameVersionFolder && String(gameVersionFolder).trim().length > 0
        ? String(gameVersionFolder).trim()
        : null;

    // Atlas-style: version-specific sprite sheets (tree_data/<major>_<minor>/class-*.{webp,png}).
    if (/^(?:icons|image)-[a-z]+_\d+\.png$/.test(file)) {
        return getIconHTML(file, className, atlasVersionFolder);
    }

    // Loose PNGs: shared across patches; keep sources for building atlases in your asset pipeline, not under version folders here.
    const isExplicitShared = /^shared\//.test(file) || /(^|-)shared(_|\.)/i.test(file);

    let prefix = 'shared';

    if (!isExplicitShared && humanClassName) {
        const store = getFileSkillStore();
        const row = store?.gameMeta?.classes?.find((c) => c.name === humanClassName);
        if (row?.image_prefix) {
            prefix = row.image_prefix;
        }
    }

    if (file === MISSING_IMAGE_NAME) {
        return missingIconPictureHTML(className);
    }
    const path = `icons/${prefix}/${file}`;
    return `<img src="${path}" class="image ${className}">`;
}


// --- Placeholder Expansion Utilities ---

/**
 * Calculate mana cost from mana, lvlmana, manashift parameters
 * @param {number|string} mana - Base mana cost at level 1 (value0)
 * @param {number|string} lvlmana - Change in mana cost per skill level (value1)
 * @param {number|string} manashift - Bitwise shift multiplier for precision (value2)
 * @param {number} level - Current skill level
 * @param {number|string|undefined|null} [minMana] - Optional floor from `mana_cost` min_mana / value3; omitted means cost may be 0
 * @returns {number} Calculated mana cost (truncated to integer)
 */
function calculateManaCost(mana, lvlmana, manashift, level, minMana) {
    // Ensure level is at least 1
    const effectiveLevel = Math.max(1, level || 1);
    
    // Convert to numbers, defaulting to 0 if invalid
    const manaNum = parseFloat(mana) || 0;
    const lvlmanaNum = parseFloat(lvlmana) || 0;
    const manashiftNum = parseFloat(manashift) || 0;
    
    // Truncate mana and lvlmana before adding
    const truncatedMana = Math.trunc(manaNum);
    const truncatedLvlmana = Math.trunc(lvlmanaNum);
    
    // Calculate base mana: trunc(mana) + trunc(lvlmana) * (level - 1)
    const baseMana = truncatedMana + truncatedLvlmana * (effectiveLevel - 1);
    
    // Apply manashift: (baseMana * (2^manashift)) / 256
    const shiftMultiplier = Math.pow(2, manashiftNum);
    const totalMana256ths = (baseMana * shiftMultiplier) / 256;
    
    let cost = Math.trunc(totalMana256ths);
    const useMin =
        minMana !== undefined &&
        minMana !== null &&
        !(typeof minMana === 'string' && minMana.trim() === '');
    if (useMin) {
        const minFloor = Math.max(0, Math.trunc(parseFloat(minMana) || 0));
        cost = Math.max(minFloor, cost);
    }
    return cost;
}

// Expand using values sourced from skill_scaling for a given skill and level.
// If inline values are provided in the token, they take precedence; otherwise fetch by stat key.
// Also supports [[internal_name]] or [[id:123]] which expand to display_name in success color
// Also supports ||internal_name|| (or ||id:123||) which expands to a labeled subskill "block":
// the referenced skill's display name + its full skillEffect text with placeholders resolved.
export async function expandPlaceholdersWithScaling(numericId, level, description, skillName = null, characterState = null, showFormulas = false, variantKey = null) {
    if (!description) return '';
    
    if (!getFileSkillStore()) return description;
    
    // Track occurrence counts for each stat key to maintain order
    const occurrenceCounts = new Map();

    const crossSkillDotStatRe =
        /\[\[([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/gi;

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

    // Expand ||internal_name|| or ||id:123|| into a subskill block (name + all effect lines).
    // This is done before [[...]] and {{...}} so the inserted block can contain placeholders too.
    const subskillBlockRe = /\|\|([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\|\|/gi;
    const subskillMatches = [...String(expandedDescription).matchAll(subskillBlockRe)];
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
            const expandedEffect = await expandPlaceholdersWithScaling(
                resolved.skillId,
                level,
                rawEffect,
                resolved.internalName,
                characterState,
                showFormulas,
                null
            );
            const effectHtml = String(expandedEffect).replace(/\r?\n/g, '<br>');
            const label = escapeHtmlText(resolved.displayName || resolved.internalName);
            const block = `
<div class="subskill-inline-block">
  <p class="has-text-warning has-text-weight-semibold">${label}</p>
  <div class="subskill-inline-body">${effectHtml}</div>
</div>`.trim();
            expandedDescription = expandedDescription.replace(full, block);
        }
    }
    
    // First, expand [[internal_name]] or [[id:123]] (id is catalog numericId)
    expandedDescription = expandedDescription.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
        const trimmed = inner.trim();
        if (!trimmed) return match;

        try {
            const idRef = trimmed.match(/^id:(\d+)$/i);
            if (idRef) {
                const row = lookupSkillNameAndDisplayByNumericId(idRef[1]);
                if (row) {
                    return `<p class='${SCALING_DISPLAY_HTML_CLASSES.skill}'>${row.displayName}</p>`;
                }
                return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[unknown skill id:${idRef[1]}]</span>`;
            }
            const displayName = lookupMergedDisplayNameByInternalName(trimmed);
            if (displayName) {
                return `<p class='${SCALING_DISPLAY_HTML_CLASSES.skill}'>${displayName}</p>`;
            }
            return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[unknown skill:${trimmed}]</span>`;
        } catch (error) {
            console.warn('Error expanding skill name placeholder:', error);
            return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">[skill placeholder error]</span>`;
        }
    });
    
    // Then, expand stat placeholders {{stat_key}}
    const placeholderMatches = expandedDescription.match(/\{\{(.*?)\}\}/g);
    if (!placeholderMatches) {
        return expandedDescription;
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

        const store = getFileSkillStore();
        const st = store?.getStatByKeyLower(key);
        if (st) {
            name = st.name;
            format = st.format;
        }
        if (!actualSkillName && store) {
            const resolved = store.lookupSkillNameAndDisplayByNumericId(numericId);
            if (resolved) actualSkillName = resolved.name;
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
                if (characterState && store) {
                    const cat = store.catalogByInternalId?.get?.(String(actualSkillName));
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

                const skill = new Skill({ id: actualSkillName, name: displayName, skillId: numericId });
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
                    // Special handling for mana_cost: calculate single value from 3 parameters
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
                            // Values are already evaluated by getScalingValues() when showFormulas is false
                            // If showFormulas is true or evaluation failed, values might be formula strings
                            // Try to parse as numbers first, and if that fails, try to evaluate as formulas
                            const evaluator = formulaEvaluator;
                            
                            // Helper to parse or evaluate a value
                            const parseOrEvaluate = (value) => {
                                const strValue = String(value).trim();
                                // Check if it's a pure number (already evaluated)
                                const isPureNumber = /^-?\d+(\.\d+)?$/.test(strValue);
                                if (isPureNumber) {
                                    return parseFloat(strValue) || 0;
                                }
                                
                                // If characterState is available, try to evaluate as formula
                                if (effectiveCharacterState) {
                                    const blvl = effectiveCharacterState.blvl?.[actualSkillName] || 0;
                                    const slvl = effectiveCharacterState.lvl?.[actualSkillName] || 0;
                                    const lvl = blvl + slvl;
                                    
                                    const variables = {
                                        blvl,
                                        slvl,
                                        lvl,
                                        ulvl: effectiveCharacterState.level || 1,
                                        _blvl: effectiveCharacterState.blvl || {},
                                        characterState: effectiveCharacterState
                                    };
                                    
                                    const evalResult = evaluator.evaluate(strValue, variables);
                                    if (evalResult.success) {
                                        return evalResult.value;
                                    }
                                }
                                
                                // If evaluation fails or no characterState, return 0
                                return 0;
                            };
                            
                            const mana = parseOrEvaluate(v0);
                            const lvlmana = parseOrEvaluate(v1);
                            const manashift = parseOrEvaluate(v2);
                            const v3 = scalingValues.value3 ?? '';
                            const hasMinMana =
                                v3 !== '' && v3 !== null && v3 !== undefined;
                            const minManaNum = hasMinMana ? parseOrEvaluate(v3) : undefined;

                            const blvl = effectiveCharacterState?.blvl?.[actualSkillName] || 0;
                            const slvl = effectiveCharacterState?.lvl?.[actualSkillName] || 0;
                            const lvl = blvl + slvl;

                            // Calculate mana cost
                            const calculatedMana = calculateManaCost(
                                mana,
                                lvlmana,
                                manashift,
                                lvl,
                                hasMinMana ? minManaNum : undefined
                            );
                            
                            // Format as single value
                            const calculatedValueHtml = `<span class="${SCALING_DISPLAY_HTML_CLASSES.formula}">${calculatedMana}</span>`;
                            
                            // Replace all value placeholders with the calculated value
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', calculatedValueHtml)
                                .replace('{value1}', "")
                                .replace('{value2}', "")
                                .replace('{value3}', "");
                        }
                    } else {
                        output = formatScalingValuesToDescriptionHtml(scalingValues, key);
                    }
                } else {
                    // No scaling values found at all - show ??? for all values
                    if (key === 'mana_cost') {
                        const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', q)
                            .replace('{value1}', "")
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
            let n2 = null;
            let f2 = null;
            const st2 = getFileSkillStore()?.getStatByKeyLower(key);
            if (st2) {
                n2 = st2.name;
                f2 = st2.format;
            }
            if (n2 != null) {
                const q = `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
                output = (f2 || '{name}: {value}')
                    .replace('{name}', n2)
                    .replace('{value0}', q)
                    .replace('{value1}', q)
                    .replace('{value2}', q)
                    .replace('{value3}', q);
            } else if (actualSkillName) {
                // Skill text used {{stat}} not in stats.json (e.g. typo vs activation_frequency_effectiveness).
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
        
        result = result.replace(match, output);
    }
    
    return result;
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
