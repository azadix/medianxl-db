/**
 * @file Planner DOM display sync (skill grid refresh, pool UI, oSkills tab).
 * @module planner/planner-ui-updates
 */
import { renderSkills } from '@/tree/tree-render.js';
import { getCurrentTab } from '@/tree/tree-render.js';
import Character from '@/character/Character.js';
import {
  recomputeClassDerivedLifeMana,
  onPlannerSkillAllocationChanged,
  getSpentSkillPoints,
  getAllSkillPoints,
  getTotalQuestSkillPoints,
  getEffectivePlannerLevel,
} from '@/character/planner-core.js';
import { getCurrentDevotion, getDevotionDisplayName } from '@/skills/domain/skill-calculations.js';
import { DropdownList } from '@/tree/DropdownList.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { addOSkill } from '@/character/planner-core.js';
import { setPlannerSectionFromLegacy } from '@/planner/planner-section-bridge.js';
import { notifySavedBuildsListRefresh } from '@/planner/saved-builds-storage.js';
import { escapeHtmlText } from '@/shared/utils.js';
import {
  getSkillsList,
  getClassSelect,
  getSkillsContainer,
  getSkillCardUpdateTimer,
  setSkillCardUpdateTimer,
} from './planner-session.js';

export function calculateArmorImageNumber(spentPoints) {
    if (isNaN(spentPoints) || spentPoints < 0) {
        console.warn('calculateArmorImageNumber: Invalid spentPoints, using 0');
        spentPoints = 0;
    }

    const maxSkillPoints = Character.getMaxPossibleSkillPoints();
    const clampedPoints = Math.max(0, Math.min(maxSkillPoints, spentPoints));
    const imageNumber = Math.ceil((clampedPoints / maxSkillPoints) * 10);
    return Math.max(1, Math.min(10, imageNumber));
}

export function updateSkillPointsDisplay() {
    // Update minimum level display (which now includes available skill points)
    updateMinimumLevelDisplay();
}


// Update devotion display (for Paladin and Amazon)
export function updateDevotionDisplay() {
    const devotionField = document.getElementById('devotionField');
    const devotionDisplay = document.getElementById('devotionDisplay');
    const classSelect = getClassSelect();
    const currentClass = classSelect ? classSelect.value : null;
    
    if (!devotionField || !devotionDisplay) return;
    
    // Show for Paladin and Amazon
    if (currentClass === 'Paladin' || currentClass === 'Amazon') {
        const skillLevels = getAllSkillPoints();
        const currentDevotion = getCurrentDevotion(skillLevels);
        const devotionName = getDevotionDisplayName(currentDevotion);

        if (currentDevotion === 'none') {
            devotionField.style.display = 'none';
        } else {
            devotionField.style.display = 'flex';
            devotionDisplay.textContent = devotionName;

            devotionDisplay.className = 'has-text-centered has-text-weight-bold';

            if (currentDevotion === 'holy') {
                devotionDisplay.classList.add('has-text-warning');
            } else if (currentDevotion === 'neutral') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'unholy') {
                devotionDisplay.classList.add('has-text-purple');
            } else if (currentDevotion === 'bow') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'javelin') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'spear') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'storm') {
                devotionDisplay.classList.add('has-text-white');
            } else if (currentDevotion === 'blood') {
                devotionDisplay.classList.add('has-text-white');
            }
        }
    } else {
        devotionField.style.display = 'none';
    }
}

// Update minimum level display
export function updateMinimumLevelDisplay() {
    const minLevelField = document.getElementById('minLevelField');
    const minLevelDisplay = document.getElementById('minLevelDisplay');
    const minLevelSpentPart = document.getElementById('minLevelSpentPart');
    const minLevelAvailPart = document.getElementById('minLevelAvailPart');

    if (!minLevelField || !minLevelDisplay || !minLevelSpentPart || !minLevelAvailPart) return;

    const spentPoints = getSpentSkillPoints();
    // Same level for title and available total: min. level for this build (1 with no skills, else prerequisite level).
    const effectiveLevel = getEffectivePlannerLevel();
    const availableBasePoints = Character.getBaseSkillPoints(effectiveLevel);
    const availableQuestPoints = getTotalQuestSkillPoints(effectiveLevel);
    const totalAvailable = availableBasePoints + availableQuestPoints;

    minLevelDisplay.textContent = `Level ${effectiveLevel}`;

    minLevelSpentPart.textContent = `${spentPoints} spent`;
    minLevelAvailPart.textContent = `${totalAvailable} available`;
    minLevelAvailPart.dataset.poolBase = String(availableBasePoints);
    minLevelAvailPart.dataset.poolQuest = String(availableQuestPoints);
    minLevelAvailPart.dataset.poolLevel = String(effectiveLevel);

    recomputeClassDerivedLifeMana();
}

export function getAllSkillsBonus() {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    return allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
}

export function setAllSkillsBonus(value) {
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    if (allSkillsBonusInput) {
        allSkillsBonusInput.value = Math.max(0, parseInt(value) || 0);
        allSkillsBonusInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

export function getClassSkillsBonus() {
    const classSkillsBonusInput = document.getElementById('classSkillsBonus');
    return classSkillsBonusInput ? Math.max(0, parseInt(classSkillsBonusInput.value) || 0) : 0;
}

export function setClassSkillsBonus(value) {
    const classSkillsBonusInput = document.getElementById('classSkillsBonus');
    if (classSkillsBonusInput) {
        classSkillsBonusInput.value = Math.max(0, parseInt(value) || 0);
        classSkillsBonusInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Update "+# to {Class} Skills" label from the current class select / character.
 * @param {string} [className]
 */
export function updateClassSkillsBonusLabel(className) {
    const label = document.getElementById('classSkillsBonusLabel');
    if (!label) return;
    const classSelect = getClassSelect();
    const name =
        (className != null && String(className).trim() !== '' ? String(className).trim() : null) ||
        (classSelect ? classSelect.value : null) ||
        'Class';
    label.textContent = `+# to ${name} Skills`;
}

export function exportLabelForToast(name) {
    if (name == null) return '(unnamed)';
    const t = String(name).trim();
    return t !== '' ? t : '(unnamed)';
}

export function showSection(sectionName) {
    setPlannerSectionFromLegacy(sectionName);
    if (sectionName === 'load') {
        notifySavedBuildsListRefresh();
    }
}

export function initializeOSkillsDropdown() {
    const sidebarDropdownContainer = document.getElementById('oskill-dropdown');
    const sidebarHiddenInput = document.getElementById('oskill-hidden');

    if (sidebarDropdownContainer) {
        sidebarDropdownContainer.innerHTML = '';
    }

    const store = getFileSkillStore();
    if (!store?.catalog?.length) return;
    const skillItems = [];
    for (const row of store.catalog) {
        if (row?.parentSkillId != null && String(row.parentSkillId).trim() !== '') {
            continue; // do not allow subskills in oSkill dropdown
        }
        const det = store.getSkillDetail(row.id);
        if (!det) continue;
        const description = det.description || '';
        const skillEffect = det.skill_effect || '';
        const className = det.className || store.primaryClassDisplayName(row) || 'Other';
        const tags = Array.isArray(det.tags) ? det.tags.filter(Boolean).map(String) : [];
        skillItems.push({
            value: row.id,
            name: row.displayName,
            skillName: row.id,
            image: det.image,
            className,
            tags,
            searchText: tags.join(' '),
            desc: `${className || 'No Class'}`,
            hasDetails:
                (description && description.trim().length > 0) ||
                (skillEffect && skillEffect.trim().length > 0),
            description,
            skillEffect
        });
    }
    skillItems.sort((a, b) => {
        const c = String(a.className || '').localeCompare(String(b.className || ''));
        if (c !== 0) return c;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (sidebarDropdownContainer && sidebarHiddenInput) {
        const sidebarDropdown = new DropdownList(sidebarDropdownContainer, {
            placeholder: 'Select skill...',
            emptyListText: 'No skills found',
            defaultHeaderText: 'All Skills',
            clearOnSelect: true,
            template: (item) => {
                const name = escapeHtmlText(item?.name || item?.text || '');
                const tags = Array.isArray(item?.tags) ? item.tags : [];
                const pills =
                    tags.length > 0
                        ? `<span class="dropdown-list-item-tags">${tags
                              .map((t) => `<span class="dropdown-list-tag">${escapeHtmlText(t)}</span>`)
                              .join('')}</span>`
                        : '';
                return `<span class="dropdown-list-item-row"><span class="dropdown-list-item-name">${name}</span>${pills}</span>`;
            },
            onSelect: (item) => {
                if (item) {
                    addOSkill(
                        item.value,
                        item.name,
                        item.skillName,
                        item.image,
                        item.className,
                        item.hasDetails,
                        item.description,
                        item.skillEffect
                    );
                }
            }
        });
        sidebarDropdown.setItems(skillItems);
        window.oskillDropdownInstance = sidebarDropdown;
    }
}

export function handleSkillPointsChanged() {
  if (getSkillCardUpdateTimer()) {
    clearTimeout(getSkillCardUpdateTimer());
  }
  setSkillCardUpdateTimer(setTimeout(() => {
    const classSelect = getClassSelect();
    const skillsList = getSkillsList();
    const skillsContainer = getSkillsContainer();
    const currentClass = classSelect.value;
    const savedTab = getCurrentTab();
    renderSkills(currentClass, skillsList, skillsContainer, savedTab, false);
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    onPlannerSkillAllocationChanged();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tooltipRefresh'));
    }, 10);
    setSkillCardUpdateTimer(null);
  }, 50));
}