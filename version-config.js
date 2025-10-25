// Game version configuration

// Local storage key for build version override (temporary, only set when loading builds)
const BUILD_VERSION_OVERRIDE_KEY = 'medianxl_build_version_override';

// Default version (used as fallback when database is not yet loaded)
const DEFAULT_VERSION = { major: 2, minor: 12 };

/**
 * Convert version object to string for filenames and display
 * @param {{ major: number, minor: number }} version
 * @returns {string} Version string (e.g., "2.11")
 */
export function versionToString(version) {
    return `${version.major}.${version.minor}`;
}

/**
 * Get the latest version from database (sorted by major DESC, minor DESC)
 * @param {Object} db - SQL.js database instance
 * @returns {{ major: number, minor: number }|null} Latest version object or null if not found
 */
function getLatestVersionFromDB(db) {
    if (!db) return null;
    
    const stmt = db.prepare('SELECT major, minor FROM versions ORDER BY major DESC, minor DESC LIMIT 1');
    let version = null;
    
    if (stmt.step()) {
        const [major, minor] = stmt.get();
        version = { major, minor };
    }
    
    stmt.free();
    return version;
}

/**
 * Get the currently selected game version
 * Always returns the latest version from database if available.
 * Only uses build override if a build explicitly sets it.
 * Falls back to default version if database is not available.
 * @param {Object|null} db - SQL.js database instance (optional)
 * @returns {{ major: number, minor: number }} The selected version object
 */
export function getCurrentVersion(db = null) {
    // First check if there's a build override (set when loading old builds)
    const buildOverride = localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY);
    if (buildOverride) {
        try {
            const overrideVersion = JSON.parse(buildOverride);
            // Validate it's a proper version object
            if (overrideVersion && typeof overrideVersion.major === 'number' && typeof overrideVersion.minor === 'number') {
                // If database is available, verify the override version exists in database
                if (db) {
                    const stmt = db.prepare('SELECT id FROM versions WHERE major = ? AND minor = ?');
                    stmt.bind([overrideVersion.major, overrideVersion.minor]);
                    const exists = stmt.step();
                    stmt.free();
                    if (exists) {
                        return overrideVersion;
                    }
                    // If override version doesn't exist in DB, clear it and continue to get latest
                    clearBuildVersionOverride();
                } else {
                    // Database not available, use override
                    return overrideVersion;
                }
            }
        } catch (e) {
            // Invalid JSON, clear it and continue
            clearBuildVersionOverride();
        }
    }
    
    // Always try to get latest version from database
    if (db) {
        try {
            const latestVersion = getLatestVersionFromDB(db);
            if (latestVersion) {
                return latestVersion;
            }
        } catch (e) {
            console.warn('Failed to get version from database, falling back to default:', e);
        }
    }
    
    // Fall back to default version
    return DEFAULT_VERSION;
}

/**
 * Get active version from database
 * @param {Object} db - SQL.js database instance
 * @returns {{ major: number, minor: number }|null} Active version object or null if not found
 */
function getActiveVersionFromDB(db) {
    if (!db) return null;
    
    const stmt = db.prepare('SELECT major, minor FROM versions WHERE is_active = 1 LIMIT 1');
    let version = null;
    
    if (stmt.step()) {
        const [major, minor] = stmt.get();
        version = { major, minor };
    }
    
    stmt.free();
    return version;
}

/**
 * Set build version override (used when loading builds that require specific versions)
 * This is temporary and will be cleared when switching back to latest
 * @param {{ major: number, minor: number }} version - The version object to set
 */
export function setBuildVersionOverride(version) {
    if (version && typeof version.major === 'number' && typeof version.minor === 'number') {
        localStorage.setItem(BUILD_VERSION_OVERRIDE_KEY, JSON.stringify(version));
    }
}

/**
 * Clear build version override (switch back to latest version)
 */
export function clearBuildVersionOverride() {
    localStorage.removeItem(BUILD_VERSION_OVERRIDE_KEY);
}

/**
 * Set the current game version (for manual version selection)
 * Note: This now sets the build override, which is temporary
 * @param {{ major: number, minor: number }} version - The version object to set
 * @deprecated Use setBuildVersionOverride for build-specific overrides
 */
export function setCurrentVersion(version) {
    // For compatibility, use build override
    setBuildVersionOverride(version);
}

/**
 * Get the database filename for the current version
 * Note: This is called BEFORE database loads, so it checks build override or uses default
 * @returns {string} The database filename
 */
export function getDatabaseFile() {
    // Don't pass db parameter - this is called before database is loaded
    // Check for build override first, then fall back to default
    const buildOverride = localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY);
    if (buildOverride) {
        try {
            const overrideVersion = JSON.parse(buildOverride);
            if (overrideVersion && typeof overrideVersion.major === 'number' && typeof overrideVersion.minor === 'number') {
                return `db/${versionToString(overrideVersion)}.sqlite`;
            }
        } catch (e) {
            // Invalid JSON, fall through to default
        }
    }
    // Fall back to default version (before database loads, we can't determine latest)
    return `db/${versionToString(DEFAULT_VERSION)}.sqlite`;
}

/**
 * Get sorted versions from database (newest first)
 * Falls back to default version if database is not available
 * @param {Object|null} db - SQL.js database instance (optional)
 * @returns {Promise<Array<{ major: number, minor: number }>>} Sorted array of version objects
 */
export async function getSortedVersions(db = null) {
    if (db) {
        try {
            const versions = getAllVersions(db);
            return versions.map(v => ({ major: v.major, minor: v.minor }));
        } catch (e) {
            console.warn('Failed to get versions from database:', e);
        }
    }
    // Fallback to default version
    return [DEFAULT_VERSION];
}

/**
 * Initialize a version selector dropdown with versions from database
 * Falls back to default version if database is not available
 * @param {HTMLSelectElement} selectorElement - The select element to populate
 * @param {Object|null} db - SQL.js database instance (optional)
 */
export async function initializeVersionSelector(selectorElement, db = null) {
    if (!selectorElement) {
        console.error('Version selector element not found');
        return;
    }
    
    // Get current version from database if available, otherwise fall back to localStorage/default
    const currentVersion = getCurrentVersion(db);
    
    // Populate options from database if available
    const versions = await getSortedVersions(db);
    
    versions.forEach(version => {
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
        const selectedVersion = JSON.parse(e.target.value);
        
        // If database is available, check if selected version is the latest
        if (db) {
            const latestVersion = getLatestVersionFromDB(db);
            // If selecting latest version, clear override. Otherwise set override.
            if (latestVersion && selectedVersion.major === latestVersion.major && selectedVersion.minor === latestVersion.minor) {
                clearBuildVersionOverride();
            } else {
                setBuildVersionOverride(selectedVersion);
            }
        } else {
            // No database available, set override (will be validated on next load)
            setBuildVersionOverride(selectedVersion);
        }
        window.location.reload();
    });
}

/**
 * Database version management functions
 * These work with versions stored in the database
 */

/**
 * Get all versions from database
 * @param {Object} db - SQL.js database instance
 * @returns {Array<{id: number, major: number, minor: number, name: string, is_active: boolean}>}
 */
export function getAllVersions(db) {
    if (!db) return [];
    
    const stmt = db.prepare('SELECT id, major, minor, name, is_active FROM versions ORDER BY major DESC, minor DESC');
    const versions = [];
    
    while (stmt.step()) {
        const [id, major, minor, name, is_active] = stmt.get();
        versions.push({
            id,
            major,
            minor,
            name,
            is_active: Boolean(is_active)
        });
    }
    
    stmt.free();
    return versions;
}

/**
 * Get active version ID from database
 * @param {Object} db - SQL.js database instance
 * @returns {number|null} Active version ID or null if not found
 */
export function getCurrentVersionId(db) {
    if (!db) return null;
    
    const stmt = db.prepare('SELECT id FROM versions WHERE is_active = 1 LIMIT 1');
    let versionId = null;
    
    if (stmt.step()) {
        versionId = stmt.get()[0];
    }
    
    stmt.free();
    return versionId;
}

/**
 * Set active version in database
 * @param {Object} db - SQL.js database instance
 * @param {number} versionId - Version ID to set as active
 */
export function setActiveVersion(db, versionId) {
    if (!db) return;
    
    // Set all versions to inactive
    db.run('UPDATE versions SET is_active = 0');
    
    // Set specified version to active
    db.run('UPDATE versions SET is_active = 1 WHERE id = ?', [versionId]);
}

/**
 * Create a new version in database
 * @param {Object} db - SQL.js database instance
 * @param {number} major - Major version number
 * @param {number} minor - Minor version number
 * @returns {number} The ID of the newly created version
 */
export function createVersion(db, major, minor) {
    if (!db) {
        throw new Error('Database not provided');
    }
    
    const name = versionToString({ major, minor });
    
    // Check if version already exists
    const checkStmt = db.prepare('SELECT id FROM versions WHERE major = ? AND minor = ?');
    checkStmt.bind([major, minor]);
    
    if (checkStmt.step()) {
        const existingId = checkStmt.get()[0];
        checkStmt.free();
        throw new Error(`Version ${name} already exists`);
    }
    checkStmt.free();
    
    // Insert new version
    db.run('INSERT INTO versions (major, minor, name, is_active) VALUES (?, ?, ?, 0)', 
        [major, minor, name]);
    
    // Get the ID of the newly created version
    const getIdStmt = db.prepare('SELECT id FROM versions WHERE major = ? AND minor = ?');
    getIdStmt.bind([major, minor]);
    let newId = null;
    
    if (getIdStmt.step()) {
        newId = getIdStmt.get()[0];
    }
    
    getIdStmt.free();
    return newId;
}

/**
 * Delete a version from database
 * @param {Object} db - SQL.js database instance
 * @param {number} versionId - Version ID to delete
 */
export function deleteVersion(db, versionId) {
    if (!db) {
        throw new Error('Database not provided');
    }
    
    // Check if this is the active version
    const checkStmt = db.prepare('SELECT is_active FROM versions WHERE id = ?');
    checkStmt.bind([versionId]);
    
    if (checkStmt.step()) {
        const is_active = checkStmt.get()[0];
        if (is_active) {
            checkStmt.free();
            throw new Error('Cannot delete the active version');
        }
    }
    checkStmt.free();
    
    // Delete version (CASCADE will handle related records)
    db.run('DELETE FROM versions WHERE id = ?', [versionId]);
}

