/**
 * @file Patch notes search, scroll-to-section, and highlighted result rendering.
 * @module src/composables/usePatchNotesSearch
 */
import { computed, nextTick, ref, watch } from 'vue';
import { marked } from 'marked';
import { highlightSkillNamesInRenderedHtml } from './usePatchNotesData.js';

const MAX_RESULTS = 200;
const SCROLL_TARGET_TOLERANCE = 2;

/**
 * @param {object} opts
 * @param {import('vue').Ref<Array<{ version: string, lines: string[], folderKey: string }>>} opts.patchSections
 * @param {import('vue').Ref<boolean>} opts.isLoading
 * @param {import('vue').Ref<string>} opts.loadError
 * @param {import('vue').Ref<HTMLElement|null>} opts.patchNotesRoot
 * @param {import('vue').Ref<HTMLElement|null>} opts.patchSearchSticky
 * @param {() => void} opts.hideSkillTooltip
 * @returns {object}
 */
export function usePatchNotesSearch({
  patchSections,
  isLoading,
  loadError,
  patchNotesRoot,
  patchSearchSticky,
  hideSkillTooltip,
}) {
  const query = ref('');

  const queryText = computed(() => query.value.trim());
  const loweredQuery = computed(() => queryText.value.toLowerCase());
  const hasQuery = computed(() => queryText.value.length > 0);
  const sectionCardSelector = computed(() => (hasQuery.value ? '.result-card' : '.patch-section'));
  const isSearchDisabled = computed(() => isLoading.value || Boolean(loadError.value));

  watch(queryText, (value) => {
    if (!value) return;
    window.scrollTo(0, 0);
  });

  function getScrollThreshold() {
    const sticky = patchSearchSticky.value;
    if (!sticky) return 0;
    const stickyRect = sticky.getBoundingClientRect();
    return stickyRect.bottom + SCROLL_TARGET_TOLERANCE;
  }

  function scrollElementBelowSticky(element) {
    if (!element) return false;
    const threshold = getScrollThreshold();
    const targetTop = window.scrollY + element.getBoundingClientRect().top - threshold;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    return true;
  }

  function getSectionCards() {
    const root = patchNotesRoot.value;
    if (!root) return [];
    return [...root.querySelectorAll(sectionCardSelector.value)];
  }

  function getCurrentSectionCard(cards) {
    if (!cards.length) return null;
    const threshold = getScrollThreshold();
    let candidate = null;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.top <= threshold) {
        candidate = card;
        continue;
      }
      break;
    }

    if (candidate) return candidate;
    return cards.find((card) => card.getBoundingClientRect().bottom > threshold) || cards[0];
  }

  function jumpToCurrentSectionTop() {
    const cards = getSectionCards();
    const currentCard = getCurrentSectionCard(cards);
    if (scrollElementBelowSticky(currentCard)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderMarkdown(markdownText) {
    return marked.parse(markdownText, { breaks: true, gfm: true });
  }

  function markdownToPlainText(markdownText) {
    const rendered = renderMarkdown(String(markdownText || ''));
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="patch-markdown-root">${rendered}</div>`, 'text/html');
    const root = doc.getElementById('patch-markdown-root');
    const text = root?.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function findTextMatchInElement(rootElement, needleText) {
    const root = rootElement instanceof Element ? rootElement : null;
    const needle = String(needleText || '').trim();
    if (!root || !needle) return null;

    const loweredNeedle = needle.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const raw = node.nodeValue || '';
      const loweredRaw = raw.toLowerCase();
      const start = loweredRaw.indexOf(loweredNeedle);
      if (start !== -1) {
        return { node, start, end: start + needle.length };
      }
      node = walker.nextNode();
    }
    return null;
  }

  function selectTextMatch(textMatch) {
    if (!textMatch?.node) return false;
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.setStart(textMatch.node, textMatch.start);
    range.setEnd(textMatch.node, textMatch.end);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function findPatchSectionByVersion(version) {
    const root = patchNotesRoot.value;
    if (!root) return null;
    const sections = root.querySelectorAll('.patch-section');
    for (const section of sections) {
      if (section.dataset.version === version) return section;
    }
    return null;
  }

  async function jumpToFullPatchSection(version, lineText) {
    if (!version) return;
    const fallbackNeedle = queryText.value;
    const normalizedLine = String(lineText || '').trimStart();
    const lineNeedle = markdownToPlainText(normalizedLine);
    query.value = '';
    hideSkillTooltip();
    await nextTick();

    const targetSection = findPatchSectionByVersion(String(version));
    if (!targetSection) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const details = targetSection.querySelector('.patch-details');
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
    }
    await nextTick();

    const exactLineMatch = findTextMatchInElement(targetSection, lineNeedle);
    if (exactLineMatch) {
      selectTextMatch(exactLineMatch);
      const selectedElement = exactLineMatch.node.parentElement || targetSection;
      if (scrollElementBelowSticky(selectedElement)) return;
    }

    const fallbackQueryMatch = findTextMatchInElement(targetSection, fallbackNeedle);
    if (fallbackQueryMatch) {
      selectTextMatch(fallbackQueryMatch);
      const selectedElement = fallbackQueryMatch.node.parentElement || targetSection;
      if (scrollElementBelowSticky(selectedElement)) return;
    }

    if (scrollElementBelowSticky(targetSection)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const searchableSections = computed(() =>
    patchSections.value.map((section) => ({
      version: section.version,
      folderKey: section.folderKey,
      lines: section.lines.map((line, idx) => ({
        lineNumber: idx + 1,
        text: line,
        localIdx: idx,
      })),
    }))
  );

  function getRangeKey(version, start, end) {
    return `${version}:${start}:${end}`;
  }

  const searchResults = computed(() => {
    if (!hasQuery.value) return { total: 0, shown: 0, cards: [] };

    const cards = [];

    for (const section of searchableSections.value) {
      const hits = section.lines.filter((line) => line.text.toLowerCase().includes(loweredQuery.value));
      if (!hits.length) continue;

      for (const hit of hits) {
        cards.push({
          key: getRangeKey(section.version, hit.localIdx, hit.localIdx),
          version: section.version,
          folderKey: section.folderKey,
          start: hit.localIdx,
          end: hit.localIdx,
          totalLines: section.lines.length,
          lines: [hit],
          matchCount: 1,
        });
      }
    }

    const total = cards.length;
    return {
      total,
      shown: Math.min(total, MAX_RESULTS),
      cards: cards.slice(0, MAX_RESULTS),
    };
  });

  function normalizeSearchLineForMarkdown(lineText) {
    return String(lineText || '').trimStart();
  }

  function highlightRenderedHtml(renderedHtml, needle) {
    const loweredNeedle = String(needle).toLowerCase();
    if (!loweredNeedle) return renderedHtml;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="patch-markdown-root">${renderedHtml}</div>`, 'text/html');
    const root = doc.getElementById('patch-markdown-root');
    if (!root) return renderedHtml;

    const textNodes = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parentTag = node.parentElement?.tagName;
      const raw = node.nodeValue || '';
      if (raw && parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'MARK') {
        textNodes.push(node);
      }
      node = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const raw = textNode.nodeValue || '';
      const loweredRaw = raw.toLowerCase();
      if (!loweredRaw.includes(loweredNeedle)) continue;

      const fragment = doc.createDocumentFragment();
      let cursor = 0;
      let matchIndex = loweredRaw.indexOf(loweredNeedle, cursor);
      while (matchIndex !== -1) {
        if (matchIndex > cursor) {
          fragment.appendChild(doc.createTextNode(raw.slice(cursor, matchIndex)));
        }
        const markEl = doc.createElement('mark');
        markEl.textContent = raw.slice(matchIndex, matchIndex + loweredNeedle.length);
        fragment.appendChild(markEl);
        cursor = matchIndex + loweredNeedle.length;
        matchIndex = loweredRaw.indexOf(loweredNeedle, cursor);
      }
      if (cursor < raw.length) {
        fragment.appendChild(doc.createTextNode(raw.slice(cursor)));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return root.innerHTML;
  }

  function renderSearchMarkdown(lines, needle, folderKey) {
    const source = lines.map((line) => normalizeSearchLineForMarkdown(line.text)).join('\n');
    const rendered = highlightSkillNamesInRenderedHtml(renderMarkdown(source), folderKey);
    if (!needle) return rendered;
    return highlightRenderedHtml(rendered, needle);
  }

  return {
    query,
    queryText,
    hasQuery,
    isSearchDisabled,
    searchResults,
    jumpToCurrentSectionTop,
    jumpToFullPatchSection,
    renderSearchMarkdown,
  };
}
