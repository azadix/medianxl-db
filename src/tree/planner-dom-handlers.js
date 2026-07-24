/**
 * @file Planner DOM handlers: displays, menus, modals, oSkill dropdown.
 * @module tree/planner-dom-handlers
 */
import { renderSkills } from './tree-render.js';
import { setBuildUrlParam } from '@/planner/tree-url-sync.js';
import Character from '@/character/Character.js';
import {
  initializeCharacter,
  applyClassBaselineStatsToCharacter,
  clearOSkills,
} from '@/character/character-state.js';
import { refreshPlannerStatsPanelFromCharacter } from '@/character/planner-stats-panel.js';
import { clearSkillVariants, applySkillVariantDefaultsForClass } from './skill-variants.js';
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
  updateSkillPointsDisplay,
  updateDevotionDisplay,
} from './planner-ui-updates.js';
import {
  sanitizeBuildNameForExportStorage,
  getCurrentBuildNamePrefill,
  promptAndImportBuild,
  validateBuildBeforeSave,
  updateCurrentBuild,
  saveBuild,
  buildCurrentBuildSnapshot,
  exportBuildJsonString,
  fallbackCopyToClipboard,
} from './saved-builds-ui.js';
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

export async function plannerMenuImportBuild() {
    if (!isTreeInitialized()) {
        await main();
    }
    promptAndImportBuild();
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
    if (confirm('Are you sure you want to reset this build? All skill points will be lost.')) {
        resetBuild();
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
        secondaryAction,
    } = opts;

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
    input.value = getCurrentBuildNamePrefill();
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
    const btnSecondary = secondaryAction ? document.createElement('button') : null;
    if (btnSecondary) {
        btnSecondary.className = secondaryAction.className;
        btnSecondary.type = 'button';
        btnSecondary.innerHTML = `<span class="icon"><i class="fa-solid ${secondaryAction.iconClass}"></i></span><span>${secondaryAction.text}</span>`;
    }
    const btnCancel = document.createElement('button');
    btnCancel.className = 'button';
    btnCancel.type = 'button';
    btnCancel.textContent = 'Cancel';
    foot.appendChild(btnPrimary);
    if (btnSecondary) {
        foot.appendChild(btnSecondary);
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

    if (btnSecondary) {
        btnSecondary.addEventListener('click', () => {
            const name = sanitizeBuildNameForExportStorage(input.value);
            secondaryAction.onClick(name, closeModal);
        });
    }

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
        subtitle: 'Copy a JSON backup or create a shareable planner link.',
        iconClass: 'fa-arrow-up-from-bracket',
        helpText: 'Stored inside the exported build. Empty names become "Unnamed Build".',
        primaryText: 'Export JSON',
        primaryIconClass: 'fa-copy',
        onConfirm: opts.onConfirm,
        secondaryAction: {
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

export function resetBuild(showToast = true) {
    const classSelect = getClassSelect();
    const skillsList = getSkillsList();
    const skillsContainer = getSkillsContainer();
    // Reset to first class
    if (classSelect && skillsList) {
        const classes = [...new Set(skillsList.map(skill => skill.class))];
        if (classes.length > 0) {
            classSelect.value = classes[0];
        }
    }
    
    // Clear all skill points and reset quest completion to defaults
    const currentClass = classSelect ? classSelect.value : null;
    initializeCharacter(currentClass, Character.DEFAULT_LEVEL);
    applyClassBaselineStatsToCharacter(currentClass);

    refreshPlannerStatsPanelFromCharacter();
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { reset: true } }));
    setAllSkillsBonus(0);

    clearSkillVariants();
    applySkillVariantDefaultsForClass(currentClass);
    
    if (currentClass && skillsList) {
        renderSkills(currentClass, skillsList, skillsContainer);
    }

    window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsRefresh'));
    
    // Clear current build index (this is a new build)
    setCurrentBuildIndex(null);
    setCurrentBuildDisplayName('');

    // Clear oSkills
    clearOSkills();
    
    // Reset oSkills dropdown input
    const oskillDropdown = document.querySelector('#oskill-dropdown .dropdown-list-input');
    if (oskillDropdown) {
        oskillDropdown.value = '';
    }
    
    // Clear any filtered dropdown results
    if (window.oskillDropdownInstance) {
        window.oskillDropdownInstance.renderItems(); // Re-render all items
    }
    
    // Update displays
    updateSkillPointsDisplay();
    updateDevotionDisplay();
    
    // Show toast notification if requested
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
                    <li><strong>Ctrl + Hover:</strong> Hold Ctrl and hover over a skill to see the raw formula instead of the calculated value</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Stat Colors</h4>
                <p>Stat values in skill tooltips are color-coded to indicate their type:</p>
                <ul>
                    <li><span class="has-text-white">Constant</span> - stat value that does not change with levels</li>
                    <li><span class="has-text-danger">Unknown</span> - stat value cannot be determined</li>
                    <li><span class="has-text-info">Function</span> - stat value is calculated from a formula or function</li>
                    <li><span class="has-text-success">Skill</span> - other skill is being referenced eg. Earthquake, Shadow Refuge</li>
                    <li><span class="has-text-warning">Subskill</span> - subskill is being referenced eg. Demon Blood Aura, Grim Vision</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Tips</h4>
                <ul>
                    <li>Hover over skill cards to see detailed tooltips with scaling values</li>
                    <li>Use the "+# to All Skills" input to apply bonuses to all skills</li>
                    <li>Arrows between skills show prerequisite relationships</li>
                    <li>Skills that are maxed out are highlighted in yellow</li>
                    <li>Use "Load build" to open the saved-builds list; use Export (next to Save) on the planner toolbar to open a dialog where you set the build name stored in the JSON (default Unnamed Build if you leave the name empty)</li>
                </ul>
                <h4 class="title is-5 mb-3 mt-5">Character Stats</h4>
                <p>The sidebar lists core attributes as numeric fields. Extra stats appear when a skill formula references them.</p>
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
