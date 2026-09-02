/**
 * @file Version-related localStorage keys and defaults (no store imports).
 * @module shared/version-constants
 */

/** localStorage key for planner/patch-notes build version override (major.minor object JSON). */
export const BUILD_VERSION_OVERRIDE_KEY = 'medianxl_build_version_override';

/** Fallback when versions.json is unavailable. */
export const DEFAULT_GAME_VERSION = { major: 2, minor: 14 };

/**
 * Folder segment under `public/tree_data/`, e.g. `2_12`.
 * @param {number} major
 * @param {number} minor
 * @returns {string}
 */
export function treeAssetFolderFromMajorMinor(major, minor) {
    return `${major}_${minor}`;
}

/** Fallback `tree_data` folder (atlas icons, etc.) when no patch folder is passed. */
export const DEFAULT_TREE_ASSET_FOLDER = treeAssetFolderFromMajorMinor(
    DEFAULT_GAME_VERSION.major,
    DEFAULT_GAME_VERSION.minor
);
