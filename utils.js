// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);
export const MISSING_IMAGE_NAME = "icons-shared_missing.png";

const SKILL_STYLE = "has-text-success";
const FORMULA_STYLE = "has-text-warning";
const DEFAULT_STYLE = "has-text-primary";
const CONSTANTS_STYLE = "has-text-white";
const UNKNOWN_STYLE = "has-text-danger";

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

// Export individual groups for convenience
export const SKILL_CATEGORY_TAG_IDS = TAG_GROUPS["Skill Category"];
export const DAMAGE_TAG_IDS = TAG_GROUPS["Damage"];
export const SUMMON_TAG_IDS = TAG_GROUPS["Summon"];
export const TELEPORT_TAG_IDS = TAG_GROUPS["Teleport"];
export const MODIFIER_TAG_IDS = TAG_GROUPS["Custom"];

// Import Skill class for scaling values
import Skill from './skills/Skill.js';

// --- SQL DB Loader ---
export async function loadDatabase(file = null) {
    // If no file specified, use version-aware default
    if (!file) {
        const { getDatabaseFile } = await import('./version-config.js');
        file = getDatabaseFile();
    }
    
    const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${f}` });
    const response = await fetch(file);
    if (!response.ok) {
        throw new Error(`Failed to load database file: ${file}`);
    }
    const buffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(buffer));
}

// --- Database Error Display ---
export function showDatabaseError(errorMessage, contentElement = null) {
    const targetElement = contentElement || document.getElementById('content');
    if (!targetElement) {
        console.error('No content element found for database error display');
        return;
    }
    
    targetElement.innerHTML = `
        <div class="box">
            <div class="content">
                <h3 class="title is-4 has-text-danger">Database Error</h3>
                <p>Unable to load the skills database. Please check:</p>
                <ul>
                    <li>Database file exists and is accessible</li>
                    <li>You have an active internet connection</li>
                    <li>Try refreshing the page</li>
                </ul>
                <p class="has-text-danger"><strong>Error:</strong> ${errorMessage}</p>
                <button class="button is-danger" onclick="location.reload()">Refresh Page</button>
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

export function getIconHTML(imagePath, className = '') {
    if (!imagePath) return "";
    if (imagePath === MISSING_IMAGE_NAME) {
        return `<img src="icons/${MISSING_IMAGE_NAME}" class="image ${className}" alt="missing icon">`;
    }

    // Support both "icons-<prefix>_<index>.png" and "image-<prefix>_<index>.png"
    const match = imagePath.match(/^(?:icons|image)-([a-z]+)_(\d+)\.png$/);
    if (!match) {
        return `<img src="icons/${MISSING_IMAGE_NAME}" class="image ${className}" alt="missing icon">`;
    }

    const prefix = match[1];
    const index = parseInt(match[2], 10);
    const x = (index % ICONS_PER_ROW) * ICON_SIZE;
    const y = Math.floor(index / ICONS_PER_ROW) * ICON_SIZE;

    return `
        <div class="image ${className}"
            style="
                width:${ICON_SIZE}px;
                height:${ICON_SIZE}px;
                background-image:url('icons/class-${prefix}.png');
                background-position:-${x}px -${y}px;
            ">
        </div>
    `;
}

// --- Class-derived icon resolver ---
// Accepts a raw image filename stored in DB (e.g., "image.png") and the human-readable class name
// Maps the class to a directory prefix and returns an <img> element pointing to icons/<prefix>/<filename>
// For class "Other", shared images are used (icons/shared)

export function getSkillIconHTML(imageFileName, humanClassName, className = '', db = null) {
    const file = (imageFileName && imageFileName.trim().length > 0) ? imageFileName.trim() : MISSING_IMAGE_NAME;

    // If atlas-style filename, render via atlas regardless of class (shared or class-specific handled by regex)
    if (/^(?:icons|image)-[a-z]+_\d+\.png$/.test(file)) {
        return getIconHTML(file, className);
    }

    // Otherwise, simple file path under class-derived directory; if name indicates shared, force shared
    const isExplicitShared = /^shared\//.test(file) || /(^|-)shared(_|\.)/i.test(file);
    
    let prefix = 'shared'; // default fallback
    
    if (!isExplicitShared && humanClassName && db) {
        // Get prefix from database
        try {
            const stmt = db.prepare('SELECT image_prefix FROM classes WHERE name = ?');
            stmt.bind([humanClassName]);
            if (stmt.step()) {
                const dbPrefix = stmt.get()[0];
                if (dbPrefix) {
                    prefix = dbPrefix; // Database stores just the prefix (ama, bar, etc.)
                }
            }
            stmt.free();
        } catch (error) {
            console.warn('Error getting class prefix from database:', error);
            // If database query fails, we're already in a bad state - just use 'shared' fallback
            // This should rarely happen since the app shouldn't run without a proper database
        }
    }
    
    const path = file === MISSING_IMAGE_NAME ? `icons/${MISSING_IMAGE_NAME}` : `icons/${prefix}/${file}`;
    return `<img src="${path}" class="image ${className}">`;
}


// --- Placeholder Expansion Utilities ---

// Helper function to detect how many parameters a stat format needs
function getStatParameterCount(db, statKey) {
    const stmt = db.prepare("SELECT format FROM stats WHERE LOWER(key) = ?");
    stmt.bind([statKey.toLowerCase()]);
    let paramCount = 0;
    if (stmt.step()) {
        const format = stmt.get()[0] || '{name}: {value}';
        // Count how many value placeholders are in the format
        const valueMatches = format.match(/\{value\d*\}/g) || [];
        const percentMatches = format.match(/%value\d*%/g) || [];
        paramCount = Math.max(valueMatches.length, percentMatches.length);
    }
    stmt.free();
    return paramCount;
}

/**
 * Calculate mana cost from mana, lvlmana, manashift parameters
 * @param {number|string} mana - Base mana cost at level 1 (value0)
 * @param {number|string} lvlmana - Change in mana cost per skill level (value1)
 * @param {number|string} manashift - Bitwise shift multiplier for precision (value2)
 * @param {number} level - Current skill level
 * @returns {number} Calculated mana cost (truncated to integer)
 */
function calculateManaCost(mana, lvlmana, manashift, level) {
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
    
    // Truncate final result
    return Math.trunc(totalMana256ths);
}

// Helper function to auto-expand simple {{stat}} tokens to include parameter placeholders
function autoExpandStatToken(db, statKey) {
    const paramCount = getStatParameterCount(db, statKey);
    if (paramCount === 0) return `{{${statKey}}}`;
    
    // Generate parameter placeholders based on count
    const params = Array.from({length: paramCount}, (_, i) => `%value${i}%`).join(',');
    return `{{${statKey}:${params}}}`;
}


// Expand using values sourced from skill_scaling for a given skill and level.
// If inline values are provided in the token, they take precedence; otherwise fetch by stat key.
// Expected schema: stats(key TEXT UNIQUE), skill_scaling(skill_id, level, stat_id, occurrence_index, value)

// Also supports [[skill_name]] which expands to skill's display_name in success color
export async function expandPlaceholdersWithScaling(db, skillId, level, description, skillName = null, characterState = null, showFormulas = false) {
    if (!description) return '';
    
    // Get version ID once at the start
    const { getCurrentVersionId } = await import('./version-config.js');
    const versionId = getCurrentVersionId(db);
    if (!versionId) return description;
    
    // Track occurrence counts for each stat key to maintain order
    const occurrenceCounts = new Map();
    
    // First, expand skill name placeholders [[skill_name]]
    let expandedDescription = description.replace(/\[\[(.*?)\]\]/g, (match, skillName) => {
        const trimmedSkillName = skillName.trim();
        if (!trimmedSkillName) return match;
        
        try {
            const stmt = db.prepare("SELECT display_name FROM skills WHERE name = ? AND version_id = ?");
            stmt.bind([trimmedSkillName, versionId]);
            
            if (stmt.step()) {
                const displayName = stmt.get()[0];
                stmt.free();
                return `<p class='${SKILL_STYLE}'>${displayName}</p>`;
            }
            stmt.free();
        } catch (error) {
            console.warn('Error expanding skill name placeholder:', error);
        }
        
        // If skill not found, return original match
        return match;
    });
    
    // Then, expand stat placeholders {{stat_key}}
    const placeholderMatches = expandedDescription.match(/\{\{(.*?)\}\}/g);
    if (!placeholderMatches) {
        return expandedDescription;
    }
    
    let result = expandedDescription;
    for (const match of placeholderMatches) {
        const token = match.slice(2, -2); // Remove {{ and }}
        const [rawKey, rawValues] = token.split(':').map(s => s.trim());
        const key = (rawKey || '').toLowerCase();
        
        // Check if this is a character stat reference (not a skill stat scaling placeholder)
        // Character stats are stored in characterState.stats object
        if (characterState && characterState.stats && characterState.stats.hasOwnProperty(key)) {
            // This is a character stat, not a skill stat placeholder
            const statValue = characterState.stats[key];
            result = result.replace(match, statValue.toString());
            continue;
        }
        
        // Track occurrence index for this stat key
        const occurrenceIndex = occurrenceCounts.get(key) || 0;
        occurrenceCounts.set(key, occurrenceIndex + 1);
        
        // If no values provided, auto-expand based on stat format
        let values = [];
        if (!rawValues) {
            const expandedToken = autoExpandStatToken(db, rawKey);
            const [, expandedValues] = expandedToken.split(':').map(s => s.trim());
            values = expandedValues ? expandedValues.split(',').map(v => v.trim()) : [];
        } else {
            values = rawValues.split(',').map(v => v.trim());
        }


        // Otherwise, attempt to fetch value using Skill class (includes constants)
        // First get the stat info
        const statStmt = db.prepare("SELECT name, format FROM stats WHERE LOWER(key) = ?");
        statStmt.bind([key]);
        let output = `[Unknown stat: ${rawKey}]`;
        if (statStmt.step()) {
            const [name, format] = statStmt.get();
            statStmt.free();
            
            // Use Skill class to get scaling values (includes constants)
            let actualSkillName = skillName;
            
            if (!actualSkillName) {
                // If skillName not provided, get it from database ID
                const skillStmt = db.prepare("SELECT name FROM skills WHERE id = ? AND version_id = ?");
                skillStmt.bind([skillId, versionId]);
                if (skillStmt.step()) {
                    actualSkillName = skillStmt.get()[0];
                }
                skillStmt.free();
            }
            
            if (actualSkillName) {
                // Get the display name for the skill
                const displayNameStmt = db.prepare("SELECT display_name FROM skills WHERE name = ? AND version_id = ?");
                displayNameStmt.bind([actualSkillName, versionId]);
                let displayName = actualSkillName; // fallback to skill name
                if (displayNameStmt.step()) {
                    displayName = displayNameStmt.get()[0] || actualSkillName;
                }
                displayNameStmt.free();
                
                const skill = new Skill({ id: actualSkillName, name: displayName, skillId: skillId });
                const scalingValues = await skill.getScalingValues(db, level, key, occurrenceIndex, characterState, characterState?.level, showFormulas);
                
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
                            const q = `<span class="${UNKNOWN_STYLE}">???</span>`;
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
                            const { formulaEvaluator } = await import('./skills/formula-evaluator.js');
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
                                if (characterState) {
                                    const blvl = characterState.blvl?.[actualSkillName] || 0;
                                    const slvl = characterState.lvl?.[actualSkillName] || 0;
                                    const lvl = blvl + slvl;
                                    
                                    const variables = {
                                        blvl,
                                        slvl,
                                        lvl,
                                        ulvl: characterState.level || 1,
                                        _blvl: characterState.blvl || {},
                                        characterState: characterState
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

                            const blvl = characterState.blvl?.[actualSkillName] || 0;
                            const slvl = characterState.lvl?.[actualSkillName] || 0;
                            const lvl = blvl + slvl;

                            // Calculate mana cost
                            const calculatedMana = calculateManaCost(mana, lvlmana, manashift, lvl);
                            
                            // Format as single value
                            const calculatedValueHtml = `<span class="${FORMULA_STYLE}">${calculatedMana}</span>`;
                            
                            // Replace all value placeholders with the calculated value
                            output = (format || '{name}: {value}')
                                .replace('{name}', name)
                                .replace('{value0}', calculatedValueHtml)
                                .replace('{value1}', "")
                                .replace('{value2}', "")
                                .replace('{value3}', "");
                        }
                    } else {
                        // Regular stat handling (non-mana_cost)
                        const v0 = scalingValues.value0 ?? '';
                        const v1 = scalingValues.value1 ?? '';
                        const v2 = scalingValues.value2 ?? '';
                        const v3 = scalingValues.value3 ?? '';
                        
                        // Check if any constants exist for this stat
                        // If constants exist but only some values are filled, empty ones should show ???
                        const hasAnyConstants = scalingValues.value0_constant || scalingValues.value1_constant || 
                                               scalingValues.value2_constant || scalingValues.value3_constant;
                        
                        // Use different styling: formulas=link, constants=warning, scaling=primary
                        const getValueClass = (valueIndex) => {
                            const isFormula = scalingValues[`value${valueIndex}_formula`];
                            const isConstant = scalingValues[`value${valueIndex}_constant`];
                            if (isFormula) return FORMULA_STYLE;
                            if (isConstant) return CONSTANTS_STYLE;
                            return DEFAULT_STYLE;
                        };
                        
                        // Check if values are empty and should show ??? for formulas/constants
                        const getDisplayHtml = (valueIndex, defaultValue) => {
                            const isEmpty = defaultValue === '' || defaultValue === null || defaultValue === undefined;
                            const isFormula = scalingValues[`value${valueIndex}_formula`];
                            const isConstant = scalingValues[`value${valueIndex}_constant`];
                            
                            // Show ??? if value is empty AND:
                            // 1. It's marked as a formula/constant, OR
                            // 2. Constants exist for this stat (if constants are present but only some values filled, empty ones show ???)
                            //    This handles the case where only 1 of X fields is filled - empty ones show ???
                            if (isEmpty && (isFormula || isConstant || hasAnyConstants)) {
                                return `<span class="${UNKNOWN_STYLE}">???</span>`;
                            }
                            // Use the appropriate style class for the value
                            return `<span class="${getValueClass(valueIndex)}">${defaultValue || ''}</span>`;
                        };
                        
                        const w0 = getDisplayHtml(0, v0);
                        const w1 = getDisplayHtml(1, v1);
                        const w2 = getDisplayHtml(2, v2);
                        const w3 = getDisplayHtml(3, v3);
                        
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', w0)
                            .replace('{value1}', w1)
                            .replace('{value2}', w2)
                            .replace('{value3}', w3);
                    }
                } else {
                    // No scaling values found at all - show ??? for all values
                    if (key === 'mana_cost') {
                        const q = `<span class="${UNKNOWN_STYLE}">???</span>`;
                        output = (format || '{name}: {value}')
                            .replace('{name}', name)
                            .replace('{value0}', q)
                            .replace('{value1}', "")
                            .replace('{value2}', "")
                            .replace('{value3}', "");
                    } else {
                        const q = `<span class="${UNKNOWN_STYLE}">???</span>`;
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
            const s2 = db.prepare('SELECT name, format FROM stats WHERE LOWER(key) = ?');
            s2.bind([key]);
            if (s2.step()) {
                const [name, format] = s2.get();
                const q = `<span class="${UNKNOWN_STYLE}">???</span>`;
                output = (format || '{name}: {value}')
                    .replace('{name}', name)
                    .replace('{value0}', q)
                    .replace('{value1}', q)
                    .replace('{value2}', q)
                    .replace('{value3}', q);
            }
            s2.free();
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
