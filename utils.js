// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);
export const MISSING_IMAGE_NAME = "icons-shared_missing.png";

// --- SQL DB Loader ---
export async function loadDatabase(file = 'skills.sqlite') {
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
    return `<img src="${path}" class="image ${className}" alt="skill icon">`;
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

// Expand a description string using the stats table formatting and optional inline values
// Example tokens: {{mana_cost:15}}, {{cold_damage:100,200}}, {{level:17}}
// Now also supports simple {{mana_cost}} which auto-expands to {{mana_cost:%value0%}} based on format
export function expandPlaceholders(db, description) {
    if (!description) return '';
    return description.replace(/\{\{(.*?)\}\}/g, (match, token) => {
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

        const stmt = db.prepare("SELECT name, format FROM stats WHERE LOWER(key) = ?");
        stmt.bind([key]);
        let output = `[Unknown stat: ${rawKey}]`;
        if (stmt.step()) {
            const [name, format] = stmt.get();
            const v0 = values[0] || '';
            const v1 = values[1] || '';
            const v2 = values[2] || '';
            const v3 = values[3] || '';
            const w0 = `<span class="stat-val">${v0}</span>`;
            const w1 = `<span class="stat-val">${v1}</span>`;
            const w2 = `<span class="stat-val">${v2}</span>`;
            const w3 = `<span class="stat-val">${v3}</span>`;
            output = (format || '{name}: {value}')
                .replace('{name}', name)
                .replace('{value0}', w0)
                .replace('{value1}', w1)
                .replace('{value2}', w2)
                .replace('{value3}', w3)
                // also support %valueX% tokens
                .replace(/%value0%/g, w0)
                .replace(/%value1%/g, w1)
                .replace(/%value2%/g, w2)
                .replace(/%value3%/g, w3);
        }
        stmt.free();
        return output;
    });
}

// Expand using values sourced from skill_scaling for a given skill and level.
// If inline values are provided in the token, they take precedence; otherwise fetch by stat key.
// Expected schema: stats(key TEXT UNIQUE), skill_scaling(skill_id, level, stat_id, value)
// Now also supports simple {{mana_cost}} which auto-expands to {{mana_cost:%value0%}} based on format
export function expandPlaceholdersWithScaling(db, skillId, level, description) {
    if (!description) return '';
    return description.replace(/\{\{(.*?)\}\}/g, (match, token) => {
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
                    const w0 = `<span class=\"stat-val\">${v0}</span>`;
                    const w1 = `<span class=\"stat-val\">${v1}</span>`;
                    const w2 = `<span class=\"stat-val\">${v2}</span>`;
                    const w3 = `<span class=\"stat-val\">${v3}</span>`;
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

        // Otherwise, attempt to fetch value from scaling table
        const stmt = db.prepare(`
            SELECT s.name, s.format, ss.value0, ss.value1, ss.value2, ss.value3
            FROM stats s
            JOIN skill_scaling ss ON ss.stat_id = s.id
            WHERE LOWER(s.key) = ? AND ss.skill_id = ? AND ss.level = ?
        `);
        stmt.bind([key, skillId, level]);
        let output = `[Unknown stat: ${rawKey}]`;
        if (stmt.step()) {
            const [name, format, v0, v1, v2, v3] = stmt.get();
            const sv0 = v0 ?? '';
            const sv1 = v1 ?? '';
            const sv2 = v2 ?? '';
            const sv3 = v3 ?? '';
            const w0 = `<span class="stat-val">${sv0}</span>`;
            const w1 = `<span class="stat-val">${sv1}</span>`;
            const w2 = `<span class="stat-val">${sv2}</span>`;
            const w3 = `<span class="stat-val">${sv3}</span>`;
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
        if (output !== `[Unknown stat: ${rawKey}]`) return output;

        // If no scaling row for this level, but stat exists: show format with ??? placeholders
        const s2 = db.prepare('SELECT name, format FROM stats WHERE LOWER(key) = ?');
        s2.bind([key]);
        if (s2.step()) {
            const [name, format] = s2.get();
            const q = '<span class="stat-val">???</span>';
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
