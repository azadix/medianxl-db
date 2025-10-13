// Game version configuration

// Available game versions (newest to oldest recommended)
export const GAME_VERSIONS = [
    { major: 2, minor: 11 },
    // { major: 2, minor: 12 },
];

// Local storage key for version preference
const VERSION_STORAGE_KEY = 'medianxl_game_version';

/**
 * Convert version object to string for filenames and display
 * @param {{ major: number, minor: number }} version
 * @returns {string} Version string (e.g., "2.11")
 */
export function versionToString(version) {
    return `${version.major}.${version.minor}`;
}

/**
 * Compare two version objects
 * @param {{ major: number, minor: number }} a
 * @param {{ major: number, minor: number }} b
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a, b) {
    if (a.major !== b.major) return a.major - b.major;
    return a.minor - b.minor;
}

/**
 * Get the latest version from available versions
 * @returns {{ major: number, minor: number }} The latest version object
 * @throws {Error} If no versions are configured
 */
function getLatestVersion() {
    if (GAME_VERSIONS.length === 0) {
        throw new Error('No game versions configured in GAME_VERSIONS array');
    }
    
    return GAME_VERSIONS.reduce((latest, current) => {
        return compareVersions(current, latest) > 0 ? current : latest;
    });
}

/**
 * Get the currently selected game version from localStorage
 * @returns {{ major: number, minor: number }} The selected version object
 */
export function getCurrentVersion() {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (stored) {
        try {
            const storedVersion = JSON.parse(stored);
            // Check if this version exists in our list
            const exists = GAME_VERSIONS.some(v => 
                v.major === storedVersion.major && 
                v.minor === storedVersion.minor
            );
            if (exists) return storedVersion;
        } catch (e) {
            // Invalid JSON, fall back to latest
        }
    }
    return getLatestVersion();
}

/**
 * Set the current game version in localStorage
 * @param {{ major: number, minor: number }} version - The version object to set
 */
export function setCurrentVersion(version) {
    const exists = GAME_VERSIONS.some(v => 
        v.major === version.major && 
        v.minor === version.minor
    );
    if (exists) {
        localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(version));
    }
}

/**
 * Get the database filename for the current version
 * @returns {string} The database filename
 */
export function getDatabaseFile() {
    const version = getCurrentVersion();
    return `skills-${versionToString(version)}.sqlite`;
}

/**
 * Get sorted versions (newest first)
 * @returns {Array<{ major: number, minor: number }>} Sorted array of version objects
 */
export function getSortedVersions() {
    return [...GAME_VERSIONS].sort((a, b) => compareVersions(b, a));
}

/**
 * Initialize a version selector dropdown with all available versions
 * @param {HTMLSelectElement} selectorElement - The select element to populate
 */
export function initializeVersionSelector(selectorElement) {
    if (!selectorElement) {
        console.error('Version selector element not found');
        return;
    }
    
    const currentVersion = getCurrentVersion();
    
    // Populate options
    getSortedVersions().forEach(version => {
        const option = document.createElement('option');
        option.value = JSON.stringify(version);
        option.textContent = versionToString(version);
        if (version.major === currentVersion.major && 
            version.minor === currentVersion.minor) {
            option.selected = true;
        }
        selectorElement.appendChild(option);
    });
    
    // Handle version change
    selectorElement.addEventListener('change', (e) => {
        setCurrentVersion(JSON.parse(e.target.value));
        window.location.reload();
    });
}

