/** URL query sync for planner class/tab/build (no dependency on tree-core). */

export function updatePlannerUrlTab(selectedClass, selectedTab) {
  const url = new URL(window.location.href);
  if (selectedClass) {
    url.searchParams.set('class', selectedClass);
  }
  if (selectedTab) {
    url.searchParams.set('tab', selectedTab);
  } else {
    url.searchParams.delete('tab');
  }
  window.history.replaceState({}, '', url);
}

export function setBuildUrlParam(encoded) {
  const url = new URL(window.location.href);
  url.searchParams.set('build', encoded);
  window.history.replaceState({}, '', url);
}
