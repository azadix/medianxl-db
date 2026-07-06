/**
 * @file Game version resolution (override, active row, folder keys). No store imports.
 * @module shared/version-resolver
 */

import { BUILD_VERSION_OVERRIDE_KEY, DEFAULT_GAME_VERSION } from './version-constants.js';

/**
 * @typedef {{ major: number, minor: number }} GameVersion
 * @typedef {{ major: number, minor: number, is_active?: boolean | number }} VersionRow
 */

/**
 * @returns {GameVersion | null}
 */
export function parseBuildOverride() {
    const raw = localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.major === 'number' && typeof parsed.minor === 'number') {
            return { major: parsed.major, minor: parsed.minor };
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Parse a `tree_data` folder key (e.g. `2_12`) to major/minor.
 * @param {string} folderKey
 * @returns {GameVersion | null}
 */
export function parseFolderVersion(folderKey) {
    const [majorRaw, minorRaw] = String(folderKey || '').split('_');
    const major = Number.parseInt(majorRaw, 10);
    const minor = Number.parseInt(minorRaw, 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
    return { major, minor };
}

/**
 * @param {VersionRow[]} versionsList
 * @param {GameVersion} version
 * @returns {boolean}
 */
function versionsListContains(versionsList, version) {
    return versionsList.some((row) => row.major === version.major && row.minor === version.minor);
}

/**
 * Resolve major/minor from build override, active versions.json row, first row, or fallback.
 * @param {VersionRow[] | null | undefined} versionsList
 * @param {{ defaultVersion?: GameVersion, clearInvalidOverride?: boolean }} [options]
 * @returns {GameVersion}
 */
export function resolveGameVersion(versionsList, options = {}) {
    const defaultVersion = options.defaultVersion ?? { ...DEFAULT_GAME_VERSION };
    const overrideVersion = parseBuildOverride();

    if (overrideVersion && versionsList?.length) {
        if (versionsListContains(versionsList, overrideVersion)) {
            return overrideVersion;
        }
        if (options.clearInvalidOverride) {
            localStorage.removeItem(BUILD_VERSION_OVERRIDE_KEY);
        }
    } else if (overrideVersion && !versionsList?.length) {
        return overrideVersion;
    }

    const active = versionsList?.find((row) => row.is_active);
    if (active) {
        return { major: active.major, minor: active.minor };
    }
    if (versionsList?.length) {
        const first = versionsList[0];
        return { major: first.major, minor: first.minor };
    }
    return { ...defaultVersion };
}

/**
 * @deprecated Use {@link resolveGameVersion}.
 * @param {VersionRow[] | null | undefined} versionsList
 * @param {GameVersion} defaultVersion
 * @returns {GameVersion}
 */
export function getRequestedTreeVersion(versionsList, defaultVersion) {
    return resolveGameVersion(versionsList, { defaultVersion });
}
