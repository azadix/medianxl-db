/**
 * @file Planner build JSON file download / filename helpers.
 * @module planner/build-file-io
 */

/**
 * Build a filesystem-safe .json filename from a build name.
 * @param {unknown} rawName
 * @returns {string}
 */
export function buildJsonDownloadFilename(rawName) {
  let s = String(rawName ?? '')
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex -- strip Windows-illegal and C0 control chars from filenames
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/g, '')
    .trim();
  if (s === '') s = 'Unnamed Build';
  if (s.length > 120) s = s.slice(0, 120).trim();
  return `${s}.json`;
}

/**
 * Trigger a browser download of text as a JSON file.
 * @param {string} text
 * @param {string} filename
 */
export function downloadTextAsJsonFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read build JSON from a Pastebin URL.
 * @param {string} inputUrl
 * @returns {Promise<string>}
 */
export async function readPastebinBuildText(inputUrl) {
  let parsed;
  try {
    parsed = new URL(String(inputUrl).trim());
  } catch {
    throw new Error('Enter a valid Pastebin URL');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'pastebin.com' && hostname !== 'www.pastebin.com' && hostname !== 'raw.pastebin.com') {
    throw new Error('Only pastebin.com links are supported');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const pasteId = parts[0] === 'raw' ? parts[1] : parts[0];
  if (!pasteId || !/^[a-zA-Z0-9]+$/.test(pasteId)) {
    throw new Error('The Pastebin URL does not contain a valid paste id');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://pastebin.com/raw/${pasteId}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Pastebin returned HTTP ${response.status}`);
    }
    const text = await response.text();
    if (!text.trim()) throw new Error('The Pastebin paste is empty');
    return text;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Pastebin request timed out', { cause: error });
    }
    if (error instanceof TypeError) {
      throw new Error('Pastebin could not be reached from this browser', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
