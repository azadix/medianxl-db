/**
 * @file Game version selection (versions.json, build override, navbar selector).
 * @module shared/version-config
 */

import { getFileSkillStore } from '@/tree/skill-data-store.js';
import {
    BUILD_VERSION_OVERRIDE_KEY,
    DEFAULT_GAME_VERSION,
    treeAssetFolderFromMajorMinor,
} from './version-constants.js';
import { parseBuildOverride, resolveGameVersion } from './version-resolver.js';

/**
 * @typedef {{ major: number, minor: number }} GameVersion
 * @typedef {{ major: number, minor: number, patch: number }} PatchVersionParts
 */

/**
 * @param {GameVersion} version
 * @returns {string} e.g. `"2.12"`
 */
export function versionToString(version) {
    return `${version.major}.${version.minor}`;
}

/**
 * Folder segment for tree JSON and atlas PNGs, e.g. `tree_data/2_12/`.
 * @param {GameVersion | null | undefined} version
 * @returns {string}
 */
export function versionToTreeAssetFolder(version) {
    if (!version || typeof version.major !== 'number' || typeof version.minor !== 'number') {
        return treeAssetFolderFromMajorMinor(DEFAULT_GAME_VERSION.major, DEFAULT_GAME_VERSION.minor);
    }
    return treeAssetFolderFromMajorMinor(version.major, version.minor);
}

/**
 * Parse a patch-notes version string (supports `2.13.5`; patch segment defaults to 0).
 * @param {string | number} version
 * @returns {PatchVersionParts}
 */
export function parsePatchVersionString(version) {
    const parts = String(version).split('.').map((part) => Number.parseInt(part, 10));
    return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
    };
}

/**
 * Map patch-notes version string to `tree_data` folder key (major_minor only).
 * @param {string | number} version
 * @returns {string}
 */
export function patchVersionToFolderKey(version) {
    const { major, minor } = parsePatchVersionString(version);
    return treeAssetFolderFromMajorMinor(major, minor);
}

/**
 * Selected major/minor: build override from localStorage if valid, else active row from versions.json, else first row, else default.
 * @returns {GameVersion}
 */
export function getCurrentVersion() {
    const parsedOverride = parseBuildOverride();
    if (parsedOverride === null && localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY)) {
        clearBuildVersionOverride();
    }

    const store = getFileSkillStore();
    return resolveGameVersion(store?.versions, {
        defaultVersion: DEFAULT_GAME_VERSION,
        clearInvalidOverride: true,
    });
}

/**
 * @param {GameVersion} version
 */
export function setBuildVersionOverride(version) {
    if (version && typeof version.major === 'number' && typeof version.minor === 'number') {
        localStorage.setItem(BUILD_VERSION_OVERRIDE_KEY, JSON.stringify(version));
    }
}

export function clearBuildVersionOverride() {
    localStorage.removeItem(BUILD_VERSION_OVERRIDE_KEY);
}

/**
 * @deprecated Use {@link setBuildVersionOverride}; this alias is kept for legacy callers.
 */
export function setCurrentVersion(version) {
    setBuildVersionOverride(version);
}

/**
 * @returns {Promise<GameVersion[]>}
 */
export async function getSortedVersions() {
    const store = getFileSkillStore();
    if (store?.versions?.length) {
        return store.versions.map((v) => ({ major: v.major, minor: v.minor }));
    }
    return [{ ...DEFAULT_GAME_VERSION }];
}

/**
 * Remove change listeners attached by the app or the editor (shared navbar select).
 * @param {HTMLSelectElement | null} selectorElement
 */
export function detachVersionSelectorListeners(selectorElement) {
    if (!selectorElement) return;
    if (selectorElement._medianxlVersionChangeHandler) {
        selectorElement.removeEventListener('change', selectorElement._medianxlVersionChangeHandler);
        delete selectorElement._medianxlVersionChangeHandler;
    }
    if (selectorElement._editorVersionChangeHandler) {
        selectorElement.removeEventListener('change', selectorElement._editorVersionChangeHandler);
        delete selectorElement._editorVersionChangeHandler;
    }
}

/**
 * Populate `#version-selector` and reload on change (clears override when selecting active version).
 * @param {HTMLSelectElement} selectorElement
 */
export async function initializeVersionSelector(selectorElement) {
    if (!selectorElement) {
        console.error('Version selector element not found');
        return;
    }

    detachVersionSelectorListeners(selectorElement);
    selectorElement.innerHTML = '';

    const currentVersion = getCurrentVersion();
    const versions = await getSortedVersions();

    versions.forEach((version) => {
        const option = document.createElement('option');
        option.value = JSON.stringify(version);
        option.textContent = versionToString(version);
        if (version.major === currentVersion.major && version.minor === currentVersion.minor) {
            option.selected = true;
        }
        selectorElement.appendChild(option);
    });

    const onVersionChange = (e) => {
        const selectedVersion = JSON.parse(e.target.value);
        const store = getFileSkillStore();
        const active = store?.versions?.find((v) => v.is_active);
        if (
            active &&
            selectedVersion.major === active.major &&
            selectedVersion.minor === active.minor
        ) {
            clearBuildVersionOverride();
        } else {
            setBuildVersionOverride(selectedVersion);
        }
        window.location.reload();
    };

    selectorElement.addEventListener('change', onVersionChange);
    selectorElement._medianxlVersionChangeHandler = onVersionChange;
}

/**
 * @param {GameVersion | null | undefined} version
 * @returns {number | null}
 */
export function getVersionIdForMajorMinor(version) {
    if (!version || typeof version.major !== 'number' || typeof version.minor !== 'number') {
        return null;
    }
    const store = getFileSkillStore();
    const row = store?.versions?.find((v) => v.major === version.major && v.minor === version.minor);
    return row ? row.id : null;
}

/**
 * @param {number | null | undefined} versionId
 * @returns {string}
 */
export function getVersionStringForId(versionId) {
    if (versionId == null) return '';
    const store = getFileSkillStore();
    const row = store?.versions?.find((v) => v.id === versionId);
    return row ? versionToString({ major: row.major, minor: row.minor }) : '';
}

/** @returns {number[]} */
export function getBalanceVersionIdsForFallback() {
    return getFileSkillStore()?.getBalanceVersionIds() ?? [];
}
