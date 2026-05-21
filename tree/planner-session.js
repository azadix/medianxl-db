/**
 * @file Shared mutable state for the legacy planner DOM layer.
 * @module tree/planner-session
 */
import { ToastManager } from '../src/planner/toast-manager.js';
import _Tree from '../src/character/Tree.js';

let skillsList;
/** @type {_Tree|null} */
let plannerTree = null;
let skillsContainer;
let classSelect;
let treeInitialized = false; // Track if tree has been initialized
let currentBuildIndex = null; // Track currently loaded build index for saving
let currentBuildDisplayName = '';
/** Window listeners from setupGlobalEventListeners survive route changes; attach once. */
let plannerTreeGlobalListenersAttached = false;
let skillCardUpdateTimer = null;

export const toastManager = new ToastManager();

function normalizeBuildDisplayName(name) {
    return String(name ?? '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
}

export function setCurrentBuildDisplayName(name) {
    currentBuildDisplayName = normalizeBuildDisplayName(name);
    window.dispatchEvent(new CustomEvent('plannerBuildNameChanged', { detail: { name: currentBuildDisplayName } }));
}

export function getCurrentBuildDisplayName() {
    return currentBuildDisplayName;
}

export function getSkillsList() {
  return skillsList;
}
export function setSkillsList(v) {
  skillsList = v;
}
export function getPlannerTreeRef() {
  return plannerTree;
}
export function setPlannerTreeRef(v) {
  plannerTree = v;
}
export function getSkillsContainer() {
  return skillsContainer;
}
export function setSkillsContainer(v) {
  skillsContainer = v;
}
export function getClassSelect() {
  return classSelect;
}
export function setClassSelect(v) {
  classSelect = v;
}
export function isTreeInitialized() {
  return treeInitialized;
}
export function setTreeInitialized(v) {
  treeInitialized = v;
}
export function getCurrentBuildIndex() {
  return currentBuildIndex;
}
export function setCurrentBuildIndex(v) {
  currentBuildIndex = v;
}
export function isPlannerTreeGlobalListenersAttached() {
  return plannerTreeGlobalListenersAttached;
}
export function setPlannerTreeGlobalListenersAttached(v) {
  plannerTreeGlobalListenersAttached = v;
}
export function getSkillCardUpdateTimer() {
  return skillCardUpdateTimer;
}
export function setSkillCardUpdateTimer(v) {
  skillCardUpdateTimer = v;
}
