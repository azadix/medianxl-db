/**
 * @file Editor in-memory store, forms, and version load (no server write).
 * @module src/editor/editor-store
 */
import { TAG_GROUPS } from '@/shared/utils.js';
import { attachEditorTextareaAutocomplete } from './editor-textarea-autocomplete.js';
import { detachVersionSelectorListeners, versionToString } from '@/shared/version-config.js';

const TREE_DATA = 'tree_data';
const DEFAULT_EDITOR_FILE_BASENAME = 'skills.json';
let editorFileBasename = DEFAULT_EDITOR_FILE_BASENAME;

function isSubskillsMode() {
    return editorFileBasename === 'subskills.json';
}

/** When editing skills.json, also load subskills.json for ||...|| autocomplete. */
let autocompleteSubskills = [];
const DEFAULT_VARIANT_ROW = {
    variant_key: '',
    label: '',
    sort_order: 0,
    description_override: null,
    skill_effect_override: null,
    restriction_override: null
};

const DEFAULT_SCALING_CONSTANT_ROW = {
    statKey: '',
    occurrenceIndex: 0,
    variantKey: '',
    value0: ''
};

/** @type {object[]} */
let workingSkills = [];
/** @type {{ id?: number, key: string, name: string, format?: string }[]} */
let statsCatalog = [];
/** @type {Record<string, number>|null} keyed by stat key (lowercase) */
let statUsageCountsCache = null;
let folderSeg = '';
/** @type {((skills: object[], folder: string) => void) | null} */
let syncEditorTableView = null;
let selectedIndex = -1;
let dirty = false;
let versionsList = [];

/** @type {{ classes?: { id: number; name: string }[]; classTabs?: { id: number; class_id: number; tab_index: number; name: string }[]; skilltags?: { id: number; name: string }[] } | null} */
let gameMeta = null;

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/** Not part of skills.json; remove if present (legacy paste or old files). */
function stripTabSortOrderFromRows(skills) {
    for (const s of skills) {
        delete s.tabSortOrder;
    }
}

/** Removed from skills.json; strip if present so download does not re-add them. */
function stripLegacyCalcSlots(skills) {
    for (const s of skills) {
        for (let n = 1; n <= 6; n++) {
            delete s[`calc${n}`];
        }
    }
}

function invalidateStatUsageCounts() {
    statUsageCountsCache = null;
}

/** Flatten description / skillEffect / restriction for placeholder scanning. */
function skillTextFieldAsString(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x))).join('\n');
    return String(v);
}

/**
 * Count `{{stat_key}}` uses in description, skillEffect, restriction for the loaded version buffer.
 * @param {object[]} skills
 * @returns {Record<string, number>}
 */
function computeStatUsageCounts(skills) {
    /** @type {Record<string, number>} */
    const counts = {};
    const re = /\{\{([^}]+)\}\}/g;
    for (const s of skills) {
        for (const field of ['description', 'skillEffect', 'restriction']) {
            const t = skillTextFieldAsString(s[field]);
            if (!t) continue;
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(t)) !== null) {
                const inner = m[1].trim();
                const colon = inner.indexOf(':');
                const statKey = (colon === -1 ? inner : inner.slice(0, colon)).trim().toLowerCase();
                if (!statKey) continue;
                counts[statKey] = (counts[statKey] || 0) + 1;
            }
        }
    }
    return counts;
}

/**
 * Coerce description / skillEffect / restriction to `string[]` (empty => `[]`, never `null`).
 * @param {object[]} skills
 */
function normalizeSkillTextFieldsToStringArrays(skills) {
    if (!Array.isArray(skills)) return;
    for (const s of skills) {
        for (const key of ['description', 'skillEffect', 'restriction']) {
            const v = s[key];
            if (v == null) {
                s[key] = [];
                continue;
            }
            if (Array.isArray(v)) {
                const lines = v.map((x) => String(x));
                s[key] = lines.every((x) => x.trim() === '') ? [] : lines;
                continue;
            }
            if (typeof v === 'string') {
                const lines = v.replace(/\r\n/g, '\n').split('\n').map((x) => String(x));
                s[key] = lines.every((x) => x.trim() === '') ? [] : lines;
            } else {
                s[key] = [String(v)];
            }
        }
    }
}

function getStatUsageCounts() {
    if (!statUsageCountsCache) {
        statUsageCountsCache = computeStatUsageCounts(workingSkills);
    }
    return statUsageCountsCache;
}

const VALUE_SLOT_RE = /\{value(\d+)\}/gi;

/**
 * @param {string|undefined|null} format
 * @returns {number}
 */
function countValueSlotsFromFormat(format) {
    const s = format != null ? String(format) : '';
    let max = -1;
    VALUE_SLOT_RE.lastIndex = 0;
    let m;
    while ((m = VALUE_SLOT_RE.exec(s)) !== null) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max >= 0 ? max + 1 : 1;
}

/**
 * @param {string} statKeyLower
 * @returns {{ id?: number, key: string, name: string, format?: string }|null}
 */
function lookupStatCatalogRow(statKeyLower) {
    const k = String(statKeyLower || '').toLowerCase();
    if (!k) return null;
    for (const row of statsCatalog) {
        if (String(row.key || '').toLowerCase() === k) return row;
    }
    return null;
}

/**
 * @param {string} statKey
 */
function buildScalingConstantRowForStat(statKey) {
    const kLower = String(statKey || '').trim().toLowerCase();
    const row = lookupStatCatalogRow(kLower);
    const canonicalKey = row?.key != null ? String(row.key).trim() : String(statKey || '').trim();
    const nSlots = countValueSlotsFromFormat(row?.format);
    /** @type {Record<string, unknown>} */
    const out = {
        statKey: canonicalKey,
        occurrenceIndex: 0,
        variantKey: ''
    };
    for (let i = 0; i < nSlots; i++) {
        out[`value${i}`] = '';
    }
    return out;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function collectStatPlaceholderKeysFromText(text) {
    /** @type {Set<string>} */
    const keys = new Set();
    const re = /\{\{([^}]+)\}\}/g;
    const t = String(text || '');
    let m;
    while ((m = re.exec(t)) !== null) {
        const inner = m[1].trim();
        const colon = inner.indexOf(':');
        const statKey = (colon === -1 ? inner : inner.slice(0, colon)).trim().toLowerCase();
        if (statKey) keys.add(statKey);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
}

function refreshEditorScalingStatSelect() {
    const sel = document.getElementById('editor-scaling-stat-add');
    if (!sel) return;
    const descTa = document.getElementById('f-description');
    const effectTa = document.getElementById('f-skillEffect');
    const keys = [
        ...new Set([
            ...collectStatPlaceholderKeysFromText(descTa?.value ?? ''),
            ...collectStatPlaceholderKeysFromText(effectTa?.value ?? '')
        ])
    ].sort((a, b) => a.localeCompare(b));
    const saved = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Add row for stat in text fields…';
    sel.appendChild(ph);
    for (const k of keys) {
        const row = lookupStatCatalogRow(k);
        const opt = document.createElement('option');
        opt.value = row?.key != null ? String(row.key) : k;
        opt.textContent = row?.name ? `${row.key} — ${row.name}` : opt.value;
        sel.appendChild(opt);
    }
    if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
    else sel.value = '';
}

function appendScalingConstantRowForDescriptionStat(statKey) {
    if (!statKey) return;
    const ta = document.getElementById('f-scalingConstants');
    if (!ta) return;
    const parsed = parseJsonField('f-scalingConstants', 'err-scalingConstants', []);
    if (parsed === Symbol('invalid')) {
        showToast('Fix scalingConstants JSON before adding a row.', true);
        return;
    }
    if (!Array.isArray(parsed)) {
        showFieldError('scalingConstants', 'Must be a JSON array');
        showToast('scalingConstants must be a JSON array.', true);
        return;
    }
    parsed.push(buildScalingConstantRowForStat(statKey));
    ta.value = JSON.stringify(parsed, null, 2);
    ta.classList.remove('is-danger');
    const err = document.getElementById('err-scalingConstants');
    if (err) {
        err.textContent = '';
        err.classList.add('is-hidden');
    }
    showToast('Appended scalingConstants row for stat. Edit JSON then Apply.');
}

function showToast(message, isDanger = false) {
    const el = document.getElementById('editor-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('is-hidden', 'is-danger', 'is-success');
    el.classList.add(isDanger ? 'is-danger' : 'is-success');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
        el.classList.add('is-hidden');
    }, 3200);
}

function setDirty(on) {
    dirty = on;
    const badge = document.getElementById('dirty-badge');
    const dl = document.getElementById('btn-download');
    if (badge) badge.classList.toggle('is-hidden', !on);
    if (dl) dl.disabled = workingSkills.length === 0;
}

async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`${path}: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

/** @param {string} seg - e.g. "2_12" */
function parseFolderSegToVersion(seg) {
    const parts = String(seg).split('_');
    return {
        major: parseInt(parts[0], 10) || 0,
        minor: parseInt(parts[1], 10) || 0,
    };
}

async function loadVersionsIntoSelect() {
    const sel = document.getElementById('version-selector');
    if (!sel) return;
    detachVersionSelectorListeners(sel);
    versionsList = await fetchJson(`${TREE_DATA}/versions.json`);
    if (!Array.isArray(versionsList)) {
        throw new Error('versions.json must be an array');
    }
    sel.innerHTML = '';
    for (const v of versionsList) {
        const opt = document.createElement('option');
        const versionObj = { major: v.major, minor: v.minor };
        opt.value = JSON.stringify(versionObj);
        opt.textContent =
            v.name != null ? String(v.name) : versionToString(versionObj);
        if (v.is_active === 1 || v.is_active === true) {
            opt.selected = true;
        }
        sel.appendChild(opt);
    }
    if (!sel.value && versionsList.length) {
        sel.selectedIndex = 0;
    }
    rebuildRowVersionSelectOptions();
}

function rebuildRowVersionSelectOptions() {
    // rowVersionId removed from skills.json; no select to rebuild.
}

function setRowVersionFormFromSkill(_s) {}

function showLoadError(msg) {
    const box = document.getElementById('load-error');
    if (!box) return;
    box.textContent = msg;
    box.classList.remove('is-hidden');
}

function hideLoadError() {
    document.getElementById('load-error')?.classList.add('is-hidden');
}

async function loadSkillsForFolder(seg) {
    hideLoadError();
    const skillsPath = `${TREE_DATA}/${seg}/${editorFileBasename}`;
    const metaPath = `${TREE_DATA}/${seg}/game_meta.json`;
    const raw = await fetchJson(skillsPath);
    if (!Array.isArray(raw)) {
        throw new Error(`${editorFileBasename} must be a JSON array`);
    }
    try {
        gameMeta = await fetchJson(metaPath);
    } catch (e) {
        console.warn(e);
        gameMeta = null;
        showToast('Could not load game_meta.json; class/tab dropdowns will be limited.', true);
    }
    workingSkills = deepClone(raw);
    autocompleteSubskills = [];
    if (!isSubskillsMode()) {
        try {
            const subskillsRaw = await fetchJson(`${TREE_DATA}/${seg}/subskills.json`);
            autocompleteSubskills = Array.isArray(subskillsRaw) ? deepClone(subskillsRaw) : [];
        } catch {
            autocompleteSubskills = [];
        }
    }
    stripLegacyCalcSlots(workingSkills);
    stripTabSortOrderFromRows(workingSkills);
    normalizeSkillTextFieldsToStringArrays(workingSkills);
    invalidateStatUsageCounts();
    folderSeg = seg;
    setDirty(false);
    rebuildTagCheckboxes();
    refreshEditorTableView();
    const dl = document.getElementById('btn-download');
    if (dl) dl.disabled = false;
}

function refreshEditorTableView() {
    syncEditorTableView?.(workingSkills.slice(), folderSeg);
}

/**
 * @param {number} index - Index in `workingSkills` (stable after filter/sort in the Vue table).
 */
export function editorOpenSkillAtIndex(index) {
    openEditView(index);
}

function tabsForClassId(classId) {
    if (!gameMeta?.classTabs || classId == null || !Number.isFinite(Number(classId))) {
        return [];
    }
    const cid = Number(classId);
    return gameMeta.classTabs
        .filter((t) => t.class_id === cid)
        .sort((a, b) => {
            const di = a.tab_index - b.tab_index;
            if (di !== 0) return di;
            return a.id - b.id;
        });
}

function rebuildClassSelectOptions() {
    const sel = document.getElementById('f-class-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (!gameMeta?.classes?.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(no classes in game_meta for this version)';
        sel.appendChild(opt);
        return;
    }
    const list = [...gameMeta.classes].sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
    );
    for (const c of list) {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.dataset.name = c.name;
        opt.textContent = c.name;
        sel.appendChild(opt);
    }
}

function rebuildTabSelectForClass(classId, selectedTabId, skillForOrphan) {
    const sel = document.getElementById('f-tab-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (classId == null || !Number.isFinite(Number(classId))) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(select class first)';
        sel.appendChild(opt);
        syncPlacementReadonlyFromSelects();
        return;
    }
    const cid = Number(classId);
    const tabs = tabsForClassId(cid);
    for (const t of tabs) {
        const opt = document.createElement('option');
        opt.value = String(t.id);
        opt.dataset.tabIndex = String(t.tab_index);
        opt.dataset.tabName = t.name;
        opt.textContent = t.name;
        sel.appendChild(opt);
    }
    const want = selectedTabId != null ? Number(selectedTabId) : NaN;
    const hasWant = tabs.some((t) => t.id === want);
    if (!hasWant && Number.isFinite(want) && skillForOrphan) {
        const opt = document.createElement('option');
        opt.value = String(want);
        opt.dataset.tabIndex = '';
        opt.dataset.tabName = skillForOrphan.tabName != null ? String(skillForOrphan.tabName) : '';
        const label = skillForOrphan.tabName != null ? String(skillForOrphan.tabName) : `tab ${want}`;
        opt.textContent = `${label} (not in game_meta for this class)`;
        sel.appendChild(opt);
    }
    if (!sel.options.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(no tabs for this class in game_meta)';
        sel.appendChild(opt);
    }
    if (Number.isFinite(want) && [...sel.options].some((o) => o.value === String(want))) {
        sel.value = String(want);
    } else {
        sel.selectedIndex = 0;
    }
    syncPlacementReadonlyFromSelects();
}

function syncPlacementReadonlyFromSelects() {
    const classSel = document.getElementById('f-class-select');
    const tabSel = document.getElementById('f-tab-select');
    const cidStr = classSel?.value?.trim() ?? '';
    const cid = cidStr === '' ? NaN : parseInt(cidStr, 10);
    const classIdEl = document.getElementById('f-classId');
    if (classIdEl) classIdEl.value = Number.isFinite(cid) ? String(cid) : '';

    const tidStr = tabSel?.value?.trim() ?? '';
    const tid = tidStr === '' ? NaN : parseInt(tidStr, 10);
    const tabEl = document.getElementById('f-tab');
    if (tabEl) tabEl.value = Number.isFinite(tid) ? String(tid) : '';
}

function ensureClassOptionForSkill(s) {
    const sel = document.getElementById('f-class-select');
    if (!sel || s.classId == null || !Number.isFinite(Number(s.classId))) return;
    const idStr = String(s.classId);
    if ([...sel.options].some((o) => o.value === idStr)) return;
    const opt = document.createElement('option');
    opt.value = idStr;
    const nm = s.class != null ? String(s.class) : '';
    opt.dataset.name = nm;
    opt.textContent = nm ? `${nm} (not in game_meta)` : `classId ${idStr} (not in game_meta)`;
    sel.appendChild(opt);
}

function populatePlacementSelects(s) {
    rebuildClassSelectOptions();
    const cid = s.classId != null ? Number(s.classId) : NaN;
    ensureClassOptionForSkill(s);
    const classSel = document.getElementById('f-class-select');
    if (classSel) {
        if (Number.isFinite(cid) && [...classSel.options].some((o) => o.value === String(cid))) {
            classSel.value = String(cid);
        } else {
            classSel.value = '';
        }
    }
    rebuildTabSelectForClass(Number.isFinite(cid) ? cid : null, s.tab, s);
    syncPlacementReadonlyFromSelects();
}

function onClassSelectChange() {
    const classSel = document.getElementById('f-class-select');
    const tabSel = document.getElementById('f-tab-select');
    const cidStr = classSel?.value?.trim() ?? '';
    const cid = cidStr === '' ? NaN : parseInt(cidStr, 10);
    const prevTabId = tabSel?.value?.trim() === '' ? NaN : parseInt(tabSel.value, 10);
    const tabs = tabsForClassId(cid);
    let nextTab = tabs[0]?.id;
    if (Number.isFinite(prevTabId) && tabs.some((t) => t.id === prevTabId)) {
        nextTab = prevTabId;
    }
    rebuildTabSelectForClass(Number.isFinite(cid) ? cid : null, nextTab, null);
}

function appendTagCheckbox(grid, t, cbIndex) {
    const name = String(t.name);
    const id = `f-tag-cb-${cbIndex.n}`;
    cbIndex.n += 1;
    const label = document.createElement('label');
    label.className = 'checkbox f-tag-cb-label';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.className = 'f-tag-cb';
    inp.id = id;
    inp.dataset.tagName = name;
    label.appendChild(inp);
    label.appendChild(document.createTextNode(` ${name}`));
    grid.appendChild(label);
}

function rebuildTagCheckboxes() {
    const container = document.getElementById('f-tags-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    const noMeta = document.getElementById('f-tags-no-meta');
    if (!gameMeta?.skilltags?.length) {
        noMeta?.classList.remove('is-hidden');
        return;
    }
    noMeta?.classList.add('is-hidden');

    const byId = new Map(
        gameMeta.skilltags.map((t) => [Number(t.id), t])
    );
    const placed = new Set();
    const cbIndex = { n: 0 };

    for (const [groupName, ids] of Object.entries(TAG_GROUPS)) {
        const grid = document.createElement('div');
        grid.className = 'f-tags-checkbox-grid';
        const tagsInGroup = [...ids]
            .map((tid) => byId.get(tid))
            .filter(Boolean)
            .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
            );
        for (const t of tagsInGroup) {
            placed.add(Number(t.id));
            appendTagCheckbox(grid, t, cbIndex);
        }
        if (!grid.children.length) continue;
        const wrap = document.createElement('div');
        wrap.className = 'f-tags-group';
        const title = document.createElement('div');
        title.className = 'f-tags-group-title is-size-6 has-text-weight-semibold';
        title.textContent = groupName;
        wrap.appendChild(title);
        wrap.appendChild(grid);
        container.appendChild(wrap);
    }

    const restIds = [...byId.keys()].filter((id) => !placed.has(id));
    const restTags = restIds
        .map((tid) => byId.get(tid))
        .filter(Boolean)
        .sort((a, b) =>
            String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
        );
    if (restTags.length) {
        const grid = document.createElement('div');
        grid.className = 'f-tags-checkbox-grid';
        for (const t of restTags) {
            appendTagCheckbox(grid, t, cbIndex);
        }
        const wrap = document.createElement('div');
        wrap.className = 'f-tags-group';
        const title = document.createElement('div');
        title.className = 'f-tags-group-title is-size-6 has-text-weight-semibold';
        title.textContent = 'Other';
        wrap.appendChild(title);
        wrap.appendChild(grid);
        container.appendChild(wrap);
    }
}

function setTagsFormFromSkill(s) {
    const tags = Array.isArray(s.tags) ? s.tags.map((x) => String(x)) : [];
    document.querySelectorAll('.f-tag-cb').forEach((cb) => {
        const n = cb.dataset.tagName;
        cb.checked = n != null && tags.includes(n);
    });
}

function readTagsFromForm() {
    if (!gameMeta?.skilltags?.length) {
        if (selectedIndex < 0 || selectedIndex >= workingSkills.length) return [];
        const cur = workingSkills[selectedIndex].tags;
        return Array.isArray(cur) ? cur.map((x) => String(x)) : [];
    }
    const fromCb = [];
    document.querySelectorAll('.f-tag-cb:checked').forEach((cb) => {
        if (cb.dataset.tagName) fromCb.push(cb.dataset.tagName);
    });
    return [...new Set(fromCb)];
}

function prettyJson(val, fallback) {
    if (val === undefined || val === null) {
        return fallback;
    }
    try {
        return JSON.stringify(val, null, 2);
    } catch {
        return fallback;
    }
}

function populateForm(s) {
    document.getElementById('f-id').value = s.id != null ? String(s.id) : '';
    document.getElementById('f-numericId').value = s.numericId != null ? String(s.numericId) : '';
    document.getElementById('f-displayName').value = s.displayName != null ? String(s.displayName) : '';
    const img = document.getElementById('f-image');
    if (img) img.value = s.image != null ? String(s.image) : '';

    const parentId = document.getElementById('f-parentSkillId');
    if (parentId) parentId.value = s.parentSkillId != null ? String(s.parentSkillId) : '';

    if (!isSubskillsMode()) {
        populatePlacementSelects(s);
        setRowVersionFormFromSkill(s);
    }

    const baseMax = document.getElementById('f-baseMaxLevel');
    if (baseMax) baseMax.value = s.baseMaxLevel != null ? String(s.baseMaxLevel) : '';
    const abs = document.getElementById('f-affectedBySpecialization');
    if (abs) abs.checked = Boolean(s.affectedBySpecialization);

    if (!isSubskillsMode()) {
        setTagsFormFromSkill(s);
    }

    const joinLines = (v) => {
        if (v == null) return '';
        if (Array.isArray(v)) {
            if (v.length === 0) return '';
            return v.map((x) => (x == null ? '' : String(x))).join('\n');
        }
        return String(v);
    };
    document.getElementById('f-description').value = joinLines(s.description);
    document.getElementById('f-skillEffect').value = joinLines(s.skillEffect);
    const restr = document.getElementById('f-restriction');
    if (restr) restr.value = joinLines(s.restriction);

    const variants = document.getElementById('f-variants');
    if (variants) variants.value = prettyJson(s.variants, '[]');
    document.getElementById('f-scalingConstants').value = prettyJson(s.scalingConstants, '[]');

    ['variants', 'scalingConstants'].forEach((k) => {
        if (isSubskillsMode() && k === 'variants') return;
        const err = document.getElementById(`err-${k}`);
        if (err) {
            err.textContent = '';
            err.classList.add('is-hidden');
        }
        const ta = document.getElementById(`f-${k}`);
        if (ta) ta.classList.remove('is-danger');
    });

    document.getElementById('edit-heading').textContent = `Edit: ${s.displayName || s.id || '(skill)'}`;
    refreshEditorScalingStatSelect();
}

function parseJsonField(textareaId, errId, emptyFallback) {
    const ta = document.getElementById(textareaId);
    const errEl = document.getElementById(errId);
    const raw = ta.value.trim();
    if (raw === '' && emptyFallback !== undefined) {
        ta.classList.remove('is-danger');
        if (errEl) {
            errEl.classList.add('is-hidden');
            errEl.textContent = '';
        }
        return emptyFallback;
    }
    try {
        const v = JSON.parse(raw);
        ta.classList.remove('is-danger');
        if (errEl) {
            errEl.classList.add('is-hidden');
            errEl.textContent = '';
        }
        return v;
    } catch (e) {
        ta.classList.add('is-danger');
        if (errEl) {
            errEl.textContent = e.message || 'Invalid JSON';
            errEl.classList.remove('is-hidden');
        }
        return Symbol('invalid');
    }
}

function emptyToNull(str) {
    const t = String(str).trim();
    return t === '' ? null : t;
}

function readInt(id) {
    const v = document.getElementById(id).value.trim();
    if (v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

function applyFormToWorkingSkill() {
    if (selectedIndex < 0 || selectedIndex >= workingSkills.length) return false;

    const s = workingSkills[selectedIndex];

    let variants = [];
    if (!isSubskillsMode()) {
        variants = parseJsonField('f-variants', 'err-variants', []);
        if (variants === Symbol('invalid')) return false;
        if (!Array.isArray(variants)) {
            showFieldError('variants', 'Must be a JSON array');
            return false;
        }
    }

    const scalingConstants = parseJsonField('f-scalingConstants', 'err-scalingConstants', []);
    if (scalingConstants === Symbol('invalid')) return false;

    if (!Array.isArray(scalingConstants)) {
        showFieldError('scalingConstants', 'Must be a JSON array');
        return false;
    }

    s.numericId = readInt('f-numericId');
    s.displayName = emptyToNull(document.getElementById('f-displayName').value);
    const img = document.getElementById('f-image');
    if (img) s.image = emptyToNull(img.value);

    // rowVersionId removed

    if (!isSubskillsMode()) {
        const classSel = document.getElementById('f-class-select');
        const tabSel = document.getElementById('f-tab-select');
        const cidStr = classSel?.value?.trim() ?? '';
        const cid = cidStr === '' ? null : parseInt(cidStr, 10);
        const clsOpt = classSel?.selectedOptions?.[0];
        s.classId = Number.isFinite(cid) ? cid : null;
        const clsName = clsOpt?.dataset?.name;
        s.class =
            clsName != null && clsName !== ''
                ? String(clsName)
                : s.classId != null && clsOpt
                  ? emptyToNull(clsOpt.textContent.replace(/\s*\(not in game_meta\)\s*$/, ''))
                  : null;

        const tidStr = tabSel?.value?.trim() ?? '';
        const tid = tidStr === '' ? null : parseInt(tidStr, 10);
        const tOpt = tabSel?.selectedOptions?.[0];
        s.tab = Number.isFinite(tid) ? tid : null;
        const tname = tOpt?.dataset?.tabName;
        s.tabName =
            tname != null && tname !== ''
                ? String(tname)
                : s.tab != null && tOpt
                  ? emptyToNull(tOpt.textContent.replace(/\s*\(not in game_meta for this class\)\s*$/, ''))
                  : null;
        delete s.tabSortOrder;

        s.baseMaxLevel = readInt('f-baseMaxLevel');
        const abs = document.getElementById('f-affectedBySpecialization');
        s.affectedBySpecialization = abs ? abs.checked : false;

        s.tags = readTagsFromForm();
    } else {
        s.parentSkillId = emptyToNull(document.getElementById('f-parentSkillId')?.value ?? '');
        // Ensure removed fields do not persist in subskills.json
        delete s.classId;
        delete s.tab;
        delete s.class;
        delete s.tabName;
        delete s.tags;
        delete s.baseMaxLevel;
        delete s.affectedBySpecialization;
        delete s.variants;
        delete s.image;
        delete s.restriction;
        delete s.tabSortOrder;
    }

    const splitLines = (raw) => {
        const t = String(raw ?? '');
        const lines = t.replace(/\r\n/g, '\n').split('\n');
        if (lines.every((x) => String(x).trim() === '')) return [];
        return lines.map((x) => String(x));
    };
    s.description = splitLines(document.getElementById('f-description').value);
    s.skillEffect = splitLines(document.getElementById('f-skillEffect').value);
    const restr = document.getElementById('f-restriction');
    if (restr) {
        s.restriction = splitLines(restr.value);
    }
    normalizeSkillTextFieldsToStringArrays([s]);

    if (!isSubskillsMode()) {
        s.variants = variants;
    }
    delete s.scaling;
    s.scalingConstants = scalingConstants;

    invalidateStatUsageCounts();
    return true;
}

function showFieldError(field, msg) {
    const ta = document.getElementById(`f-${field}`);
    const err = document.getElementById(`err-${field}`);
    if (ta) ta.classList.add('is-danger');
    if (err) {
        err.textContent = msg;
        err.classList.remove('is-hidden');
    }
}

function appendDefaultVariantRowToForm() {
    const ta = document.getElementById('f-variants');
    if (!ta) return;
    const parsed = parseJsonField('f-variants', 'err-variants', []);
    if (parsed === Symbol('invalid')) {
        showToast('Fix variants JSON before adding a row.', true);
        return;
    }
    if (!Array.isArray(parsed)) {
        showFieldError('variants', 'Must be a JSON array');
        showToast('variants must be a JSON array.', true);
        return;
    }
    parsed.push({ ...DEFAULT_VARIANT_ROW });
    ta.value = JSON.stringify(parsed, null, 2);
    ta.classList.remove('is-danger');
    const err = document.getElementById('err-variants');
    if (err) {
        err.textContent = '';
        err.classList.add('is-hidden');
    }
    showToast('Appended default variant object. Edit JSON then Apply.');
}

function appendDefaultScalingConstantRowToForm() {
    const ta = document.getElementById('f-scalingConstants');
    if (!ta) return;
    const parsed = parseJsonField('f-scalingConstants', 'err-scalingConstants', []);
    if (parsed === Symbol('invalid')) {
        showToast('Fix scalingConstants JSON before adding a row.', true);
        return;
    }
    if (!Array.isArray(parsed)) {
        showFieldError('scalingConstants', 'Must be a JSON array');
        showToast('scalingConstants must be a JSON array.', true);
        return;
    }
    parsed.push({ ...DEFAULT_SCALING_CONSTANT_ROW });
    ta.value = JSON.stringify(parsed, null, 2);
    ta.classList.remove('is-danger');
    const err = document.getElementById('err-scalingConstants');
    if (err) {
        err.textContent = '';
        err.classList.add('is-hidden');
    }
    showToast('Appended default scalingConstants object. Edit JSON then Apply.');
}

function collectInternalSkillIdSet() {
    const used = new Set();
    for (const s of workingSkills) {
        if (s.id != null && s.id !== '') used.add(String(s.id));
    }
    return used;
}

function nextUniqueInternalSkillId() {
    const used = collectInternalSkillIdSet();
    let candidate = 'new_skill';
    if (!used.has(candidate)) return candidate;
    let n = 2;
    for (;;) {
        candidate = `new_skill_${n}`;
        if (!used.has(candidate)) return candidate;
        n += 1;
    }
}

function nextNumericIdForNewSkill() {
    let max = 0;
    for (const s of workingSkills) {
        const v = s.numericId;
        if (v == null) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
}

function makeNewSkillSkeleton() {
    if (isSubskillsMode()) {
        return {
            id: nextUniqueInternalSkillId(),
            numericId: nextNumericIdForNewSkill(),
            displayName: 'New subskill',
            parentSkillId: null,
            scalingConstants: [],
            description: [],
            skillEffect: []
        };
    }
    return {
        id: nextUniqueInternalSkillId(),
        numericId: nextNumericIdForNewSkill(),
        displayName: 'New skill',
        classId: null,
        tab: null,
        class: null,
        tabName: null,
        tags: [],
        baseMaxLevel: 1,
        affectedBySpecialization: false,
        variants: [],
        scalingConstants: [],
        description: [],
        restriction: [],
        skillEffect: [],
        image: null
    };
}

function addNewSkill() {
    const sk = makeNewSkillSkeleton();
    workingSkills.push(sk);
    invalidateStatUsageCounts();
    setDirty(true);
    refreshEditorTableView();
    openEditView(workingSkills.length - 1);
    showToast('New skill added. Edit fields, Apply, then Download JSON.');
}

function openEditView(index) {
    selectedIndex = index;
    const s = workingSkills[index];
    if (!s) return;
    document.getElementById('list-view').classList.add('is-hidden');
    document.getElementById('edit-view').classList.remove('is-hidden');
    populateForm(s);
    window.scrollTo(0, 0);
}

function closeEditView() {
    document.getElementById('edit-view').classList.add('is-hidden');
    document.getElementById('list-view').classList.remove('is-hidden');
    selectedIndex = -1;
    refreshEditorTableView();
}

/**
 * Build JSON export payload from the working buffer.
 * @returns {{ text: string, basename: string, folderSeg: string }}
 */
export function getEditorExportPayload() {
    const exportSkills = deepClone(workingSkills);
    stripTabSortOrderFromRows(exportSkills);
    normalizeSkillTextFieldsToStringArrays(exportSkills);
    const text = `${JSON.stringify(exportSkills, null, 2)}\n`;
    return { text, basename: editorFileBasename, folderSeg };
}

/** @param {string} msg @param {boolean} [isError] */
export function showEditorToast(msg, isError = false) {
    showToast(msg, isError);
}

function editorBeforeUnload(e) {
    if (dirty) {
        e.preventDefault();
        e.returnValue = '';
    }
}

/**
 * @param {{ syncEditorTableView?: (skills: object[], folder: string) => void, fileBasename?: string }} [opts]
 */
export async function mountEditor(opts = {}) {
    const { downloadSkillsJson } = await import('./editor-download.js');
    syncEditorTableView = typeof opts.syncEditorTableView === 'function' ? opts.syncEditorTableView : null;
    editorFileBasename =
        opts.fileBasename != null && String(opts.fileBasename).trim() !== ''
            ? String(opts.fileBasename).trim()
            : DEFAULT_EDITOR_FILE_BASENAME;
    window.addEventListener('beforeunload', editorBeforeUnload);

    document.getElementById('btn-reload')?.addEventListener('click', async () => {
        if (dirty) {
            const ok = window.confirm('Reload from server and discard in-memory edits?');
            if (!ok) return;
        }
        try {
            await loadSkillsForFolder(folderSeg);
            showToast('Reloaded from server.');
        } catch (e) {
            showToast(e.message || 'Reload failed', true);
        }
    });

    document.getElementById('btn-add-skill')?.addEventListener('click', () => {
        addNewSkill();
    });

    document.getElementById('btn-download')?.addEventListener('click', downloadSkillsJson);
    document.getElementById('btn-download-edit')?.addEventListener('click', downloadSkillsJson);

    document.getElementById('btn-back')?.addEventListener('click', () => closeEditView());

    document.getElementById('btn-apply')?.addEventListener('click', () => {
        if (applyFormToWorkingSkill()) {
            setDirty(true);
            showToast('Changes applied to buffer. Download JSON to save to disk.');
        } else {
            showToast('Fix JSON or field errors before applying.', true);
        }
    });

    document.getElementById('btn-add-variant-row')?.addEventListener('click', () => {
        appendDefaultVariantRowToForm();
    });
    document.getElementById('btn-add-scaling-constant-row')?.addEventListener('click', () => {
        appendDefaultScalingConstantRowToForm();
    });

    document.getElementById('f-description')?.addEventListener('input', () => {
        refreshEditorScalingStatSelect();
    });
    document.getElementById('f-skillEffect')?.addEventListener('input', () => {
        refreshEditorScalingStatSelect();
    });
    document.getElementById('editor-scaling-stat-add')?.addEventListener('change', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLSelectElement)) return;
        const v = t.value;
        if (!v) return;
        appendScalingConstantRowForDescriptionStat(v);
        t.value = '';
    });

    document.getElementById('f-class-select')?.addEventListener('change', onClassSelectChange);
    document.getElementById('f-tab-select')?.addEventListener('change', syncPlacementReadonlyFromSelects);

    const descTa = document.getElementById('f-description');
    const effectTa = document.getElementById('f-skillEffect');
    const restrTa = document.getElementById('f-restriction');
    const textAreas = [descTa, effectTa, restrTa].filter(Boolean);
    if (textAreas.length) {
        attachEditorTextareaAutocomplete(textAreas, {
            getStatsRows: () => statsCatalog,
            getStatUsageCounts,
            getSkillRows: () =>
                [...workingSkills, ...autocompleteSubskills].map((s) => ({
                    id: s.id,
                    displayName: s.displayName,
                    numericId: s.numericId,
                    parentSkillId: s.parentSkillId ?? null
                }))
        });
    }

    try {
        await loadVersionsIntoSelect();
        try {
            const raw = await fetchJson(`${TREE_DATA}/stats.json`);
            statsCatalog = Array.isArray(raw) ? raw : [];
            refreshEditorScalingStatSelect();
        } catch (e) {
            console.warn('Could not load tree_data/stats.json for {{}} autocomplete:', e);
            statsCatalog = [];
            refreshEditorScalingStatSelect();
        }
        const selEl = document.getElementById('version-selector');
        if (!selEl?.value) {
            throw new Error('Version selector not found');
        }
        const parsed = JSON.parse(selEl.value);
        const seg = `${parsed.major}_${parsed.minor}`;
        await loadSkillsForFolder(seg);

        const sel = document.getElementById('version-selector');
        const onEditorVersionChange = async (ev) => {
            const selectedVersion = JSON.parse(ev.target.value);
            const next = `${selectedVersion.major}_${selectedVersion.minor}`;
            if (dirty) {
                const ok = window.confirm('Discard unsaved in-memory changes and load the other version?');
                if (!ok) {
                    ev.target.value = JSON.stringify(parseFolderSegToVersion(folderSeg));
                    return;
                }
            }
            try {
                await loadSkillsForFolder(next);
                showToast(`Loaded ${TREE_DATA}/${next}/skills.json`);
            } catch (err) {
                console.error(err);
                showLoadError(err.message || String(err));
                showToast(err.message || 'Load failed', true);
            }
        };
        if (sel) {
            sel.addEventListener('change', onEditorVersionChange);
            sel._editorVersionChangeHandler = onEditorVersionChange;
        }
    } catch (e) {
        console.error(e);
        showLoadError(e.message || String(e));
        showToast(e.message || 'Load failed', true);
    }
}

export function unmountEditor() {
    window.removeEventListener('beforeunload', editorBeforeUnload);
    syncEditorTableView = null;
    detachVersionSelectorListeners(document.getElementById('version-selector'));
}
