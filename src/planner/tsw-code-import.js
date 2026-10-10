/**
 * @file TSW one-shot import: read `#code=` from /import/tsw, POST to TSW, import JSON.
 * @module planner/tsw-code-import
 */

export const TSW_CHARACTER_EXPORT_URL =
  'https://tsw.vn.cz/api.php?resource=character_export';

/** @type {string} */
let pendingTswImportCode = '';

/**
 * @param {string} [hash]
 * @returns {string}
 */
export function parseTswImportCodeFromHash(hash) {
  const raw = String(hash || '');
  const q = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!q) return '';
  const params = new URLSearchParams(q);
  const code = params.get('code');
  return typeof code === 'string' ? code.trim() : '';
}

/**
 * Read `#code=`, stash it, and drop it from the address bar (replaceState).
 * @param {Pick<Location, 'hash' | 'pathname' | 'search'>} [loc]
 * @param {Pick<History, 'state' | 'replaceState'>} [hist]
 * @returns {string}
 */
export function consumeTswImportCodeFromLocation(
  loc = typeof window !== 'undefined' ? window.location : undefined,
  hist = typeof window !== 'undefined' ? window.history : undefined
) {
  if (!loc || !hist) return pendingTswImportCode;
  const code = parseTswImportCodeFromHash(loc.hash);
  if (!code) return pendingTswImportCode;
  pendingTswImportCode = code;
  const params = new URLSearchParams(loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.hash);
  params.delete('code');
  const rest = params.toString();
  hist.replaceState(hist.state, '', `${loc.pathname}${loc.search}${rest ? `#${rest}` : ''}`);
  return code;
}

/**
 * @returns {string}
 */
export function takePendingTswImportCode() {
  const code = pendingTswImportCode;
  pendingTswImportCode = '';
  return code;
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function errorMessageFromTswPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'TSW import failed';
  }
  const rec = /** @type {{ error?: unknown, message?: unknown }} */ (data);
  if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim();
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
  return 'TSW import failed';
}

/**
 * POST {code} to TSW. Returns the envelope ({ build, items, ... }). No Bearer token.
 * @param {string} code
 * @returns {Promise<object>}
 */
export async function fetchTswBuildByCode(code) {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) {
    throw new Error('Missing TSW import code');
  }

  const res = await fetch(TSW_CHARACTER_EXPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: trimmed }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(res.ok ? 'Invalid JSON from TSW import' : `TSW import failed (${res.status})`);
  }

  if (!res.ok || (data && typeof data === 'object' && /** @type {{ ok?: unknown }} */ (data).ok === false)) {
    const suffix = res.ok ? '' : ` (${res.status})`;
    const msg = errorMessageFromTswPayload(data);
    throw new Error(msg === 'TSW import failed' ? `${msg}${suffix}` : msg);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data) || !('build' in data)) {
    throw new Error('TSW import returned no build');
  }

  return /** @type {object} */ (data);
}
