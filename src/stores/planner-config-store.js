import { reactive } from 'vue';

// Selected condition keys stored lowercased
const _selected = reactive({});
export const selectedConditions = _selected;

export function isConditionSelected(key) {
  if (!key) return false;
  return Boolean(_selected[String(key).toLowerCase()]);
}

export function toggleCondition(key) {
  if (!key) return;
  const k = String(key).toLowerCase();
  _selected[k] = !_selected[k];
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('plannerConfigChanged', { detail: { key: k, value: _selected[k] } }));
    } catch {
      // ignore
    }
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[planner-config] toggleCondition', k, _selected[k]);
  }
  try {
    // recompute is triggered by listening to the 'plannerConfigChanged' event elsewhere
  } catch {
    // ignore
  }
}

export function setCondition(key, value) {
  if (!key) return;
  _selected[String(key).toLowerCase()] = !!value;
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('plannerConfigChanged', { detail: { key: String(key).toLowerCase(), value: !!value } }));
    } catch {
      // ignore
    }
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[planner-config] setCondition', String(key).toLowerCase(), !!value);
  }
  try {
    // recompute is triggered by listening to the 'plannerConfigChanged' event elsewhere
  } catch {
    // ignore
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
