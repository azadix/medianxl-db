import {
  sanitizeSkillId,
  getSkillIconHTML,
  expandPlaceholdersWithScaling,
  showSkillDataLoadError,
} from '../shared/utils.js';
import { getTreeSkillsCache } from '../../character/character-state.js';
import { getCurrentVersion, versionToTreeAssetFolder, initializeVersionSelector } from '../shared/version-config.js';
import {
  fetchTreeStructJson,
  getTreeLayoutRoot,
  applyTreeStructLayoutToSkills,
  applyTreeStructPrerequisitesToSkills,
} from '../shared/tree-struct.js';
import {
  initSkillDataStore,
  getFileSkillStore,
  buildTabOrderLookupFromGameMeta,
  tabOrderRankFromLookup
} from '../../tree/skill-data-store.js';
import { buildSkillFromCatalogRow } from '../../tree/tree-data.js';
import Skill from './domain/Skill.js';
import {
  mergeHomeQuery,
  SKILLS_ROUTE_NAME,
  readQueryStringArray,
  readClassTagJoinFromQuery,
} from './skillsIndexRoute.js';

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
  const skillTags = Array.isArray(skillInfo.tags) ? skillInfo.tags.filter(Boolean) : [];

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
    return `<span class="planner-card__eyebrow">Description</span><div class="content skill-detail-copy">${expanded}</div>`;
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
    let html = `<span class="planner-card__eyebrow">Restriction</span>`;
    html += expandedRestriction
      .split('\n')
      .map((line) => `<p><span class="has-text-danger">${line}</span></p>`)
      .join('');
    return html;
  }

  function buildInfoBoxRowsHtml() {
    const store = getFileSkillStore();
    const catRow = store?.catalogByInternalId?.get(String(skillInfo.id));

    const rows = [
      ['Class', skillInfo.class || 'None'],
      ['Tab', skillInfo.tabName || 'None'],
    ];
    if (skillTags.length) rows.push(['Tags', skillTags.join(', ')]);
    if (catRow?.variants?.length) {
      rows.push(['Variants', String(catRow.variants.length)]);
    }

    return rows
      .map(
        ([label, value]) => `
          <div class="skill-detail-info-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `
      )
      .join('');
  }

  function buildCalcBlocksHtml() {
    const blocks = [];

    for (let i = 1; i <= 6; i++) {
      const v = skillInfo[`calc${i}`];
      if (v && String(v).trim()) {
        blocks.push(
          `<section class="home-skill-meta-section">
            <span class="planner-card__eyebrow">calc${i}</span>
            <pre class="home-skill-meta-calc"><code>${escapeHtml(String(v))}</code></pre>
          </section>`
        );
      }
    }

    if (blocks.length === 0) return '';
    return `<div class="home-skill-meta">${blocks.join('')}</div>`;
  }

  const r = getRouter();
  const q = r ? r.currentRoute.value.query : {};
  const treeClass = q.class != null ? String(q.class) : null;
  const treeTab = q.tab != null ? String(q.tab) : null;
  const filter = q.filter != null ? String(q.filter) : null;
  const browseClasses = readQueryStringArray(q, 'classes');
  const browseTags = readQueryStringArray(q, 'tags');
  const classTagJoin = readClassTagJoinFromQuery(q);

  let backHref;
  if (treeClass || treeTab) {
    backHref = r
      ? r.resolve({ name: 'planner', query: { class: treeClass || '', tab: treeTab || '' } }).href
      : `./?class=${encodeURIComponent(treeClass || '')}&tab=${encodeURIComponent(treeTab || '')}`;
  } else if (r) {
    /** @type {Record<string, string | string[]>} */
    const backQuery = {};
    if (filter && filter !== 'all') backQuery.filter = filter;
    if (browseClasses.length) backQuery.classes = browseClasses;
    if (browseTags.length) backQuery.tags = browseTags;
    if (classTagJoin === 'or') backQuery.filterLogic = 'or';
    backHref = r.resolve({ name: SKILLS_ROUTE_NAME, query: backQuery }).href;
  } else {
    const sp = new URLSearchParams();
    if (filter && filter !== 'all') sp.set('filter', filter);
    for (const c of browseClasses) sp.append('classes', c);
    for (const t of browseTags) sp.append('tags', t);
    if (classTagJoin === 'or') sp.set('filterLogic', 'or');
    const qs = sp.toString();
    const base = String(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '') || '';
    const path = `${base}/skills`;
    backHref = qs ? `${path}?${qs}` : path;
  }

  const backLabel = treeClass || treeTab ? 'Tree' : 'Skills';
  const backButton = `
        <div class="skill-detail-toolbar">
            <a href="${escapeHtml(backHref)}" class="button is-light is-outlined">
                <span class="icon">
                    <i class="fas fa-arrow-left"></i>
                </span>
                <span>Back to ${escapeHtml(backLabel)}</span>
            </a>
        </div>
    `;

  const infoRowsHtml = buildInfoBoxRowsHtml();
  const calcBlocksHtml = buildCalcBlocksHtml();
  const restrictionHtml = skillInfo.restriction
    ? '<section class="planner-card skill-restriction"></section>'
    : '';
  const descriptionHtml = skillInfo.description
    ? '<section class="planner-card skill-description"></section>'
    : '';

  host.innerHTML = `
        <div class="skill-detail skill-detail-page">
            ${backButton}
            <div class="skill-detail-shell">
                <main class="skill-detail-main order-2-mobile">
                    <section class="skill-detail-hero planner-card">
                        <span class="planner-card__eyebrow">Skill</span>
                        <h2 class="title is-3 skill-detail-page-name">${escapeHtml(skillInfo.name)}</h2>
                        <p class="skill-detail-formula-hint">Hold Ctrl to show raw formulae. Release Ctrl to hide them.</p>
                    </section>

                    <div class="skill-info">
                        ${restrictionHtml}
                        ${descriptionHtml}
                        <section class="skill-effect-panel planner-card">
                            <div class="skill-detail-section-head">
                                <div>
                                    <span class="planner-card__eyebrow">Scaling Preview</span>
                                    <h3 class="title is-5 mb-0">Skill effect</h3>
                                </div>
                                <div class="field is-grouped is-align-items-center skill-effect-level-row mb-0">
                                    <label class="label mb-0 mr-3" for="skill-level-input">Base level</label>
                                    <div class="control">
                                        <input class="input planner-compact-number" type="number" id="skill-level-input" min="1" max="${maxPreview}" value="${initialLevel}" />
                                    </div>
                                </div>
                            </div>
                            <div class="skill-effect-body content"></div>
                        </section>
                        ${calcBlocksHtml}
                    </div>
                </main>

                <aside class="skill-detail-infobox order-1-mobile">
                    <section class="planner-card skill-detail-image-card">
                        <span class="planner-card__eyebrow">Skill Image</span>
                        <div class="skill-image-container">
                            ${skillImage || '<span class="has-text-grey is-italic">No image</span>'}
                        </div>
                    </section>
                    <section class="planner-card skill-detail-info-card">
                        <span class="planner-card__eyebrow">Information</span>
                        ${infoRowsHtml}
                    </section>
                </aside>
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
      if (row?.parentSkillId != null && String(row.parentSkillId).trim() !== '') {
        continue; // subskills are not shown on the main index list
      }
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
  if (route.name !== SKILLS_ROUTE_NAME) return;

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
