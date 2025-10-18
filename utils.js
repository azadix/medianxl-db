// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);
export const MISSING_IMAGE_NAME = "icons-shared_missing.png";

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
    if (!response.ok) throw new Error("Failed to load database");
    const buffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(buffer));
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
const CLASS_TO_PREFIX = {
    "Amazon": "ama",
    "Sorceress": "sor",
    "Necromancer": "nec",
    "Paladin": "pal",
    "Barbarian": "bar",
    "Druid": "dru",
    "Assassin": "ass",
    "Other": "shared"
};

export function getSkillIconHTML(imageFileName, humanClassName, className = '') {
    const file = (imageFileName && imageFileName.trim().length > 0) ? imageFileName.trim() : MISSING_IMAGE_NAME;

    // If atlas-style filename, render via atlas regardless of class (shared or class-specific handled by regex)
    if (/^(?:icons|image)-[a-z]+_\d+\.png$/.test(file)) {
        return getIconHTML(file, className);
    }

    // Otherwise, simple file path under class-derived directory; if name indicates shared, force shared
    const isExplicitShared = /^shared\//.test(file) || /(^|-)shared(_|\.)/i.test(file);
    const prefix = isExplicitShared ? 'shared' : (CLASS_TO_PREFIX[humanClassName] || 'shared');
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
// Expected schema: stats(key TEXT UNIQUE), skill_scaling(skill_id, level, stat_id, value)
// Now also supports simple {{mana_cost}} which auto-expands to {{mana_cost:%value0%}} based on format
// Also supports [[skill_name]] which expands to skill's display_name in success color
export async function expandPlaceholdersWithScaling(db, skillId, level, description, skillName = null) {
    if (!description) return '';
    
    // First, expand skill name placeholders [[skill_name]]
    let expandedDescription = description.replace(/\[\[(.*?)\]\]/g, (match, skillName) => {
        const trimmedSkillName = skillName.trim();
        if (!trimmedSkillName) return match;
        
        try {
            const stmt = db.prepare("SELECT display_name FROM skills WHERE name = ?");
            stmt.bind([trimmedSkillName]);
            
            if (stmt.step()) {
                const displayName = stmt.get()[0];
                stmt.free();
                return `<p class='has-text-success'>${displayName}</p>`;
            }
            stmt.free();
        } catch (error) {
            console.warn('Error expanding skill name placeholder:', error);
        }
        
        // If skill not found, return original match
        return match;
    });
    
    // Then, expand stat placeholders {{stat_key}}
    return expandedDescription.replace(/\{\{(.*?)\}\}/g, (match, token) => {
        const [rawKey, rawValues] = token.split(':').map(s => s.trim());
        const key = (rawKey || '').toLowerCase();
        
        // If no values provided, auto-expand based on stat format
        let values = [];
        if (!rawValues) {
            const expandedToken = autoExpandStatToken(db, rawKey);
            const [, expandedValues] = expandedToken.split(':').map(s => s.trim());
            values = expandedValues ? expandedValues.split(',').map(v => v.trim()) : [];
        } else {
            values = rawValues.split(',').map(v => v.trim());
        }

        // If author provided inline concrete values (not placeholders like %value0%), use them
        if (rawValues && rawValues.length > 0) {
            const arePlaceholders = values.every(v => /%?value\d*%?/i.test(v));
            if (!arePlaceholders) {
            const stmt = db.prepare("SELECT name, format FROM stats WHERE LOWER(key) = ?");
            stmt.bind([key]);
            let output = `[Unknown stat: ${rawKey}]`;
            if (stmt.step()) {
                const [name, format] = stmt.get();
            const v0 = values[0] || '';
            const v1 = values[1] || '';
            const v2 = values[2] || '';
            const v3 = values[3] || '';
                    const w0 = `<span class=\"has-text-primary\">${v0}</span>`;
                    const w1 = `<span class=\"has-text-primary\">${v1}</span>`;
                    const w2 = `<span class=\"has-text-primary\">${v2}</span>`;
                    const w3 = `<span class=\"has-text-primary\">${v3}</span>`;
                output = (format || '{name}: {value}')
                    .replace('{name}', name)
                    .replace('{value0}', w0)
                    .replace('{value1}', w1)
                    .replace('{value2}', w2)
                    .replace('{value3}', w3)
                    .replace(/%value0%/g, w0)
                    .replace(/%value1%/g, w1)
                    .replace(/%value2%/g, w2)
                    .replace(/%value3%/g, w3);
            }
            stmt.free();
            return output;
            }
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
                const skillStmt = db.prepare("SELECT name FROM skills WHERE id = ?");
                skillStmt.bind([skillId]);
                if (skillStmt.step()) {
                    actualSkillName = skillStmt.get()[0];
                }
                skillStmt.free();
            }
            
            if (actualSkillName) {
                // Get the display name for the skill
                const displayNameStmt = db.prepare("SELECT display_name FROM skills WHERE name = ?");
                displayNameStmt.bind([actualSkillName]);
                let displayName = actualSkillName; // fallback to skill name
                if (displayNameStmt.step()) {
                    displayName = displayNameStmt.get()[0] || actualSkillName;
                }
                displayNameStmt.free();
                
                const skill = new Skill({ id: actualSkillName, name: displayName, skillId: skillId });
                const scalingValues = skill.getScalingValues(db, level, key);
                
                if (scalingValues) {
                    const v0 = scalingValues.value0 ?? '';
                    const v1 = scalingValues.value1 ?? '';
                    const v2 = scalingValues.value2 ?? '';
                    const v3 = scalingValues.value3 ?? '';
                    
                    // Use different styling for constant vs level-specific values
                    const w0 = `<span class="${scalingValues.value0_constant ? 'has-text-warning' : 'has-text-primary'}">${v0}</span>`;
                    const w1 = `<span class="${scalingValues.value1_constant ? 'has-text-warning' : 'has-text-primary'}">${v1}</span>`;
                    const w2 = `<span class="${scalingValues.value2_constant ? 'has-text-warning' : 'has-text-primary'}">${v2}</span>`;
                    const w3 = `<span class="${scalingValues.value3_constant ? 'has-text-warning' : 'has-text-primary'}">${v3}</span>`;
                    
                    output = (format || '{name}: {value}')
                        .replace('{name}', name)
                        .replace('{value0}', w0)
                        .replace('{value1}', w1)
                        .replace('{value2}', w2)
                        .replace('{value3}', w3)
                        .replace(/%value0%/g, w0)
                        .replace(/%value1%/g, w1)
                        .replace(/%value2%/g, w2)
                        .replace(/%value3%/g, w3);
                }
            } else {
                skillStmt.free();
                output = `[${name}: ???]`;
            }
        } else {
            statStmt.free();
        }
        if (output !== `[Unknown stat: ${rawKey}]`) return output;

        // If no scaling row for this level, but stat exists: show format with ??? placeholders
        const s2 = db.prepare('SELECT name, format FROM stats WHERE LOWER(key) = ?');
        s2.bind([key]);
        if (s2.step()) {
            const [name, format] = s2.get();
            const q = '<span class="has-text-primary">???</span>';
            const formatted = (format || '{name}: {value}')
                .replace('{name}', name)
                .replace('{value0}', q)
                .replace('{value1}', q)
                .replace('{value2}', q)
                .replace('{value3}', q)
                .replace(/%value0%/g, q)
                .replace(/%value1%/g, q)
                .replace(/%value2%/g, q)
                .replace(/%value3%/g, q);
            s2.free();
            return formatted;
        }
        s2.free();
        return output;
    });
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

/**
 * Skill Tag Group Constants
 * Shared across the application for consistent tag categorization
 */
export const TAG_GROUPS = {
    "Skill Category": [8, 9, 11, 12, 14, 15, 16, 17, 22, 25, 26, 27, 28, 29, 32, 35, 36],
    "Damage": [1, 2, 3, 4, 5, 6, 7, 21, 23],
    "Summon": [13, 30, 31],
    "Teleport": [10, 20, 24],
    "Modifier": [19, 18]
};

// Export individual groups for convenience
export const SKILL_CATEGORY_TAG_IDS = TAG_GROUPS["Skill Category"];
export const DAMAGE_TAG_IDS = TAG_GROUPS["Damage"];
export const SUMMON_TAG_IDS = TAG_GROUPS["Summon"];
export const TELEPORT_TAG_IDS = TAG_GROUPS["Teleport"];
export const MODIFIER_TAG_IDS = TAG_GROUPS["Modifier"];
