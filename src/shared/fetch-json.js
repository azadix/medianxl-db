/**
 * @file Shared fetch helper for JSON assets under `public/`.
 * @module shared/fetch-json
 */

/**
 * @param {string} path
 * @returns {Promise<unknown>}
 */
export async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Failed to load ${path}: ${res.status}`);
    }
    return res.json();
}
