import {
  sanitizeSkillId,
  getSkillIconHTML,
  expandPlaceholdersWithScaling,
  showSkillDataLoadError,
  escapeHtmlText,
} from '@/shared/utils.js';
import { getTreeSkillsCache } from '@/character/planner-core.js';
import { getCurrentVersion, versionToTreeAssetFolder, initializeVersionSelector } from '@/shared/version-config.js';
import { DEFAULT_GAME_VERSION } from '@/shared/version-constants.js';
import {
  fetchTreeStructJson,
  getTreeLayoutRoot,
  applyTreeStructLayoutToSkills,
  applyTreeStructPrerequisitesToSkills,
} from '@/shared/tree-struct.js';
import {
  initSkillDataStore,
  getFileSkillStore,
  buildTabOrderLookupFromGameMeta,
  tabOrderRankFromLookup
} from '@/shared/skill-data-store.js';
import { buildSkillFromCatalogRow } from '@/tree/tree-data.js';
import { useItemsStore } from '@/stores/items.js';
import { getProcSourcesForSkill, procRowSources } from '@/items/item-procs.js';
import { getSkillGrantSourcesForSkill } from '@/items/item-skill-grants.js';
import { itemRarityNameClass } from '@/items/item-tooltip.js';
import Skill from './domain/Skill.js';

/** Skills index route name and query helpers (formerly skillsIndexRoute.js). */
export const SKILLS_ROUTE_NAME = 'skills';

const FILTER_VALUES = ['all', 'with_details', 'without_details'];

/**
 * @param {unknown} q
 * @param {string} key
 * @returns {string[]}
 */
export function readQueryStringArray(q, key) {
  if (!q || typeof q !== 'object') return [];
  const raw = /** @type {Record<string, unknown>} */ (q)[key];
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return [String(raw)].filter(Boolean);
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @param {Record<string, string | string[] | undefined | null>} partial
 */
export function mergeHomeQuery(router, partial) {
  if (!router) return;
  const cur = router.currentRoute.value.query;
  const next = { ...cur };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null || v === '') {
      delete next[k];
    } else if (Array.isArray(v)) {
      const filtered = v.map(String).filter(Boolean);
      if (filtered.length === 0) delete next[k];
      else next[k] = filtered;
    } else {
      next[k] = String(v);
    }
  }
  router.replace({ name: SKILLS_ROUTE_NAME, query: next });
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {'all'|'with_details'|'without_details'}
 */
export function readHomeFilterFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  const fromQuery = q && q.filter != null ? String(q.filter) : null;
  const savedFilter =
    fromQuery ?? new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('filter');
  if (savedFilter && FILTER_VALUES.includes(String(savedFilter))) {
    return /** @type {'all'|'with_details'|'without_details'} */ (String(savedFilter));
  }
  return 'all';
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {string[]}
 */
export function readHomeClassFiltersFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readQueryStringArray(q, 'classes');
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {string[]}
 */
export function readHomeTagFiltersFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readQueryStringArray(q, 'tags');
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {string[]}
 */
export function readHomeConditionFiltersFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readQueryStringArray(q, 'conditions');
}

/**
 * @param {unknown} q
 * @returns {'and'|'or'|'not'}
 */
export function readClassTagJoinFromQuery(q) {
  if (!q || typeof q !== 'object') return 'and';
  const rec = /** @type {Record<string, unknown>} */ (q);
  const raw = rec.filterLogic != null ? String(rec.filterLogic).toLowerCase() : 'and';
  if (raw === 'or') return 'or';
  if (raw === 'not') return 'not';
  return 'and';
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {'and'|'or'|'not'}
 */
export function readClassTagJoinFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readClassTagJoinFromQuery(q);
}

/**
 * @param {unknown} q
 * @returns {'skills'|'procs'}
 */
export function readHomeViewFromQuery(q) {
  if (!q || typeof q !== 'object') return 'skills';
  const rec = /** @type {Record<string, unknown>} */ (q);
  const raw = rec.view != null ? String(rec.view).toLowerCase() : '';
  return raw === 'procs' ? 'procs' : 'skills';
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {'skills'|'procs'}
 */
export function readHomeViewFromRoute(router) {
  return readHomeViewFromQuery(router?.currentRoute?.value?.query);
}

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
/** `tree_data` subfolder (e.g. "2_14"); from versionToTreeAssetFolder after JSON load */
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
 * @param {string} key
 * @param {string} [fallbackKey]
 * @returns {number | null}
 */
function readIntQueryParam(key, fallbackKey) {
  const router = getRouter();
  if (!router) return null;
  const query = router.currentRoute.value.query;
  const raw = query[key] ?? (fallbackKey != null ? query[fallbackKey] : undefined);
  const valueString = Array.isArray(raw) ? raw[0] : raw;
  if (valueString == null || valueString === '') return null;
  const parsed = parseInt(String(valueString), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Base level (blvl) from route.
 * @returns {number | null}
 */
function readSkillLevelFromRoute() {
  return readIntQueryParam('lvl', 'level');
}

/**
 * Added level (slvl) from route.
 * @returns {number | null}
 */
function readAddedLevelFromRoute() {
  return readIntQueryParam('slvl');
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
  pageTitleEl.textContent = readHomeViewFromRoute(getRouter()) === 'procs' ? 'Procs' : 'All Skills';
  const el = detailEl();
  if (el) el.innerHTML = '';
}

/**
 * @param {import('@/items/item-procs.js').ItemProcRow | import('@/items/item-skill-grants.js').ItemSkillGrantRow} row
 * @returns {string}
 */
function sourceSpansHtml(row) {
  return procRowSources(row)
    .map((source) => {
      const sourceAttrs =
        source.sourceKind === 'setBonus'
          ? `data-proc-set-id="${escapeHtmlText(String(source.setId || ''))}" data-proc-set-required="${escapeHtmlText(
              String(source.setRequired ?? '')
            )}"`
          : `data-proc-item-id="${escapeHtmlText(String(source.itemDefId || ''))}"`;
      const rarityClass = itemRarityNameClass(source.sourceRarity);
      return `<span class="skills-td-link js-proc-source ${rarityClass}" tabindex="0" ${sourceAttrs}>${escapeHtmlText(
        source.sourceLabel
      )}</span>`;
    })
    .join('');
}

/**
 * @param {import('@/items/item-procs.js').ItemProcRow | import('@/items/item-skill-grants.js').ItemSkillGrantRow} row
 * @returns {string}
 */
function sourcesSortText(row) {
  return procRowSources(row)
    .map((src) => src.sourceLabel)
    .join('\n');
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {1|-1} dir
 * @returns {number}
 */
function compareSourcesLocale(a, b, dir) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true }) * dir;
}

/**
 * @param {import('@/items/item-skill-grants.js').ItemSkillGrantRow[]} rows
 * @param {string} key
 * @param {1|-1} dir
 * @returns {import('@/items/item-skill-grants.js').ItemSkillGrantRow[]}
 */
function sortGrantRows(rows, key, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    if (key === 'amount') {
      const c = (Number(a.amount) || 0) - (Number(b.amount) || 0);
      if (c) return c * dir;
      const d = (Number(a.amountMax) || 0) - (Number(b.amountMax) || 0);
      if (d) return d * dir;
    } else if (key === 'restriction') {
      const c = compareSourcesLocale(a.restrictionLabel, b.restrictionLabel, dir);
      if (c) return c;
    }
    return compareSourcesLocale(sourcesSortText(a), sourcesSortText(b), dir);
  });
  return list;
}

/**
 * @param {import('@/items/item-procs.js').ItemProcRow[]} rows
 * @param {string} key
 * @param {1|-1} dir
 * @returns {import('@/items/item-procs.js').ItemProcRow[]}
 */
function sortProcRows(rows, key, dir) {
  const list = [...rows];
  list.sort((a, b) => {
    if (key === 'chance') {
      const c = (Number(a.chance) || 0) - (Number(b.chance) || 0);
      if (c) return c * dir;
      const d = (Number(a.chanceMax) || 0) - (Number(b.chanceMax) || 0);
      if (d) return d * dir;
    } else if (key === 'level') {
      const c = (Number(a.level) || 0) - (Number(b.level) || 0);
      if (c) return c * dir;
    } else if (key === 'condition') {
      const c = compareSourcesLocale(a.condition, b.condition, dir);
      if (c) return c;
    }
    return compareSourcesLocale(sourcesSortText(a), sourcesSortText(b), dir);
  });
  return list;
}

/**
 * @param {string} activeKey
 * @param {string} key
 * @param {1|-1} dir
 * @returns {string}
 */
function sourcesSortHintHtml(activeKey, key, dir) {
  if (activeKey !== key) return '';
  return `<span class="has-text-grey pl-1 is-size-7">${dir === 1 ? 'A-Z' : 'Z-A'}</span>`;
}

/**
 * @param {string} label
 * @param {string} key
 * @param {string} sortKey
 * @param {1|-1} sortDir
 * @returns {string}
 */
function sourcesSortTh(label, key, sortKey, sortDir) {
  return `<th><button type="button" class="button is-ghost p-0 skills-sort-btn js-skill-sources-sort" data-sort-key="${escapeHtmlText(
    key
  )}">${escapeHtmlText(label)} ${sourcesSortHintHtml(sortKey, key, sortDir)}</button></th>`;
}

/**
 * @param {boolean} showRestriction
 * @param {string} sortKey
 * @param {1|-1} sortDir
 * @returns {string}
 */
function grantSourcesHeadHtml(showRestriction, sortKey, sortDir) {
  return (
    sourcesSortTh('Amount', 'amount', sortKey, sortDir) +
    (showRestriction ? sourcesSortTh('Restriction', 'restriction', sortKey, sortDir) : '') +
    sourcesSortTh('Source', 'source', sortKey, sortDir)
  );
}

/**
 * @param {string} sortKey
 * @param {1|-1} sortDir
 * @returns {string}
 */
function procSourcesHeadHtml(sortKey, sortDir) {
  return (
    sourcesSortTh('Chance', 'chance', sortKey, sortDir) +
    sourcesSortTh('Condition', 'condition', sortKey, sortDir) +
    sourcesSortTh('Level', 'level', sortKey, sortDir) +
    sourcesSortTh('Source', 'source', sortKey, sortDir)
  );
}

/**
 * @param {import('@/items/item-skill-grants.js').ItemSkillGrantRow} row
 * @param {boolean} showRestriction
 * @returns {string}
 */
function grantSourcesRowHtml(row, showRestriction) {
  const restrictionCell = showRestriction ? `<td>${escapeHtmlText(row.restrictionLabel || '')}</td>` : '';
  return `<tr>
          <td>${escapeHtmlText(row.amountLabel)}</td>
          ${restrictionCell}
          <td>${sourceSpansHtml(row)}</td>
        </tr>`;
}

/**
 * @param {import('@/items/item-procs.js').ItemProcRow} row
 * @returns {string}
 */
function procSourcesRowHtml(row) {
  return `<tr>
          <td>${escapeHtmlText(row.chanceLabel)}%</td>
          <td>${escapeHtmlText(row.condition)}</td>
          <td>${escapeHtmlText(String(row.level))}</td>
          <td>${sourceSpansHtml(row)}</td>
        </tr>`;
}

/**
 * @param {string} eyebrow
 * @param {string} kind
 * @param {string} head
 * @param {string} body
 * @returns {string}
 */
function buildItemSourcesTableHtml(eyebrow, kind, head, body) {
  if (!body) return '';
  return `
    <section class="planner-card skill-proc-sources-panel">
      <div class="skill-detail-section-head">
        <div>
          <span class="planner-card__eyebrow">${escapeHtmlText(eyebrow)}</span>
          <h3 class="title is-5 mb-0">Sources</h3>
        </div>
      </div>
      <div class="table-container">
        <table class="table is-hoverable is-fullwidth skill-proc-sources-table" data-sources-kind="${escapeHtmlText(
          kind
        )}">
          <thead>
            <tr>${head}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

/**
 * @param {import('@/items/item-skill-grants.js').ItemSkillGrantRow[]} rows
 * @returns {string}
 */
function buildSkillGrantSourcesTableHtml(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const showRestriction = rows.some((row) => row.restrictionLabel);
  const sorted = sortGrantRows(rows, 'amount', 1);
  const body = sorted.map((row) => grantSourcesRowHtml(row, showRestriction)).join('');
  return buildItemSourcesTableHtml(
    'Item Bonuses',
    'grants',
    grantSourcesHeadHtml(showRestriction, 'amount', 1),
    body
  );
}

/**
 * @param {import('@/items/item-procs.js').ItemProcRow[]} rows
 * @returns {string}
 */
function buildProcSourcesTableHtml(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const sorted = sortProcRows(rows, 'chance', 1);
  const body = sorted.map((row) => procSourcesRowHtml(row)).join('');
  return buildItemSourcesTableHtml('Item Procs', 'procs', procSourcesHeadHtml('chance', 1), body);
}

/**
 * @param {HTMLElement} host
 * @param {'grants'|'procs'} kind
 * @param {Array<import('@/items/item-procs.js').ItemProcRow | import('@/items/item-skill-grants.js').ItemSkillGrantRow>} rows
 * @param {Array<() => void>} cleanupFns
 */
function bindSkillSourcesTableSort(host, kind, rows, cleanupFns) {
  const table = host.querySelector(`table.skill-proc-sources-table[data-sources-kind="${kind}"]`);
  if (!(table instanceof HTMLElement) || !rows.length) return;
  const showRestriction = kind === 'grants' && rows.some((row) => 'restrictionLabel' in row && row.restrictionLabel);
  const state = {
    key: kind === 'grants' ? 'amount' : 'chance',
    dir: /** @type {1|-1} */ (1),
  };

  function paint() {
    const theadRow = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    if (kind === 'grants') {
      const grantRows = /** @type {import('@/items/item-skill-grants.js').ItemSkillGrantRow[]} */ (rows);
      const sorted = sortGrantRows(grantRows, state.key, state.dir);
      if (theadRow) theadRow.innerHTML = grantSourcesHeadHtml(showRestriction, state.key, state.dir);
      if (tbody) tbody.innerHTML = sorted.map((row) => grantSourcesRowHtml(row, showRestriction)).join('');
      return;
    }
    const procRows = /** @type {import('@/items/item-procs.js').ItemProcRow[]} */ (rows);
    const sorted = sortProcRows(procRows, state.key, state.dir);
    if (theadRow) theadRow.innerHTML = procSourcesHeadHtml(state.key, state.dir);
    if (tbody) tbody.innerHTML = sorted.map((row) => procSourcesRowHtml(row)).join('');
  }

  /**
   * @param {Event} event
   */
  function onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('.js-skill-sources-sort');
    if (!(btn instanceof HTMLElement) || !table.contains(btn)) return;
    const key = btn.getAttribute('data-sort-key') || '';
    if (!key) return;
    if (state.key === key) state.dir = /** @type {1|-1} */ (state.dir === 1 ? -1 : 1);
    else {
      state.key = key;
      state.dir = 1;
    }
    paint();
  }

  table.addEventListener('click', onClick);
  cleanupFns.push(() => table.removeEventListener('click', onClick));
}

async function displaySkillDetail(skillId) {
  const host = detailEl();
  if (!host || !pageTitleEl) return;

  const sid = String(skillId);
  const maxPreview = Skill.MAX_SKILL_LEVEL;
  const routeLvl = readSkillLevelFromRoute();
  const routeAddedLvl = readAddedLevelFromRoute();
  const initialLevel = Math.min(
    maxPreview,
    Math.max(1, routeLvl != null && Number.isFinite(routeLvl) ? routeLvl : 1)
  );
  const initialAddedLevel = Math.min(
    maxPreview,
    Math.max(0, routeAddedLvl != null && Number.isFinite(routeAddedLvl) ? routeAddedLvl : 0)
  );
  const displayKey = `${sid}|${initialLevel}|${initialAddedLevel}`;
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

  const itemsStore = useItemsStore();
  try {
    await itemsStore.loadCatalog();
  } catch {
    /* proc sources stay empty */
  }
  const skillGrantRows = getSkillGrantSourcesForSkill(skillInfo.id, itemsStore);
  const skillGrantSourcesHtml = buildSkillGrantSourcesTableHtml(skillGrantRows);
  const procSourceRows = getProcSourcesForSkill(skillInfo.id, itemsStore);
  const procSourcesHtml = buildProcSourcesTableHtml(procSourceRows);

  const skillImage = skillInfo.image
    ? `${getSkillIconHTML(skillInfo.image, skillInfo.class, 'skill-image', skillIconGameVersionFolder)}`
    : '';
  const skillTags = Array.isArray(skillInfo.tags) ? skillInfo.tags.filter(Boolean) : [];

  const formulaState = { showFormulas: false };

  /**
   * @param {number} blvl
   * @param {number} slvl
   */
  const defaultCharacterState = (blvl, slvl) => ({
    level: Math.max(1, blvl + slvl),
    blvl: { [skillInfo.id]: blvl },
    lvl: { [skillInfo.id]: slvl },
    treeSkillsCache: getTreeSkillsCache(),
  });

  /**
   * @param {number} blvl
   * @param {number} slvl
   * @param {boolean} showFormulas
   */
  async function renderDescriptionAtLevel(blvl, slvl, showFormulas) {
    if (!skillInfo.description) return '';
    const effectiveLevel = Math.max(1, blvl + slvl);
    const expanded = await expandPlaceholdersWithScaling(
      skillInfo.id,
      effectiveLevel,
      skillInfo.description,
      skillInfo.id,
      defaultCharacterState(blvl, slvl),
      showFormulas
    );
    return `<span class="planner-card__eyebrow">Description</span><div class="content skill-detail-copy">${expanded}</div>`;
  }

  /**
   * @param {number} blvl
   * @param {number} slvl
   * @param {boolean} showFormulas
   */
  async function renderSkillEffectBodyAtLevel(blvl, slvl, showFormulas) {
    if (!skillInfo.skillEffect) {
      return '<p class="has-text-grey is-italic mb-0">No skill effect for this skill.</p>';
    }
    const effectiveLevel = Math.max(1, blvl + slvl);
    const expandedEffect = await expandPlaceholdersWithScaling(
      skillInfo.id,
      effectiveLevel,
      skillInfo.skillEffect,
      skillInfo.id,
      defaultCharacterState(blvl, slvl),
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

  /**
   * @param {number} blvl
   * @param {number} slvl
   * @param {boolean} showFormulas
   */
  async function renderRestrictionAtLevel(blvl, slvl, showFormulas) {
    if (!skillInfo.restriction) return '';
    const effectiveLevel = Math.max(1, blvl + slvl);
    const expandedRestriction = await expandPlaceholdersWithScaling(
      skillInfo.id,
      effectiveLevel,
      skillInfo.restriction,
      skillInfo.id,
      defaultCharacterState(blvl, slvl),
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
            <span>${escapeHtmlText(label)}</span>
            <strong>${escapeHtmlText(value)}</strong>
          </div>
        `
      )
      .join('');
  }

  const r = getRouter();
  const q = r ? r.currentRoute.value.query : {};
  const treeClass = q.class != null ? String(q.class) : null;
  const treeTab = q.tab != null ? String(q.tab) : null;
  const filter = q.filter != null ? String(q.filter) : null;
  const browseClasses = readQueryStringArray(q, 'classes');
  const browseTags = readQueryStringArray(q, 'tags');
  const browseConditions = readQueryStringArray(q, 'conditions');
  const classTagJoin = readClassTagJoinFromQuery(q);
  const homeView = readHomeViewFromQuery(q);

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
    if (browseConditions.length) backQuery.conditions = browseConditions;
    if (classTagJoin === 'or') backQuery.filterLogic = 'or';
    else if (classTagJoin === 'not') backQuery.filterLogic = 'not';
    if (homeView === 'procs') backQuery.view = 'procs';
    backHref = r.resolve({ name: SKILLS_ROUTE_NAME, query: backQuery }).href;
  } else {
    const sp = new URLSearchParams();
    if (filter && filter !== 'all') sp.set('filter', filter);
    for (const c of browseClasses) sp.append('classes', c);
    for (const t of browseTags) sp.append('tags', t);
    for (const cond of browseConditions) sp.append('conditions', cond);
    if (classTagJoin === 'or') sp.set('filterLogic', 'or');
    else if (classTagJoin === 'not') sp.set('filterLogic', 'not');
    if (homeView === 'procs') sp.set('view', 'procs');
    const qs = sp.toString();
    const base = String(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '') || '';
    const path = `${base}/skills`;
    backHref = qs ? `${path}?${qs}` : path;
  }

  const backLabel = treeClass || treeTab ? 'Tree' : homeView === 'procs' ? 'Procs' : 'Skills';
  const backButton = `
        <div class="skill-detail-toolbar">
            <a href="${escapeHtmlText(backHref)}" class="button is-light is-outlined">
                <span class="icon">
                    <i class="fas fa-arrow-left"></i>
                </span>
                <span>Back to ${escapeHtmlText(backLabel)}</span>
            </a>
        </div>
    `;

  const infoRowsHtml = buildInfoBoxRowsHtml();
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
                                    <div class="control mr-4">
                                        <input class="input planner-compact-number" type="number" id="skill-level-input" min="1" max="${maxPreview}" value="${initialLevel}" />
                                    </div>
                                    <label class="label mb-0 mr-3" for="skill-added-level-input">Added level</label>
                                    <div class="control">
                                        <input class="input planner-compact-number" type="number" id="skill-added-level-input" min="0" max="${maxPreview}" value="${initialAddedLevel}" />
                                    </div>
                                </div>
                            </div>
                            <div class="skill-effect-body content"></div>
                        </section>
                        ${skillGrantSourcesHtml}
                        ${procSourcesHtml}
                    </div>
                </main>

                <aside class="skill-detail-infobox order-1-mobile">
                    <section class="skill-detail-hero planner-card">
                        <span class="planner-card__eyebrow">Skill</span>
                        <h2 class="title is-4 skill-detail-page-name">${escapeHtmlText(skillInfo.name)}</h2>
                        <p class="skill-detail-formula-hint">Hold Ctrl to show raw formulae</p>
                    </section>
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

  function readPreviewLevelsFromInputs() {
    const baseInput = /** @type {HTMLInputElement | null} */ (host.querySelector('#skill-level-input'));
    const addedInput = /** @type {HTMLInputElement | null} */ (host.querySelector('#skill-added-level-input'));
    const baseRaw = baseInput ? parseInt(String(baseInput.value), 10) : initialLevel;
    const addedRaw = addedInput ? parseInt(String(addedInput.value), 10) : initialAddedLevel;
    const blvl = Math.min(maxPreview, Math.max(1, Number.isFinite(baseRaw) ? baseRaw : initialLevel));
    const slvl = Math.min(
      maxPreview,
      Math.max(0, Number.isFinite(addedRaw) ? addedRaw : initialAddedLevel)
    );
    if (baseInput && String(baseInput.value) !== String(blvl)) {
      baseInput.value = String(blvl);
    }
    if (addedInput && String(addedInput.value) !== String(slvl)) {
      addedInput.value = String(slvl);
    }
    return { blvl, slvl };
  }

  async function refreshTextBodies() {
    const { blvl, slvl } = readPreviewLevelsFromInputs();
    const sf = formulaState.showFormulas;
    const rest = host.querySelector('.skill-restriction');
    const desc = host.querySelector('.skill-description');
    const effBody = host.querySelector('.skill-effect-body');
    if (rest) rest.innerHTML = await renderRestrictionAtLevel(blvl, slvl, sf);
    if (desc) desc.innerHTML = await renderDescriptionAtLevel(blvl, slvl, sf);
    if (effBody) effBody.innerHTML = await renderSkillEffectBodyAtLevel(blvl, slvl, sf);
  }

  await refreshTextBodies();

  mergeHomeQueryFromIndex({
    skill: sid,
    lvl: initialLevel === 1 ? '' : String(initialLevel),
    slvl: initialAddedLevel === 0 ? '' : String(initialAddedLevel),
  });

  const cleanupFns = [];
  bindSkillSourcesTableSort(host, 'grants', skillGrantRows, cleanupFns);
  bindSkillSourcesTableSort(host, 'procs', procSourceRows, cleanupFns);

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
  const addedLevelInput = /** @type {HTMLInputElement | null} */ (
    host.querySelector('#skill-added-level-input')
  );
  let debounceId = 0;
  const onLevelInput = () => {
    const { blvl, slvl } = readPreviewLevelsFromInputs();
    mergeHomeQueryFromIndex({
      lvl: blvl === 1 ? '' : String(blvl),
      slvl: slvl === 0 ? '' : String(slvl),
    });
    lastDisplayedSkillKey = `${sid}|${blvl}|${slvl}`;
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      debounceId = 0;
      void refreshTextBodies();
    }, 100);
  };
  if (levelInput) {
    levelInput.addEventListener('input', onLevelInput);
    levelInput.addEventListener('change', onLevelInput);
    cleanupFns.push(() => levelInput.removeEventListener('input', onLevelInput));
    cleanupFns.push(() => levelInput.removeEventListener('change', onLevelInput));
  }
  if (addedLevelInput) {
    addedLevelInput.addEventListener('input', onLevelInput);
    addedLevelInput.addEventListener('change', onLevelInput);
    cleanupFns.push(() => addedLevelInput.removeEventListener('input', onLevelInput));
    cleanupFns.push(() => addedLevelInput.removeEventListener('change', onLevelInput));
  }

  homeSkillDetailFormulaListenersDetach = () => {
    for (const detachListener of cleanupFns) {
      detachListener();
    }
    cleanupFns.length = 0;
  };

  lastDisplayedSkillKey = `${sid}|${initialLevel}|${initialAddedLevel}`;
}

async function loadSkillsFromTreeDataPage() {
  try {
    await initSkillDataStore({ ...DEFAULT_GAME_VERSION });
    const store = getFileSkillStore();
    skillIconGameVersionFolder = versionToTreeAssetFolder(getCurrentVersion());

    const loadedSkills = [];
    for (const row of store.catalog) {
      if (row?.parentSkillId != null && String(row.parentSkillId).trim() !== '') {
        continue; // subskills are not shown on the main index list
      }
      const skill = buildSkillFromCatalogRow(store, row);
      if (skill) loadedSkills.push(skill);
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
      const byClass = String(a.class || '').localeCompare(String(b.class || ''));
      if (byClass !== 0) return byClass;
      const tabRankA = tabOrderRankFromLookup(a, tabOrderLookup);
      const tabRankB = tabOrderRankFromLookup(b, tabOrderLookup);
      if (tabRankA !== tabRankB) return tabRankA - tabRankB;
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
    const routeAddedLvl = readAddedLevelFromRoute();
    const previewLevel = Math.min(
      Skill.MAX_SKILL_LEVEL,
      Math.max(1, routeLvl != null && Number.isFinite(routeLvl) ? routeLvl : 1)
    );
    const previewAddedLevel = Math.min(
      Skill.MAX_SKILL_LEVEL,
      Math.max(0, routeAddedLvl != null && Number.isFinite(routeAddedLvl) ? routeAddedLvl : 0)
    );
    const routeKey = `${String(skillParam)}|${previewLevel}|${previewAddedLevel}`;
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
