/**
 * Stub fetch + localStorage so initSkillDataStore() can load public/tree_data in Node.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');
export const PUBLIC_ROOT = join(REPO_ROOT, 'public');

function createMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Map a fetch URL/path to a file under public/.
 * Handles `/medianxl-db/tree_data/...`, `tree_data/...`, and absolute file-ish paths.
 * @param {string} input
 * @returns {string|null}
 */
export function resolvePublicPath(input) {
  let path = String(input || '');
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    /* keep path */
  }
  path = path.replace(/\\/g, '/');
  const basePrefix = '/medianxl-db/';
  if (path.startsWith(basePrefix)) {
    path = path.slice(basePrefix.length);
  }
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (!path.startsWith('tree_data/') && !path.startsWith('icons/') && !path.startsWith('patch_notes/')) {
    const idx = path.indexOf('tree_data/');
    if (idx >= 0) path = path.slice(idx);
  }
  const abs = normalize(join(PUBLIC_ROOT, path));
  if (!abs.startsWith(normalize(PUBLIC_ROOT))) return null;
  return abs;
}

/**
 * Install global fetch and localStorage stubs. Returns a restore function.
 * @returns {() => void}
 */
export function installTreeDataFetchMock() {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;

  if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.getItem) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryLocalStorage(),
      configurable: true,
      writable: true,
    });
  } else {
    globalThis.localStorage.clear?.();
  }

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const filePath = resolvePublicPath(url);
    if (!filePath || !existsSync(filePath)) {
      return {
        ok: false,
        status: 404,
        async json() {
          throw new Error(`Not found: ${url}`);
        },
        async text() {
          return '';
        },
      };
    }
    const body = readFileSync(filePath, 'utf8');
    return {
      ok: true,
      status: 200,
      async json() {
        return JSON.parse(body);
      },
      async text() {
        return body;
      },
    };
  };

  return () => {
    globalThis.fetch = previousFetch;
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: previousLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  };
}

/**
 * Active tree_data folder absolute path from versions.json.
 * @returns {string}
 */
export function getActiveTreeDataDir() {
  const versions = JSON.parse(readFileSync(join(PUBLIC_ROOT, 'tree_data', 'versions.json'), 'utf8'));
  const active = versions.find((v) => v.is_active) ?? versions[0];
  return join(PUBLIC_ROOT, 'tree_data', `${active.major}_${active.minor}`);
}
