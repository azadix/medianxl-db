import { reactive } from 'vue';
import { getFileSkillStore } from '@/shared/skill-data-store.js';

// Selected condition keys stored lowercased
const _selected = reactive({});
export const selectedConditions = _selected;

function emitPlannerConfigChanged(key, value) {
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('plannerConfigChanged', { detail: { key, value } }));
    } catch {
      // ignore
    }
  }
}

/**
 * Clear other selected conditions that share the same mutual-exclusion group.
 * @param {string} keyLower
 */
function clearPeersInGroup(keyLower) {
  const store = getFileSkillStore();
  if (!store || typeof store.getConditionGroup !== 'function') return;
  const group = store.getConditionGroup(keyLower);
  if (!group) return;
  const peers = store.getConditionKeysInGroup(group);
  for (const peer of peers) {
    if (peer === keyLower) continue;
    if (_selected[peer]) _selected[peer] = false;
  }
}

export function isConditionSelected(key) {
  if (!key) return false;
  return Boolean(_selected[String(key).toLowerCase()]);
}

export function toggleCondition(key) {
  if (!key) return;
  const k = String(key).toLowerCase();
  const next = !_selected[k];
  if (next) clearPeersInGroup(k);
  _selected[k] = next;
  emitPlannerConfigChanged(k, next);
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[planner-config] toggleCondition', k, next);
  }
}

export function setCondition(key, value) {
  if (!key) return;
  const k = String(key).toLowerCase();
  const next = !!value;
  if (next) clearPeersInGroup(k);
  _selected[k] = next;
  emitPlannerConfigChanged(k, next);
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[planner-config] setCondition', k, next);
  }
}

export function getSelectedConditionKeys() {
  return Object.keys(_selected).filter((k) => Boolean(_selected[k]));
}

export default {
  _selected,
  isConditionSelected,
  toggleCondition,
  setCondition,
  getSelectedConditionKeys
};
