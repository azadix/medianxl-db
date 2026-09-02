/**
 * Autocomplete for description / skillEffect / restriction when typing {{ (stats), [[ (skills), or << (subskill blocks).
 */

/** @typedef {{ id?: number, key: string, name: string, format?: string }} StatRow */
/** @typedef {{ id: string, displayName?: string|null, parentSkillId?: string|null }} SkillRow */

/**
 * @param {string} textBeforeCursor
 * @returns {{ kind: 'stat', partial: string, tokenStart: number } | { kind: 'skill', partial: string, tokenStart: number } | { kind: 'subskillblock', partial: string, tokenStart: number } | null}
 */
function parseOpenToken(textBeforeCursor) {
    const mStat = textBeforeCursor.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)?$/);
    if (mStat) {
        return {
            kind: 'stat',
            partial: mStat[1] || '',
            tokenStart: textBeforeCursor.length - mStat[0].length
        };
    }
    const mSkill = textBeforeCursor.match(/\[\[([a-zA-Z_][a-zA-Z0-9_]*)?$/);
    if (mSkill) {
        return {
            kind: 'skill',
            partial: mSkill[1] || '',
            tokenStart: textBeforeCursor.length - mSkill[0].length
        };
    }
    const mSubskill = textBeforeCursor.match(/<<([a-zA-Z_][a-zA-Z0-9_]*)?$/);
    if (mSubskill) {
        return {
            kind: 'subskillblock',
            partial: mSubskill[1] || '',
            tokenStart: textBeforeCursor.length - mSubskill[0].length
        };
    }
    return null;
}

/**
 * @param {SkillRow} r
 * @param {string} partial
 */
function skillRefForInsert(r, _partial) {
    return `[[${r.id}]]`;
}

/**
 * @param {SkillRow} r
 * @param {string} partial
 */
function subskillBlockRefForInsert(r, _partial) {
    return `<<${r.id}>>`;
}

/**
 * @param {string} partial
 * @param {() => SkillRow[]} getSkillRows
 */
function filterSkillRows(partial, getSkillRows) {
    const rows = getSkillRows() || [];
    const p = partial.toLowerCase();
    if (!p) {
        return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }
    return rows
        .filter((r) => {
            const id = String(r.id).toLowerCase();
            const dn = String(r.displayName || '').toLowerCase();
            return id.includes(p) || dn.includes(p) || id.startsWith(p);
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * @param {string} partial
 * @param {() => SkillRow[]} getSkillRows
 */
function filterSubskillRows(partial, getSkillRows) {
    const rows = (getSkillRows() || []).filter((r) => r.parentSkillId != null && String(r.parentSkillId).trim() !== '');
    const p = partial.toLowerCase();
    if (!p) {
        return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }
    return rows
        .filter((r) => {
            const id = String(r.id).toLowerCase();
            const dn = String(r.displayName || '').toLowerCase();
            const parent = String(r.parentSkillId || '').toLowerCase();
            return id.includes(p) || dn.includes(p) || parent.includes(p) || id.startsWith(p);
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * @param {StatRow[]} statsRows
 * @param {string} partial
 * @param {() => Record<string, number>} getUsageCounts
 */
function filterStats(statsRows, partial, getUsageCounts) {
    const rows = statsRows || [];
    const counts = getUsageCounts() || {};
    const p = partial.toLowerCase();
    let out;
    if (!p) {
        out = [...rows];
    } else {
        out = rows.filter((s) => {
            const k = String(s.key || '').toLowerCase();
            const n = String(s.name || '').toLowerCase();
            const f = String(s.format || '').toLowerCase();
            return k.includes(p) || k.startsWith(p) || n.includes(p) || f.includes(p);
        });
    }
    out.sort((a, b) => {
        const ka = String(a.key || '').toLowerCase();
        const kb = String(b.key || '').toLowerCase();
        const ca = counts[ka] || 0;
        const cb = counts[kb] || 0;
        if (cb !== ca) return cb - ca;
        return String(a.key).localeCompare(String(b.key));
    });
    return out.slice(0, 200);
}

/**
 * @param {HTMLTextAreaElement[]} textareas
 * @param {{ getStatsRows: () => StatRow[], getStatUsageCounts?: () => Record<string, number>, getSkillRows: () => SkillRow[] }} options
 * @returns {{ destroy: () => void }}
 */
export function attachEditorTextareaAutocomplete(textareas, options) {
    const getStatsRows = options.getStatsRows || (() => []);
    const getStatUsageCounts = options.getStatUsageCounts || (() => ({}));
    const { getSkillRows } = options;

    const root = document.createElement('div');
    root.className = 'editor-token-dropdown';
    root.setAttribute('role', 'listbox');
    root.style.display = 'none';
    root.innerHTML = '<ul class="dropdown-list"></ul>';
    document.body.appendChild(root);
    const list = root.querySelector('.dropdown-list');

    let activeEl = null;
    let parsed = null;
    /** @type {HTMLElement[]} scrollable ancestors that need scroll listeners */
    let scrollParentNodes = [];

    function getSelectableItems() {
        return [...list.querySelectorAll('.dropdown-list-item[data-insert]')];
    }

    function clearActiveHighlight() {
        for (const li of list.querySelectorAll('.dropdown-list-item.is-active')) {
            li.classList.remove('is-active');
        }
    }

    /**
     * @param {number} index
     */
    function setActiveHighlight(index) {
        const items = getSelectableItems();
        clearActiveHighlight();
        if (items.length === 0) return;
        const i = Math.max(0, Math.min(index, items.length - 1));
        const li = items[i];
        li.classList.add('is-active');
        li.scrollIntoView({ block: 'nearest' });
    }

    /** @param {number} delta */
    function moveActiveHighlight(delta) {
        const items = getSelectableItems();
        if (items.length === 0) return;
        let idx = items.findIndex((li) => li.classList.contains('is-active'));
        if (idx < 0) idx = 0;
        idx = (idx + delta + items.length) % items.length;
        setActiveHighlight(idx);
    }

    function detachScrollListeners() {
        for (const node of scrollParentNodes) {
            node.removeEventListener('scroll', repositionIfOpen);
        }
        scrollParentNodes = [];
        window.removeEventListener('scroll', repositionIfOpen);
        window.removeEventListener('resize', repositionIfOpen);
    }

    function attachScrollListeners(el) {
        detachScrollListeners();
        let p = el.parentElement;
        while (p && p !== document.documentElement) {
            const st = getComputedStyle(p);
            if (
                /(auto|scroll|overlay)/.test(st.overflowY) ||
                /(auto|scroll|overlay)/.test(st.overflowX) ||
                /(auto|scroll|overlay)/.test(st.overflow)
            ) {
                p.addEventListener('scroll', repositionIfOpen, { passive: true });
                scrollParentNodes.push(p);
            }
            p = p.parentElement;
        }
        window.addEventListener('scroll', repositionIfOpen, { passive: true });
        window.addEventListener('resize', repositionIfOpen, { passive: true });
    }

    function repositionIfOpen() {
        if (root.style.display === 'none' || !activeEl) return;
        positionBelowActiveField(activeEl);
    }

    function hide() {
        detachScrollListeners();
        root.style.display = 'none';
        list.innerHTML = '';
        activeEl = null;
        parsed = null;
    }

    /**
     * Same approach as legacy edit/edit-autocomplete.js: anchor to the textarea
     * (getBoundingClientRect), not the caret.
     */
    function positionBelowActiveField(el) {
        const rect = el.getBoundingClientRect();
        root.style.position = 'fixed';
        root.style.left = `${rect.left}px`;
        root.style.width = `${rect.width}px`;
        root.style.transform = 'none';
        root.style.zIndex = '10050';
        root.style.overflow = 'visible';
        root.style.display = 'block';

        const gap = 4;
        let top = rect.bottom + gap;
        root.style.top = `${top}px`;
        requestAnimationFrame(() => {
            const h = root.offsetHeight;
            const vh = window.innerHeight;
            if (top + h > vh - 8 && rect.top - h - gap > 8) {
                top = rect.top - h - gap;
                root.style.top = `${top}px`;
            }
        });
    }

    function renderStats(partial) {
        const statsRows = filterStats(getStatsRows(), partial, getStatUsageCounts);
        const counts = getStatUsageCounts() || {};
        list.innerHTML = '';
        if (statsRows.length === 0) {
            const li = document.createElement('li');
            li.className = 'dropdown-list-item empty';
            li.textContent =
                (getStatsRows() || []).length === 0
                    ? 'No stats loaded (tree_data/stats.json)'
                    : 'No matching stats';
            list.appendChild(li);
            return;
        }
        const header = document.createElement('li');
        header.className = 'dropdown-list-header';
        header.innerHTML =
            '<span class="dropdown-header-text">Stats</span><span class="dropdown-header-count"></span>';
        list.appendChild(header);

        for (const s of statsRows) {
            const key = String(s.key || '').trim();
            if (!key) continue;
            const li = document.createElement('li');
            li.className = 'dropdown-list-item editor-stat-item';
            li.dataset.insert = `{{${key}}}`;
            const row = document.createElement('div');
            row.className = 'editor-stat-row';
            const keyEl = document.createElement('div');
            keyEl.className = 'editor-stat-key';
            keyEl.textContent = key;
            const nameEl = document.createElement('div');
            nameEl.className = 'editor-stat-name';
            const cnt = counts[key.toLowerCase()] || 0;
            const baseName = s.name != null ? String(s.name) : '';
            nameEl.textContent = cnt > 0 ? `${baseName} (${cnt})` : baseName;
            const fmtEl = document.createElement('div');
            fmtEl.className = 'editor-stat-format';
            fmtEl.textContent = s.format != null ? String(s.format) : '';
            row.appendChild(keyEl);
            row.appendChild(nameEl);
            row.appendChild(fmtEl);
            li.appendChild(row);
            list.appendChild(li);
        }
        setActiveHighlight(0);
    }

    function renderSkills(partial) {
        const rows = filterSkillRows(partial, getSkillRows);
        list.innerHTML = '';
        if (rows.length === 0) {
            const li = document.createElement('li');
            li.className = 'dropdown-list-item empty';
            li.textContent = 'No matching skills';
            list.appendChild(li);
            return;
        }
        const header = document.createElement('li');
        header.className = 'dropdown-list-header';
        header.innerHTML =
            '<span class="dropdown-header-text">Skills</span><span class="dropdown-header-count"></span>';
        list.appendChild(header);

        for (const r of rows.slice(0, 200)) {
            const li = document.createElement('li');
            li.className = 'dropdown-list-item';
            const id = String(r.id);
            const dn = r.displayName != null && String(r.displayName).trim() !== '' ? String(r.displayName) : '';
            const ref = skillRefForInsert(r, partial);
            li.textContent = dn || id;
            li.dataset.insert = ref;
            list.appendChild(li);
        }
        if (rows.length > 200) {
            const note = document.createElement('li');
            note.className = 'dropdown-list-item empty';
            note.textContent = `…and ${rows.length - 200} more (type to filter)`;
            list.appendChild(note);
        }
        setActiveHighlight(0);
    }

    function refreshDropdown(el) {
        const pos = el.selectionStart ?? 0;
        const textBefore = el.value.slice(0, pos);
        const p = parseOpenToken(textBefore);
        if (!p) {
            hide();
            return;
        }
        activeEl = el;
        parsed = p;
        if (p.kind === 'stat') {
            renderStats(p.partial);
        } else if (p.kind === 'subskillblock') {
            const rows = filterSubskillRows(p.partial, getSkillRows);
            list.innerHTML = '';
            if (rows.length === 0) {
                const li = document.createElement('li');
                li.className = 'dropdown-list-item empty';
                li.textContent = 'No matching subskills';
                list.appendChild(li);
            } else {
                const header = document.createElement('li');
                header.className = 'dropdown-list-header';
                header.innerHTML = '<span class="dropdown-header-text">Subskills</span>';
                list.appendChild(header);
                for (const r of rows.slice(0, 200)) {
                    const li = document.createElement('li');
                    li.className = 'dropdown-list-item';
                    const id = String(r.id);
                    const dn =
                        r.displayName != null && String(r.displayName).trim() !== '' ? String(r.displayName) : '';
                    li.textContent = dn ? `${dn} — ${id}` : id;
                    li.dataset.insert = subskillBlockRefForInsert(r, p.partial);
                    list.appendChild(li);
                }
                if (rows.length > 200) {
                    const note = document.createElement('li');
                    note.className = 'dropdown-list-item empty';
                    note.textContent = `…and ${rows.length - 200} more (type to filter)`;
                    list.appendChild(note);
                }
                setActiveHighlight(0);
            }
        } else {
            renderSkills(p.partial);
        }
        positionBelowActiveField(el);
        attachScrollListeners(el);
    }

    /**
     * If caret is inside an already completed token, replace the trailing
     * token fragment too (prevents duplicating suffix like `a_cost}}`).
     * @param {string} fullText
     * @param {number} caretPos
     * @param {'stat'|'skill'|'subskillblock'} kind
     * @returns {number}
     */
    function computeReplaceEnd(fullText, caretPos, kind) {
        let end = caretPos;
        const bodyRe = kind === 'stat' ? /[a-zA-Z0-9_]/ : /[a-zA-Z0-9_:]/;
        while (end < fullText.length && bodyRe.test(fullText[end])) {
            end += 1;
        }
        const closing = kind === 'stat' ? '}}' : kind === 'subskillblock' ? '>>' : ']]';
        if (fullText.slice(end, end + 2) === closing) {
            end += 2;
        }
        return end;
    }

    function applyInsert(insertText) {
        if (!activeEl || !parsed) return;
        const el = activeEl;
        const pos = el.selectionStart ?? 0;
        const v = el.value;
        const start = parsed.tokenStart;
        const end = computeReplaceEnd(v, pos, parsed.kind);
        const next = v.slice(0, start) + insertText + v.slice(end);
        el.value = next;
        const caret = start + insertText.length;
        el.setSelectionRange(caret, caret);
        el.focus();
        hide();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function onInput(e) {
        const t = e.target;
        if (!(t instanceof HTMLTextAreaElement)) return;
        refreshDropdown(t);
    }

    function onKeyDown(e) {
        if (root.style.display === 'none') return;
        if (e.key === 'Escape') {
            e.preventDefault();
            hide();
            return;
        }
        if (e.key === 'ArrowDown') {
            const items = getSelectableItems();
            if (items.length) {
                e.preventDefault();
                moveActiveHighlight(1);
            }
            return;
        }
        if (e.key === 'ArrowUp') {
            const items = getSelectableItems();
            if (items.length) {
                e.preventDefault();
                moveActiveHighlight(-1);
            }
            return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && root.style.display !== 'none') {
            const active = list.querySelector('.dropdown-list-item[data-insert].is-active');
            const chosen = active || list.querySelector('.dropdown-list-item[data-insert]');
            if (chosen && chosen.dataset.insert) {
                e.preventDefault();
                applyInsert(chosen.dataset.insert);
            }
        }
    }

    list.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const li = e.target.closest('.dropdown-list-item');
        if (li && li.dataset.insert) {
            applyInsert(li.dataset.insert);
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (root.style.display === 'none') return;
        if (root.contains(e.target)) return;
        if (textareas.some((ta) => ta === e.target || ta.contains(e.target))) return;
        hide();
    });

    function onSelectionChange() {
        const ae = document.activeElement;
        if (!textareas.includes(ae)) return;
        refreshDropdown(ae);
    }

    for (const ta of textareas) {
        ta.addEventListener('input', onInput);
        ta.addEventListener('keydown', onKeyDown);
    }
    document.addEventListener('selectionchange', onSelectionChange);

    function destroy() {
        detachScrollListeners();
        for (const ta of textareas) {
            ta.removeEventListener('input', onInput);
            ta.removeEventListener('keydown', onKeyDown);
        }
        document.removeEventListener('selectionchange', onSelectionChange);
        root.remove();
    }

    return { destroy, hide };
}
