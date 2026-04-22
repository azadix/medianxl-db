// Game version configuration (tree_data/versions.json + game_meta.json via SkillFileStore)

import { getFileSkillStore } from './tree/skill-data-store.js';

const BUILD_VERSION_OVERRIDE_KEY = 'medianxl_build_version_override';

const DEFAULT_VERSION = { major: 2, minor: 12 };

/**
 * @param {{ major: number, minor: number }} version
 * @returns {string}
 */
export function versionToString(version) {
    return `${version.major}.${version.minor}`;
}

/**
 * Folder segment for tree JSON and atlas PNGs, e.g. tree_data/2_12/
 * @param {{ major: number, minor: number }} version
 */
export function versionToTreeAssetFolder(version) {
    if (!version || typeof version.major !== 'number' || typeof version.minor !== 'number') {
        return `${DEFAULT_VERSION.major}_${DEFAULT_VERSION.minor}`;
    }
    return `${version.major}_${version.minor}`;
}

/**
 * Selected major/minor: build override from localStorage if valid, else active row from versions.json, else first row, else DEFAULT_VERSION.
 * @returns {{ major: number, minor: number }}
 */
export function getCurrentVersion() {
    let parsedOverride = null;
    const buildOverrideRaw = localStorage.getItem(BUILD_VERSION_OVERRIDE_KEY);
    if (buildOverrideRaw) {
        try {
            const o = JSON.parse(buildOverrideRaw);
            if (o && typeof o.major === 'number' && typeof o.minor === 'number') {
                parsedOverride = o;
            } else {
                clearBuildVersionOverride();
            }
        } catch {
            clearBuildVersionOverride();
        }
    }

    const store = getFileSkillStore();
    if (store?.versions?.length) {
        if (parsedOverride) {
            const ok = store.versions.some(
                (v) => v.major === parsedOverride.major && v.minor === parsedOverride.minor
            );
            if (ok) {
                return parsedOverride;
            }
            clearBuildVersionOverride();
        }
        const active = store.versions.find((v) => v.is_active);
        if (active) {
            return { major: active.major, minor: active.minor };
        }
        const v0 = store.versions[0];
        return { major: v0.major, minor: v0.minor };
    }

    if (parsedOverride) {
        return parsedOverride;
    }
    return DEFAULT_VERSION;
}

export function setBuildVersionOverride(version) {
    if (version && typeof version.major === 'number' && typeof version.minor === 'number') {
        localStorage.setItem(BUILD_VERSION_OVERRIDE_KEY, JSON.stringify(version));
    }
}

export function clearBuildVersionOverride() {
    localStorage.removeItem(BUILD_VERSION_OVERRIDE_KEY);
}

/** @deprecated Use setBuildVersionOverride */
export function setCurrentVersion(version) {
    setBuildVersionOverride(version);
}

/**
 * @returns {Promise<Array<{ major: number, minor: number }>>}
 */
export async function getSortedVersions() {
    const store = getFileSkillStore();
    if (store?.versions?.length) {
        return store.versions.map((v) => ({ major: v.major, minor: v.minor }));
    }
    return [DEFAULT_VERSION];
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
 * @param {{ major: number, minor: number }} version
 * @returns {number|null}
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
 * @param {number} versionId
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
