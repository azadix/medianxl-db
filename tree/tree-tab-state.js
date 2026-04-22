/** Tab name for the skill tree (shared by tree-core and tree-render without importing each other). */

let currentTab = null;

export function getCurrentTab() {
  return currentTab;
}

export function setCurrentTabState(tabName) {
  currentTab = tabName;
}
