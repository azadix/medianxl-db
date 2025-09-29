// --- Icon Atlas Helper ---
const ICON_SIZE = 48;
const ATLAS_SIZE = 912;
const ICONS_PER_ROW = Math.floor(ATLAS_SIZE / ICON_SIZE);
const MISSING_IMAGE_NAME = "icons-shared_missing.png";

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
    if (skillId) url.searchParams.set('skill', skillId);
    else url.searchParams.delete('skill');
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

    const match = imagePath.match(/^icons-([a-z]+)_(\d+)\.png$/);
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

function renderSkillDescription(skill, level) {
    return skill.description.replace(/\{\{(.*?)\}\}/g, (match, token) => {
        const [key, constant] = token.split(':');
        
        if (constant) return constant; // static inline value

        const stat = db.exec(`
            SELECT value 
            FROM skill_scaling 
            WHERE skill_id=${skill.id} AND level=${level}
              AND stat_id=(SELECT id FROM stats WHERE key='${key}')
        `);

        if (stat.length > 0) return stat[0].values[0][0]; // numeric value
        return `[Unknown stat: ${key}]`; // fallback / typo detection
    });
}

