/**
 * @file Per-import capability flag: does this build's item payload carry the FULL rendered
 * item text (every stat with its rolled value), or only a partial description?
 *
 * Two exporters exist in practice:
 *  - TSW dumps: `description_lines` are partial (they omit some rolled stats) and the stats
 *    blob holds FINAL character totals (`life 12338`).
 *  - d2s-export: `description_lines` are complete (every stat, already rolled) and the stats
 *    blob holds BASE values (`life 4544`).
 *
 * Several rules can only be applied to the complete-text flavour, otherwise they under-count
 * real TSW builds (see handoff.md). Keeping the answer in one place avoids re-deriving it.
 */
let completeItemText = false;

/**
 * @param {boolean} value
 */
export function setCompleteItemText(value) {
  completeItemText = value === true;
}

/**
 * @returns {boolean}
 */
export function isCompleteItemText() {
  return completeItemText;
}

/**
 * Detect a full-text payload. The reliable marker is socketable text: the d2s exporter
 * emits `description_lines` on every socketable, while TSW's socketables carry only
 * slot/name/type/code/image. A build with no sockets and complete text will read as
 * partial (safe default: partial rules never over-count).
 * @param {Array<object>|null|undefined} rows
 * @returns {boolean}
 */
export function detectCompleteItemText(rows) {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    const sockets = Array.isArray(row?.socketables) ? row.socketables : [];
    for (const socket of sockets) {
      if (Array.isArray(socket?.description_lines) && socket.description_lines.length > 0) {
        return true;
      }
    }
  }
  return false;
}
