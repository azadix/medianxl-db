/**
 * @file Thin facade: re-exports planner modules for backward compatibility.
 * @module tree/tree-core
 */
export { getSavedBuilds, notifySavedBuildsListRefresh } from '../src/planner/saved-builds-storage.js';
export { getOSkillPoints } from '../src/character/character-state.js';
export { compressBuildToUrlParam, decompressBuildFromUrlParam, parseVersionString } from '../src/planner/build-url-codec.js';
export {
  getCurrentBuildDisplayName,
  setCurrentBuildDisplayName,
} from './planner-session.js';
export {
  calculateArmorImageNumber,
  getAllSkillsBonus,
  setAllSkillsBonus,
  showSection,
  handleSkillPointsChanged,
  initializeOSkillsDropdown,
  exportLabelForToast,
} from './planner-ui-updates.js';
export { initializeTreePage, plannerRefreshAfterLevelOptions, setCurrentTab } from './planner-init.js';
export {
  plannerMenuNewBuild,
  plannerMenuOpenLoadSection,
  plannerMenuImportBuild,
  plannerMenuOpenHelp,
  plannerBackToMenuFromTree,
  plannerBackToMenuFromLoad,
  plannerResetBuildClick,
  plannerSaveBuildClick,
  plannerSaveAsBuildClick,
  plannerExportBuildClick,
  plannerRenameBuildClick,
} from './planner-dom-handlers.js';
export {
  ensureCharacterForBuildList,
  renderSavedBuildsList,
  exportBuild,
  loadBuild,
  deleteBuild,
  renameBuild,
  importBuild,
  loadBuildData,
} from './saved-builds-ui.js';

import { getPlannerTreeRef } from './planner-session.js';

/**
 * Current planner skill tree wrapper.
 * @returns {import('../src/character/Tree.js').default|null}
 */
export function getPlannerTree() {
  return getPlannerTreeRef();
}
