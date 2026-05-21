/**
 * @file Editor JSON download to disk (user replaces tree_data file).
 * @module src/editor/editor-download
 */
import { getEditorExportPayload, showEditorToast } from './editor-store.js';

/**
 * Download the in-memory skills buffer as JSON.
 */
export function downloadSkillsJson() {
  const { text, basename, folderSeg } = getEditorExportPayload();
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = basename;
  a.click();
  URL.revokeObjectURL(url);
  showEditorToast(`Download started. Replace tree_data/${folderSeg}/${basename} in your repo.`);
}
