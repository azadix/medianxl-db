/**
 * @file Planner DOM handlers: displays, menus, modals, oSkill dropdown.
 * @module planner/planner-dom-handlers
 */
import { renderSkills, getCurrentTab } from '@/tree/tree-render.js';
import { setBuildUrlParam, updatePlannerUrlTab } from '@/planner/tree-url-sync.js';
import Character from '@/character/Character.js';
import {
  initializeCharacter,
  applyClassBaselineStatsToCharacter,
  clearOSkills,
  runPlannerSkillStatRecompute,
} from '@/character/planner-core.js';
import { useItemsStore } from '@/stores/items.js';
import { refreshPlannerStatsPanelFromCharacter } from '@/character/planner-stats-panel.js';
import { clearSkillVariants, applySkillVariantDefaultsForClass } from '@/tree/skill-variants.js';
import { compressBuildToUrlParam } from '@/planner/build-url-codec.js';
import {
  getSavedBuilds,
  setSavedBuilds,
  notifySavedBuildsListRefresh,
} from '@/planner/saved-builds-storage.js';
import {
  toastManager,
  getSkillsList,
  getClassSelect,
  getSkillsContainer,
  isTreeInitialized,
  getCurrentBuildIndex,
  setCurrentBuildIndex,
  setCurrentBuildDisplayName,
} from './planner-session.js';
import {
  exportLabelForToast,
  showSection,
  setAllSkillsBonus,
  setClassSkillsBonus,
  updateClassSkillsBonusLabel,
  updateSkillPointsDisplay,
  updateDevotionDisplay,
} from './planner-ui-updates.js';
import {
  sanitizeBuildNameForExportStorage,
  getCurrentBuildNamePrefill,
  importBuildFromJsonText,
  importBuildFromJsonFile,
  readBuildJsonFileText,
  validateBuildBeforeSave,
  updateCurrentBuild,
  saveBuild,
  buildCurrentBuildSnapshot,
  exportBuildJsonString,
  downloadCurrentBuildAsJson,
  fallbackCopyToClipboard,
} from './saved-builds-ui.js';
import { readPastebinBuildText } from './build-file-io.js';
import { main } from './planner-init.js';

export async function plannerMenuNewBuild() {
    showSection('tree');
    if (!isTreeInitialized()) {
        console.error('Skill data not initialized. Cannot create new build.');
        return;
    }
    setCurrentBuildIndex(null);
    setCurrentBuildDisplayName('');
    await main();
}

export async function plannerMenuOpenLoadSection() {
    if (!isTreeInitialized()) {
        await main();
    }
    showSection('load');
}

/**
 * Ensure tree data is ready before showing the import modal.
 */
export async function plannerMenuPrepareImport() {
    if (!isTreeInitialized()) {
        await main();
    }
}

/**
 * Import pasted/loaded JSON text from the import modal.
 * @param {string} jsonString
 * @returns {Promise<boolean>}
 */
export async function plannerMenuImportBuildFromText(jsonString) {
    if (!isTreeInitialized()) {
        await main();
    }
    return importBuildFromJsonText(jsonString);
}

/**
 * Read a JSON file for the import modal textarea (does not import yet).
 * @param {File} file
 * @returns {Promise<string|null>}
 */
export async function plannerMenuReadBuildJsonFile(file) {
    return readBuildJsonFileText(file);
}

/**
 * Read build JSON from a Pastebin URL.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export async function plannerMenuReadPastebinBuild(url) {
    try {
        return await readPastebinBuildText(url);
    } catch (error) {
        toastManager.showToast(`Could not load Pastebin: ${error.message}`, false, 'danger');
        return null;
    }
}

/**
 * Ensure tree is ready, then import a build from a JSON File.
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function plannerMenuImportBuildFromFile(file) {
    if (!isTreeInitialized()) {
        await main();
    }
    return importBuildFromJsonFile(file);
}

export function plannerMenuOpenHelp() {
    showHelpModal();
}

export function plannerBackToMenuFromTree() {
    toastManager.cleanUpToastMessages();
    window.history.replaceState({}, '', window.location.pathname);
    showSection('menu');
}

export function plannerBackToMenuFromLoad() {
    window.history.replaceState({}, '', window.location.pathname);
    showSection('menu');
}

export function plannerResetBuildClick() {
    if (confirm('Are you sure you want to reset this build? All skill points and items will be lost.')) {
        resetBuild();
    }
}

export function plannerResetTreeClick() {
    if (confirm('Are you sure you want to reset this build? All skill points will be lost.')) {
        resetTree();
    }
}

export function plannerResetItemsClick() {
    if (confirm('Are you sure you want to reset items? All equipped items, inventory, charms, and relics will be lost.')) {
        resetPlannerItems();
        toastManager.showToast('Items reset successfully!', true, 'info');
    }
}

export function plannerSaveBuildClick() {
    if (!validateBuildBeforeSave()) {
        return;
    }
    if (getCurrentBuildIndex() !== null) {
        updateCurrentBuild();
    } else {
        promptAndSaveBuild();
    }
}

export function plannerSaveAsBuildClick() {
    promptAndSaveBuild();
}

export function promptAndSaveBuild() {
    if (!validateBuildBeforeSave()) {
        return;
    }
    showBuildNameModal({
        title: 'Save build',
        titleId: 'saveBuildModalTitle',
        subtitle: 'Save this planner state as a new build.',
        iconClass: 'fa-floppy-disk',
        helpText: 'Leave empty to save as "Unnamed Build".',
        primaryText: 'Save build',
        primaryIconClass: 'fa-check',
        onConfirm: saveBuild,
    });
}

export function showBuildNameModal(opts) {
    const {
        title: modalTitle,
        titleId,
        subtitle: modalSubtitle,
        iconClass,
        helpText,
        primaryText,
        primaryIconClass,
        onConfirm,
        initialName,
        secondaryAction,
        secondaryActions,
    } = opts;

    /** @type {{ text: string, iconClass: string, className: string, onClick: (name: string, closeModal: () => void) => void }[]} */
    const extraActions = Array.isArray(secondaryActions)
        ? secondaryActions
        : secondaryAction
          ? [secondaryAction]
          : [];

    const overlay = document.createElement('div');
    overlay.className = 'modal is-active planner-export-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', titleId);

    const modalBackground = document.createElement('div');
    modalBackground.className = 'modal-background';

    const card = document.createElement('div');
    card.className = 'modal-card planner-export-modal__card';

    const head = document.createElement('header');
    head.className = 'modal-card-head planner-export-modal__head p-4';
    const headerIcon = document.createElement('span');
    headerIcon.className = 'icon planner-export-modal__icon';
    headerIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    head.appendChild(headerIcon);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'planner-export-modal__title';
    const title = document.createElement('p');
    title.id = titleId;
    title.className = 'modal-card-title mb-0';
    title.textContent = modalTitle;
    const subtitle = document.createElement('p');
    subtitle.className = 'is-size-7 has-text-grey-light mb-0';
    subtitle.textContent = modalSubtitle;
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    head.appendChild(titleWrap);

    const btnClose = document.createElement('button');
    btnClose.className = 'delete';
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', 'Close');
    head.appendChild(btnClose);

    const body = document.createElement('section');
    body.className = 'modal-card-body planner-export-modal__body p-4';

    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.className = 'label';
    label.htmlFor = 'exportBuildNameInput';
    label.textContent = 'Build name';
    field.appendChild(label);

    const control = document.createElement('div');
    control.className = 'control has-icons-left';
    const input = document.createElement('input');
    input.id = 'exportBuildNameInput';
    input.className = 'input';
    input.type = 'text';
    input.setAttribute('placeholder', 'Unnamed Build');
    input.setAttribute('autocomplete', 'off');
    input.value = initialName ?? getCurrentBuildNamePrefill();
    control.appendChild(input);

    const inputIcon = document.createElement('span');
    inputIcon.className = 'icon is-small is-left';
    inputIcon.innerHTML = '<i class="fa-solid fa-signature"></i>';
    control.appendChild(inputIcon);
    field.appendChild(control);

    const help = document.createElement('p');
    help.className = 'help';
    help.textContent = helpText;
    field.appendChild(help);
    body.appendChild(field);

    const foot = document.createElement('footer');
    foot.className = 'modal-card-foot planner-export-modal__foot p-4';
    const btnPrimary = document.createElement('button');
    btnPrimary.className = 'button is-primary is-inverted is-outlined';
    btnPrimary.type = 'button';
    btnPrimary.innerHTML = `<span class="icon"><i class="fa-solid ${primaryIconClass}"></i></span><span>${primaryText}</span>`;

    /** @type {HTMLButtonElement[]} */
    const extraButtons = extraActions.map((action) => {
        const btn = document.createElement('button');
        btn.className = action.className;
        btn.type = 'button';
        btn.innerHTML = `<span class="icon"><i class="fa-solid ${action.iconClass}"></i></span><span>${action.text}</span>`;
        return btn;
    });

    const btnCancel = document.createElement('button');
    btnCancel.className = 'button';
    btnCancel.type = 'button';
    btnCancel.textContent = 'Cancel';
    foot.appendChild(btnPrimary);
    for (const btn of extraButtons) {
        foot.appendChild(btn);
    }
    foot.appendChild(btnCancel);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);

    overlay.appendChild(modalBackground);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const closeModal = () => {
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener('keydown', handleEscape);
    };

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleEscape);

    modalBackground.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    const submit = () => {
        const name = sanitizeBuildNameForExportStorage(input.value);
        closeModal();
        onConfirm(name);
    };

    extraButtons.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            const name = sanitizeBuildNameForExportStorage(input.value);
            extraActions[i].onClick(name, closeModal);
        });
    });

    btnPrimary.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });

    setTimeout(() => input.focus(), 0);
}

/**
 * Modal to set build name before toolbar export (no native prompt/confirm).
 * @param {{ onConfirm: (name: string) => void }} opts
 */
export function showExportBuildNameModal(opts) {
    showBuildNameModal({
        title: 'Export build',
        titleId: 'exportBuildModalTitle',
        subtitle: 'Copy JSON, save a file, or create a shareable planner link.',
        iconClass: 'fa-arrow-up-from-bracket',
        helpText: 'Stored inside the exported build. Empty names become "Unnamed Build".',
        primaryText: 'Export JSON',
        primaryIconClass: 'fa-copy',
        onConfirm: opts.onConfirm,
        secondaryActions: [
            {
                text: 'Save as file',
                iconClass: 'fa-download',
                className: 'button is-link is-outlined',
                onClick(name, closeModal) {
                    closeModal();
                    downloadCurrentBuildAsJson(name);
                },
            },
            {
                text: 'Share link',
                iconClass: 'fa-link',
                className: 'button is-info is-outlined',
                async onClick(name, closeModal) {
                    closeModal();
                    const snap = buildCurrentBuildSnapshot(name);
                    const encoded = await compressBuildToUrlParam(JSON.stringify(snap));
                    setBuildUrlParam(encoded);
                    const shareUrl = window.location.href;
                    if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(shareUrl)
                            .then(() => toastManager.showToast('Share link copied to clipboard!', true, 'success'))
                            .catch(() => fallbackCopyToClipboard(shareUrl, 'share link'));
                    } else {
                        fallbackCopyToClipboard(shareUrl, 'share link');
                    }
                },
            },
        ],
    });
}

export function plannerExportBuildClick() {
    if (!validateBuildBeforeSave()) {
        return;
    }
    showExportBuildNameModal({
        onConfirm(name) {
            const snap = buildCurrentBuildSnapshot(name);
            exportBuildJsonString(JSON.stringify(snap), exportLabelForToast(name));
        },
    });
}

function renameCurrentBuild(name) {
    setCurrentBuildDisplayName(name);

    const builds = getSavedBuilds();
    if (getCurrentBuildIndex() !== null && getCurrentBuildIndex() >= 0 && getCurrentBuildIndex() < builds.length) {
        const ref = builds[getCurrentBuildIndex()];
        ref.name = name;
        setSavedBuilds(builds);
        setCurrentBuildIndex(builds.indexOf(ref));
        notifySavedBuildsListRefresh();
    }

    toastManager.showToast(`Build renamed to "${exportLabelForToast(name)}".`, true, 'info');
}

export function plannerRenameBuildClick() {
    showBuildNameModal({
        title: 'Rename build',
        titleId: 'renameBuildModalTitle',
        subtitle: 'Update the name shown in the planner header.',
        iconClass: 'fa-pen-to-square',
        helpText: 'Used for the current planner build. Empty names become "Unnamed Build".',
        primaryText: 'Rename build',
        primaryIconClass: 'fa-check',
        onConfirm: renameCurrentBuild,
    });
}

export function resetPlannerItems() {
    useItemsStore().resetItems();
    runPlannerSkillStatRecompute({ immediate: true });
}

export function resetTree(showToast = true) {
    const classSelect = getClassSelect();
    const skillsList = getSkillsList();
    const skillsContainer = getSkillsContainer();

    // Clear all skill points and reset quest completion to defaults; keep selected class
    const currentClass = classSelect ? classSelect.value : null;
    initializeCharacter(currentClass, Character.DEFAULT_LEVEL);
    applyClassBaselineStatsToCharacter(currentClass);

    refreshPlannerStatsPanelFromCharacter();
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { reset: true } }));
    setAllSkillsBonus(0);
    setClassSkillsBonus(0);
    updateClassSkillsBonusLabel(currentClass);

    clearSkillVariants();
    applySkillVariantDefaultsForClass(currentClass);

    const savedTab = getCurrentTab();
    if (currentClass && skillsList) {
        renderSkills(currentClass, skillsList, skillsContainer, savedTab);
    }

    if (currentClass) {
        updatePlannerUrlTab(currentClass, savedTab);
    }

    window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));

    // Clear oSkills
    clearOSkills();

    if (window.oskillDropdownInstance) {
        window.oskillDropdownInstance.clearSearch();
    }

    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();

    if (showToast) {
        toastManager.showToast('Skill tree reset successfully!', true, 'info');
    }
}

export function resetBuild(showToast = true) {
    useItemsStore().resetItems();
    resetTree(false);
    runPlannerSkillStatRecompute({ immediate: true });

    if (showToast) {
        toastManager.showToast('Build reset successfully!', true, 'info');
    }
}

function showHelpModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal is-active planner-export-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'plannerHelpModalTitle');

    const modalBackground = document.createElement('div');
    modalBackground.className = 'modal-background';

    const modal = document.createElement('div');
    modal.className = 'modal-card planner-export-modal__card planner-export-modal__card--wide';
    modal.style.maxHeight = '80vh';
    modal.innerHTML = `
        <header class="modal-card-head planner-export-modal__head p-4">
            <span class="icon planner-export-modal__icon"><i class="fa-solid fa-circle-question"></i></span>
            <div class="planner-export-modal__title">
                <p id="plannerHelpModalTitle" class="modal-card-title mb-0">Planner Help</p>
                <p class="is-size-7 has-text-grey-light mb-0">Shortcuts, stat colors, and planner tips.</p>
            </div>
            <button type="button" class="delete" id="closeHelpModalX" aria-label="Close"></button>
        </header>
        <section class="modal-card-body planner-export-modal__body p-4" style="overflow-y: auto;">
            <div class="content">
                <h4 class="title is-5 mb-3">Keyboard Shortcuts</h4>
                <ul>
                    <li><strong>Click:</strong> Add or remove 1 skill point</li>
                    <li><strong>Shift + Click:</strong> Add or remove 25 skill points at once</li>
                    <li><strong>Ctrl + Hover:</strong> Hold Ctrl on a skill tooltip to see raw formulas</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Stat Colors</h4>
                <p>Numbers in skill descriptions are color-coded by type:</p>
                <ul>
                    <li><span class="has-text-white">Constant</span> - value that does not change with levels</li>
                    <li><span class="has-text-primary">Scaling</span> - value that changes with skill level</li>
                    <li><span class="has-text-info">Function</span> - value calculated from a formula</li>
                    <li><span class="has-text-danger">Unknown</span> - value cannot be determined</li>
                    <li><span class="has-text-success">Skill</span> - other skill name, e.g. Earthquake, Shadow Refuge</li>
                    <li><span class="has-text-warning">Subskill</span> - inline subskill block, e.g. Demon Blood Aura, Grim Vision</li>
                </ul>
                <p class="mt-3">Skill tooltips include a <strong>SOURCES</strong> panel for level bonuses:</p>
                <ul>
                    <li><span class="has-text-white">Base</span> - points spent on the skill (0 for item-granted oSkills)</li>
                    <li><span class="has-text-info">All skills</span> - "+# to All Skills" (also applies to oSkills)</li>
                    <li><span class="skill-bonus-class">Class skills</span> - "+# to Class Skills" (class tree only, not oSkills)</li>
                    <li><span class="skill-bonus-item">Item</span> - oSkill grants from charms (and later equipped items)</li>
                    <li><span class="skill-bonus-relic">Relic</span> - skill bonuses from enabled relics, including oSkill grants</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Tips</h4>
                <ul>
                    <li>Hover over skill cards to see detailed tooltips with scaling values</li>
                    <li>Set skill bonuses on the Overview tab. Matching colors appear in tooltips and on the bonus labels</li>
                    <li>Arrows between skills show prerequisite relationships</li>
                    <li>Skills that are maxed out are highlighted in yellow</li>
                    <li>Use "Load build" to open the saved-builds list; use Export (next to Save) on the planner toolbar to open a dialog where you set the build name stored in the JSON (default Unnamed Build if you leave the name empty)</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Character Stats</h4>
                <p>Open the <strong>Stats</strong> tab for the character sheet.</p>
                <ul>
                    <li><strong>Life</strong> and <strong>Mana</strong> at the top are read-only. They come from class, level, vitality/energy, allocated skills, and quests. Hover them for a breakdown.</li>
                    <li>Strength, dexterity, vitality, and energy start at class baseline and can be edited. Hover any row for sources (baseline, manual edits, skills).</li>
                    <li>Other stats appear when they are always shown, referenced by allocated skills, or changed from default. Filter chips (Attributes, Resists, Damage, Defense, Minions, Misc) narrow the list.</li>
                    <li>Grey rows are inactive until you enable the matching toggle on the <strong>Config</strong> tab (skill states, curses, area effects). Hover still shows the unused skill bonus.</li>
                </ul>
                <p>Quest rewards that grant life or skill points are on the <strong>Quests</strong> tab. Skill bonuses (+# to all / class skills) stay on <strong>Overview</strong>.</p>
            </div>
        </section>
        <footer class="modal-card-foot planner-export-modal__foot p-4">
            <button class="button is-primary is-inverted is-outlined" id="closeHelpModalBtn" type="button">
                <span class="icon"><i class="fa-solid fa-check"></i></span>
                <span>Close</span>
            </button>
        </footer>
    `;
    overlay.appendChild(modalBackground);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const closeModal = () => {
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener('keydown', handleEscape);
    };
    modal.querySelector('#closeHelpModalBtn').addEventListener('click', closeModal);
    modal.querySelector('#closeHelpModalX').addEventListener('click', closeModal);
    modalBackground.addEventListener('click', closeModal);
    const handleEscape = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleEscape);
}
