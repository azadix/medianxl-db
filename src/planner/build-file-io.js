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
