/**
 * @file Planner page initialization and URL/deep-link restore.
 * @module planner/planner-init
 */
import { loadPlannerSkillsFromTreeData } from '@/tree/tree-data.js';
import { renderSkills } from '@/tree/tree-render.js';
import { getCurrentTab, setCurrentTabState } from '@/tree/tree-render.js';
import { updatePlannerUrlTab } from '@/planner/tree-url-sync.js';
import Tree from '@/tree/Tree.js';
import Character from '@/character/Character.js';
import {
  initializeCharacter,
  applyClassBaselineStatsToCharacter,
  runPlannerSkillStatRecompute,
  getCharacterInstance,
  getCharacterLevel,
  clearOSkills,
  clearAllStats,
  syncItemGrantedOSkills,
} from '@/character/planner-core.js';
import { refreshPlannerStatsPanelFromCharacter } from '@/character/planner-stats-panel.js';
import { initPlannerSidebarTabQuests } from '@/character/sidebar-tab-quests.js';
import { initializeVersionSelector } from '@/shared/version-config.js';
import { initializeTooltip } from '@/tree/tree-tooltip.js';
import { clearSkillVariants, applySkillVariantDefaultsForClass } from '@/tree/skill-variants.js';
import { decompressBuildFromUrlParam } from '@/planner/build-url-codec.js';
import {
  setSkillsList,
  setPlannerTreeRef,
  setSkillsContainer,
  setClassSelect,
  isTreeInitialized,
  setTreeInitialized,
  isPlannerTreeGlobalListenersAttached,
  setPlannerTreeGlobalListenersAttached,
  getSkillsList,
  getClassSelect,
  getSkillsContainer,
} from './planner-session.js';
import { importBuild, loadPlannerClassNames } from './saved-builds-ui.js';
import {
  updateSkillPointsDisplay,
  updateDevotionDisplay,
  handleSkillPointsChanged,
  initializeOSkillsDropdown,
  updateClassSkillsBonusLabel,
} from './planner-ui-updates.js';
import { refreshCurrentTooltip } from '@/tree/tree-tooltip.js';
import { useItemsStore } from '@/stores/items.js';

async function finalizePlannerPageAfterLoad() {
    if (!isTreeInitialized() || !getSkillsList() || !getClassSelect() || !getSkillsContainer()) return;
    const classSelect = getClassSelect();
    const availableClasses = Array.from(classSelect.options).map((option) => option.value);
    if (!availableClasses.length) return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlClass = urlParams.get('class');
    const buildParam = urlParams.get('build');
    const existingCharacter = getCharacterInstance();
    if (buildParam) {
        await main();
        return;
    }
    if (existingCharacter) {
        let selectedClass = availableClasses[0];
        if (urlClass && availableClasses.includes(urlClass)) selectedClass = urlClass;
        else if (existingCharacter.className && availableClasses.includes(existingCharacter.className)) {
            selectedClass = existingCharacter.className;
        }
        classSelect.value = selectedClass;
        const urlTab = urlParams.get('tab');
        const savedTab = urlTab || getCurrentTab();
        updateClassSkillsBonusLabel(selectedClass);
        renderSkills(selectedClass, getSkillsList(), getSkillsContainer(), savedTab);
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));
        initializeTooltip();
        initializeOSkillsDropdown();
    } else if (urlClass && availableClasses.includes(urlClass)) {
        await main();
    }
}

export async function initializeTreePage() {
    setSkillsContainer(document.getElementById('skillsContainer'));
    setClassSelect(document.getElementById('classSelect'));
    const skillsContainer = getSkillsContainer();
    const classSelect = getClassSelect();
    if (!skillsContainer || !classSelect) {
        console.error('Required elements not found');
        return;
    }
    try {
        const list = await loadPlannerSkillsFromTreeData();
        setSkillsList(list);
        setPlannerTreeRef(new Tree(list));
        setTreeInitialized(true);
        const classes = loadPlannerClassNames(list);
        for (const cls of classes) {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            classSelect.appendChild(opt);
        }
        const versionSelector = document.getElementById('version-selector');
        if (versionSelector) {
            versionSelector.innerHTML = '';
            await initializeVersionSelector(versionSelector);
        }
    } catch (error) {
        console.error('Error loading skill data on page initialization:', error);
        return;
    }
    classSelect.addEventListener('change', function onPlannerClassSelectChange() {
        const newClass = classSelect.value;
        setCurrentTabState(null);
        updatePlannerUrlTab(newClass, null);
        clearOSkills();
        if (window.oskillDropdownInstance) window.oskillDropdownInstance.clearSearch();
        const currentLevel = getCharacterLevel();
        initializeCharacter(newClass, currentLevel);
        clearAllStats();
        applyClassBaselineStatsToCharacter(newClass);
        clearSkillVariants();
        applySkillVariantDefaultsForClass(newClass);
        updateClassSkillsBonusLabel(newClass);
        refreshPlannerStatsPanelFromCharacter();
        useItemsStore().syncViewerClassName(newClass);
        syncItemGrantedOSkills();
        window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { classChange: true } }));
        const currentSkillsList = getSkillsList();
        const currentSkillsContainer = getSkillsContainer();
        if (!currentSkillsList || !currentSkillsContainer) return;
        renderSkills(newClass, currentSkillsList, currentSkillsContainer);
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));
        runPlannerSkillStatRecompute();
        refreshCurrentTooltip();
    });
    setupGlobalEventListeners();
    initPlannerSidebarTabQuests();
    await finalizePlannerPageAfterLoad();
}

function setupGlobalEventListeners() {
  if (isPlannerTreeGlobalListenersAttached()) return;
  setPlannerTreeGlobalListenersAttached(true);
  window.addEventListener('skillPointsChanged', handleSkillPointsChanged);
  window.addEventListener('characterLevelChanged', () => handleSkillPointsChanged());
  window.addEventListener('questCompletionChanged', () => handleSkillPointsChanged());
  window.addEventListener('characterStatsChanged', () => refreshCurrentTooltip());
  const onSkillBonusInput = () => {
    refreshCurrentTooltip();
    runPlannerSkillStatRecompute();
  };
  const allSkillsBonusInput = document.getElementById('allSkillsBonus');
  if (allSkillsBonusInput) {
    allSkillsBonusInput.addEventListener('input', onSkillBonusInput);
  }
  const classSkillsBonusInput = document.getElementById('classSkillsBonus');
  if (classSkillsBonusInput) {
    classSkillsBonusInput.addEventListener('input', onSkillBonusInput);
  }
}

export async function main() {
    try {
        if (!isTreeInitialized()) {
            console.error('Skill data not initialized. This should not happen.');
            return;
        }
        const classSelect = getClassSelect();
        const skillsContainer = getSkillsContainer();
        const skillsList = getSkillsList();
        const urlParams = new URLSearchParams(window.location.search);
        const savedClass = urlParams.get('class');
        const savedTab = urlParams.get('tab');
        const buildParam = urlParams.get('build');
        if (buildParam) {
            try {
                const buildData = await decompressBuildFromUrlParam(buildParam);
                importBuild(buildData);
                return;
            } catch (e) {
                console.warn('Invalid build URL param, ignoring.', e);
            }
        }
        const availableClasses = Array.from(classSelect.options).map((option) => option.value);
        const selectedClass = savedClass && availableClasses.includes(savedClass) ? savedClass : availableClasses[0];
        classSelect.value = selectedClass;
        initializeCharacter(selectedClass, Character.DEFAULT_LEVEL);
        applyClassBaselineStatsToCharacter(selectedClass);
        refreshPlannerStatsPanelFromCharacter();
        clearSkillVariants();
        applySkillVariantDefaultsForClass(selectedClass);
        updateClassSkillsBonusLabel(selectedClass);
        renderSkills(selectedClass, skillsList, skillsContainer, savedTab);
        updateSkillPointsDisplay();
        updateDevotionDisplay();
        window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));
        initializeTooltip();
        initializeOSkillsDropdown();
        if (savedTab) updatePlannerUrlTab(selectedClass, savedTab);
    } catch (error) {
        console.error('Error initializing tree page:', error);
    }
}

export function plannerRefreshAfterLevelOptions() {
    updateSkillPointsDisplay();
    void runPlannerSkillStatRecompute({ immediate: true });
    window.dispatchEvent(new CustomEvent('plannerStateChanged', { detail: { source: 'plannerLevelOptions' } }));
}

// Export function to update tab state (called from render module)
export function setCurrentTab(tabName) {
    setCurrentTabState(tabName);
    const classSelect = getClassSelect();
    updatePlannerUrlTab(classSelect ? classSelect.value : '', tabName);
}