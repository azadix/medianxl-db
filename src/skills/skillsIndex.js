import {
  sanitizeSkillId,
  getSkillIconHTML,
  expandPlaceholdersWithScaling,
  showSkillDataLoadError,
} from '../../utils.js';
import { getTreeSkillsCache } from '../../character/character-state.js';
import { getCurrentVersion, versionToTreeAssetFolder, initializeVersionSelector } from '../../version-config.js';
import {
  fetchTreeStructJson,
  getTreeLayoutRoot,
  applyTreeStructLayoutToSkills,
  applyTreeStructPrerequisitesToSkills,
} from '../../tree-struct.js';
import {
  initSkillDataStore,
  getFileSkillStore,
  buildTabOrderLookupFromGameMeta,
  tabOrderRankFromLookup
} from '../../tree/skill-data-store.js';
import { buildSkillFromCatalogRow } from '../../tree/tree-data.js';
import Skill from '../../skills/Skill.js';
import { mergeHomeQuery } from './skillsIndexRoute.js';

/** @type {import('vue-router').Router | null} */
let routerRef = null;
let pageTitleEl = null;

/** @returns {HTMLElement | null} */
let getDetailEl = () => null;
/** @type {((skills: unknown[], folder: string | null) => void) | null} */
let setSkillsCatalog = null;
/** @type {((msg: string) => void) | null} */
let setLoadError = null;
/** @type {(() => void) | null} */
let clearLoadError = null;

let skillsList = [];
/** `tree_data` subfolder (e.g. "2_12"); from versionToTreeAssetFolder after JSON load */
let skillIconGameVersionFolder = null;

/** Avoid redundant re-render when router.replace mirrors the current skill detail */
let lastDisplayedSkillKey = null;

/** @type {null | (() => void)} */
let homeSkillDetailFormulaListenersDetach = null;

function detachHomeSkillDetailFormulaListeners() {
  if (homeSkillDetailFormulaListenersDetach) {
    homeSkillDetailFormulaListenersDetach();
    homeSkillDetailFormulaListenersDetach = null;
  }
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (text == null) return '';
  const d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

/** @returns {number | null} */
function readSkillLevelFromRoute() {
  const r = getRouter();
  if (!r) return null;
  const q = r.currentRoute.value.query;
  const raw = q.lvl ?? q.level;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === '') return null;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : null;
}

function detailEl() {
  return getDetailEl();
}

function getRouter() {
  return routerRef;
}

function mergeHomeQueryFromIndex(partial) {
  mergeHomeQuery(getRouter(), partial);
}

function showListView() {
  if (!pageTitleEl) return;
  detachHomeSkillDetailFormulaListeners();
  lastDisplayedSkillKey = null;
  pageTitleEl.textContent = 'All Skills';
  const el = detailEl();
  if (el) el.innerHTML = '';
}

async function displaySkillDetail(skillId) {
  const host = detailEl();
  if (!host || !pageTitleEl) return;

  const sid = String(skillId);
  const maxPreview = Skill.MAX_SKILL_LEVEL;
  const routeLvl = readSkillLevelFromRoute();
  const initialLevel = Math.min(
    maxPreview,
    Math.max(1, routeLvl != null && Number.isFinite(routeLvl) ? routeLvl : 1)
  );
  const displayKey = `${sid}|${initialLevel}`;
  if (lastDisplayedSkillKey === displayKey && host.querySelector('.skill-detail')) {
    return;
  }

  const skillInfo = getSkillData(sid);
  if (!skillInfo) {
    host.innerHTML = `<p>There was an error while loading skill data, or there is no data to load.</p>`;
    return;
  }

  detachHomeSkillDetailFormulaListeners();
  pageTitleEl.textContent = '';

  const skillImage = skillInfo.image
    ? `${getSkillIconHTML(skillInfo.image, skillInfo.class, 'skill-image', skillIconGameVersionFolder)}`
    : '';

  const formulaState = { showFormulas: false };

  const defaultCharacterState = (level) => ({
    level,
    blvl: { [skillInfo.id]: level },
    lvl: { [skillInfo.id]: level },
    treeSkillsCache: getTreeSkillsCache(),
  });

  async function renderDescriptionAtLevel(level, showFormulas) {
    if (!skillInfo.description) return '';
    const expanded = await expandPlaceholdersWithScaling(
      skillInfo.skillId,
      level,
      skillInfo.description,
      skillInfo.id,
      defaultCharacterState(level),
      showFormulas
    );
    return `<p class="is-size-5"><strong>Description</strong></p><div class="content">${expanded}</div>`;
  }

  async function renderSkillEffectBodyAtLevel(level, showFormulas) {
    if (!skillInfo.skillEffect) {
      return '<p class="has-text-grey is-italic mb-0">No skill effect for this skill.</p>';
    }
    const expandedEffect = await expandPlaceholdersWithScaling(
      skillInfo.skillId,
      level,
      skillInfo.skillEffect,
      skillInfo.id,
      defaultCharacterState(level),
      showFormulas
    );
    const lines = expandedEffect.split('\n');
    let html = '';
    lines.forEach((line) => {
      if (line.trim()) {
        html += `<div>${line}</div>`;
      } else {
        html += '<div>&nbsp;</div>';
      }
    });
    return html;
  }

  async function renderRestrictionAtLevel(level, showFormulas) {
    if (!skillInfo.restriction) return '';
    const expandedRestriction = await expandPlaceholdersWithScaling(
      skillInfo.skillId,
      level,
      skillInfo.restriction,
      skillInfo.id,
      defaultCharacterState(level),
      showFormulas
    );
    let html = `<p class="is-size-5"><strong>Restriction</strong></p>`;
    html += expandedRestriction
      .split('\n')
      .map((line) => `<p><span class="has-text-danger">${line}</span></p>`)
      .join('');
    return html;
  }

  function buildMetaHtml() {
    const store = getFileSkillStore();
    const catRow = store?.catalogByInternalId?.get(String(skillInfo.id));

    const sections = [];
    const addSection = (title, bodyInnerHtml) => {
      sections.push(
        `<section class="home-skill-meta-section mb-4"><p class="is-size-5"><strong>${escapeHtml(title)}</strong></p><div class="content">${bodyInnerHtml}</div></section>`
      );
    };

    addSection(
      'Class',
      `<p class="home-skill-meta-value mb-0">${escapeHtml(String(skillInfo.class || '—'))}</p>`
    );
    addSection(
      'Tab',
      `<p class="home-skill-meta-value mb-0">${escapeHtml(String(skillInfo.tabName || '—'))}</p>`
    );
    if (skillInfo.tags && skillInfo.tags.length) {
      addSection(
        'Tags',
        `<p class="home-skill-meta-value mb-0">${escapeHtml(skillInfo.tags.join(', '))}</p>`
      );
    }
    if (catRow?.variants?.length) {
      addSection(
        'Variant count',
        `<p class="home-skill-meta-value mb-0">${escapeHtml(String(catRow.variants.length))}</p>`
      );
    }
    let maxLine = 'Innate (no hard points)';
    if (skillInfo.canAddPoints) {
      maxLine = `Base max: ${skillInfo.baseMaxLevel}`;
      if (skillInfo.affectedBySpecialization) maxLine += ' (affected by Specialization)';
      if (skillInfo.baseMaxLevel === 0) maxLine += ' (raised by other sources)';
    }
    addSection(
      'Hard-point cap',
      `<p class="home-skill-meta-value mb-0">${escapeHtml(maxLine)}</p>`
    );

    for (let i = 1; i <= 6; i++) {
      const v = skillInfo[`calc${i}`];
      if (v && String(v).trim()) {
        addSection(
          `calc${i}`,
          `<pre class="home-skill-meta-calc"><code>${escapeHtml(String(v))}</code></pre>`
        );
      }
    }

    return `<div class="home-skill-meta mt-5">${sections.join('')}</div>`;
  }

  const r = getRouter();
  const q = r ? r.currentRoute.value.query : {};
  const treeClass = q.class != null ? String(q.class) : null;
  const treeTab = q.tab != null ? String(q.tab) : null;
  const filter = q.filter != null ? String(q.filter) : null;

  let backHref;
  if (treeClass || treeTab) {
    backHref = r
      ? r.resolve({ name: 'planner', query: { class: treeClass || '', tab: treeTab || '' } }).href
      : `./planner.html?class=${treeClass || ''}&tab=${treeTab || ''}`;
  } else if (r) {
    backHref = r.resolve({ name: 'home', query: filter ? { filter } : {} }).href;
  } else {
    backHref = filter ? `./?filter=${encodeURIComponent(filter)}` : './';
  }

  const backLabel = treeClass || treeTab ? 'Tree' : 'Skills';
  const backButton = `
        <div class="mb-3">
            <a href="${backHref}" class="button is-light">
                <span class="icon">
                    <i class="fas fa-arrow-left"></i>
                </span>
                <span>Back to ${backLabel}</span>
            </a>
        </div>
    `;

  const metaHtml = buildMetaHtml();

  host.innerHTML = `
        <div class="skill-detail" style="position: relative;">
            ${backButton}
            <h2 class="title is-4 skill-detail-page-name mb-3">${escapeHtml(skillInfo.name)}</h2>
            <p class="is-size-7 has-text-grey mb-3">Hold Ctrl to show raw formulae (same as planner tooltips). Release Ctrl to hide them.</p>
            <div class="columns is-mobile is-multiline">
                <div class="column is-full-mobile is-two-thirds-tablet order-2-mobile">
                    <div class="skill-info">
                        <div class="skill-restriction"></div>
                        <div class="skill-description"></div>
                        <div class="skill-effect-panel mt-4">
                            <p class="is-size-5 mb-3"><strong>Skill effect</strong></p>
                            <div class="field is-grouped is-align-items-center mb-3 skill-effect-level-row">
                                <label class="label mb-0 mr-3" for="skill-level-input">Base level:</label>
                                <div class="control">
                                    <input class="input" type="number" id="skill-level-input" min="1" max="${maxPreview}" value="${initialLevel}" style="max-width: 9rem" />
                                </div>
                            </div>
                            <div class="skill-effect-body content"></div>
                        </div>
                        ${metaHtml}
                    </div>
                </div>
                <div class="column is-full-mobile is-one-third-tablet order-1-mobile">
                    <div class="skill-image-container">
                        ${skillImage}
                    </div>
                </div>
            </div>
        </div>
    `;

  async function refreshTextBodies() {
    const input = /** @type {HTMLInputElement | null} */ (host.querySelector('#skill-level-input'));
    const levelRaw = input ? parseInt(String(input.value), 10) : initialLevel;
    const level = Math.min(maxPreview, Math.max(1, Number.isFinite(levelRaw) ? levelRaw : initialLevel));
    if (input && String(input.value) !== String(level)) {
      input.value = String(level);
    }
    const sf = formulaState.showFormulas;
    const rest = host.querySelector('.skill-restriction');
    const desc = host.querySelector('.skill-description');
    const effBody = host.querySelector('.skill-effect-body');
    if (rest) rest.innerHTML = await renderRestrictionAtLevel(level, sf);
    if (desc) desc.innerHTML = await renderDescriptionAtLevel(level, sf);
    if (effBody) effBody.innerHTML = await renderSkillEffectBodyAtLevel(level, sf);
  }

  await refreshTextBodies();

  mergeHomeQueryFromIndex({
    skill: sid,
    lvl: initialLevel === 1 ? '' : String(initialLevel),
  });

  const cleanupFns = [];

  const onKeyDown = (e) => {
    if (e.key === 'Control' || e.ctrlKey) {
      if (!formulaState.showFormulas) {
        formulaState.showFormulas = true;
        void refreshTextBodies();
      }
    }
  };
  const onKeyUp = (e) => {
    if (e.key === 'Control' || (!e.ctrlKey && formulaState.showFormulas)) {
      formulaState.showFormulas = false;
      void refreshTextBodies();
    }
  };
  const onWinBlur = () => {
    if (formulaState.showFormulas) {
      formulaState.showFormulas = false;
      void refreshTextBodies();
    }
  };
  const onMouseMove = (e) => {
    const now = e.ctrlKey;
    if (now !== formulaState.showFormulas) {
      formulaState.showFormulas = now;
      void refreshTextBodies();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  cleanupFns.push(() => document.removeEventListener('keydown', onKeyDown));
  document.addEventListener('keyup', onKeyUp);
  cleanupFns.push(() => document.removeEventListener('keyup', onKeyUp));
  window.addEventListener('blur', onWinBlur);
  cleanupFns.push(() => window.removeEventListener('blur', onWinBlur));
  document.addEventListener('mousemove', onMouseMove);
  cleanupFns.push(() => document.removeEventListener('mousemove', onMouseMove));

  const levelInput = /** @type {HTMLInputElement | null} */ (host.querySelector('#skill-level-input'));
  if (levelInput) {
    let debounceId = 0;
    const onLevelInput = () => {
      const levelRaw = parseInt(String(levelInput.value), 10);
      const level = Math.min(maxPreview, Math.max(1, Number.isFinite(levelRaw) ? levelRaw : 1));
      mergeHomeQueryFromIndex({ lvl: level === 1 ? '' : String(level) });
      lastDisplayedSkillKey = `${sid}|${level}`;
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        debounceId = 0;
        void refreshTextBodies();
      }, 100);
    };
    levelInput.addEventListener('input', onLevelInput);
    levelInput.addEventListener('change', onLevelInput);
    cleanupFns.push(() => levelInput.removeEventListener('input', onLevelInput));
    cleanupFns.push(() => levelInput.removeEventListener('change', onLevelInput));
  }

  homeSkillDetailFormulaListenersDetach = () => {
    for (const fn of cleanupFns) {
      fn();
    }
    cleanupFns.length = 0;
  };

  lastDisplayedSkillKey = `${sid}|${initialLevel}`;
}

async function loadSkillsFromTreeDataPage() {
  try {
    await initSkillDataStore({ major: 2, minor: 12 });
    const store = getFileSkillStore();
    skillIconGameVersionFolder = versionToTreeAssetFolder(getCurrentVersion());

    const loadedSkills = [];
    for (const row of store.catalog) {
      const sk = buildSkillFromCatalogRow(store, row);
      if (sk) loadedSkills.push(sk);
    }
    const cur = getCurrentVersion();
    const treeStruct = await fetchTreeStructJson(cur.major, cur.minor);
    const layoutRoot = getTreeLayoutRoot(treeStruct);
    if (layoutRoot) {
      applyTreeStructLayoutToSkills(loadedSkills, layoutRoot);
      applyTreeStructPrerequisitesToSkills(loadedSkills, layoutRoot);
    }
    const tabOrderLookup = buildTabOrderLookupFromGameMeta(store.gameMeta);
    loadedSkills.sort((a, b) => {
      const c = String(a.class || '').localeCompare(String(b.class || ''));
      if (c !== 0) return c;
      const ta = tabOrderRankFromLookup(a, tabOrderLookup);
      const tb = tabOrderRankFromLookup(b, tabOrderLookup);
      if (ta !== tb) return ta - tb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    skillsList = loadedSkills;
    setSkillsCatalog?.(loadedSkills, skillIconGameVersionFolder);
    clearLoadError?.();

    const versionSelector = document.getElementById('version-selector');
    if (versionSelector) {
      versionSelector.innerHTML = '';
      await initializeVersionSelector(versionSelector);
    }
  } catch (error) {
    console.error('Error loading skills from tree_data:', error);
    skillsList = [];
    setSkillsCatalog?.([], null);
    if (setLoadError) {
      setLoadError(error.message);
    } else {
      showSkillDataLoadError(error.message, null);
    }
  }
}

function getSkillData(skillId) {
  const raw = String(skillId).trim();
  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && String(asNum) === raw) {
    const byNum = skillsList.find((s) => s.skillId === asNum);
    if (byNum) return byNum;
  }
  const safe = sanitizeSkillId(raw);
  return skillsList.find((s) => s.id === safe || s.id === raw);
}

async function initializePage() {
  await loadSkillsFromTreeDataPage();

  const r = getRouter();
  const rawSkill = r?.currentRoute.value.query.skill;
  const skillFromRoute = Array.isArray(rawSkill) ? rawSkill[0] : rawSkill;
  if (skillFromRoute) {
    const skillInfo = getSkillData(String(skillFromRoute));
    if (skillInfo) {
      await displaySkillDetail(String(skillFromRoute));
    } else {
      mergeHomeQuery(getRouter(), { skill: '' });
      showListView();
    }
  } else {
    showListView();
  }
}

/**
 * @param {{
 *   router: import('vue-router').Router,
 *   pageTitleEl: HTMLElement,
 *   getDetailEl: () => HTMLElement | null,
 *   setSkillsCatalog?: (skills: unknown[], folder: string | null) => void,
 *   setLoadError?: (msg: string) => void,
 *   clearLoadError?: () => void,
 * }} opts
 */
export function mountSkillsIndex(opts) {
  routerRef = opts.router;
  pageTitleEl = opts.pageTitleEl;
  getDetailEl = typeof opts.getDetailEl === 'function' ? opts.getDetailEl : () => null;
  setSkillsCatalog = opts.setSkillsCatalog ?? null;
  setLoadError = opts.setLoadError ?? null;
  clearLoadError = opts.clearLoadError ?? null;

  void initializePage();
}

export function unmountSkillsIndex() {
  detachHomeSkillDetailFormulaListeners();
  routerRef = null;
  pageTitleEl = null;
  getDetailEl = () => null;
  setSkillsCatalog = null;
  setLoadError = null;
  clearLoadError = null;
  skillsList = [];
  skillIconGameVersionFolder = null;
  lastDisplayedSkillKey = null;
}

/**
 * @param {import('vue-router').Router} router
 */
export async function syncSkillsIndexFromRoute(router) {
  routerRef = router;
  if (!pageTitleEl) return;

  const route = router.currentRoute.value;
  if (route.name !== 'home') return;

  const rawSkill = route.query.skill;
  const skillParam = Array.isArray(rawSkill) ? rawSkill[0] : rawSkill;

  if (skillParam) {
    const host = detailEl();
    const routeLvl = readSkillLevelFromRoute();
    const previewLevel = Math.min(
      Skill.MAX_SKILL_LEVEL,
      Math.max(1, routeLvl != null && Number.isFinite(routeLvl) ? routeLvl : 1)
    );
    const routeKey = `${String(skillParam)}|${previewLevel}`;
    if (lastDisplayedSkillKey === routeKey && host && host.querySelector('.skill-detail')) {
      return;
    }
    const skillInfo = getSkillData(String(skillParam));
    if (skillInfo) {
      await displaySkillDetail(String(skillParam));
    } else {
      mergeHomeQuery(router, { skill: '' });
      showListView();
    }
    return;
  }

  if (skillsList.length > 0) {
    showListView();
  } else {
    await loadSkillsFromTreeDataPage();
  }
}
