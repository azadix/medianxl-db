/**
 * @file Shared tooltip pin / Alt-stick / drag / nested-hover helpers.
 * @module shared/tooltip-pinning
 */

import { NESTED_SKILL_ATTR } from '@/shared/tooltip-html.js';

export const TOOLTIP_PIN_ROOT_ID = 'tooltip-pin-root';
export { NESTED_SKILL_ATTR };
export const NESTED_SKILL_SELECTOR = `[${NESTED_SKILL_ATTR}]`;

const PIN_BTN_CLASS = 'tooltip-pin-btn';
const INTERACTIVE_CLASS = 'tooltip-interactive';
const STUCK_CLASS = 'tooltip-stuck';
const PINNED_CLASS = 'tooltip-pinned';
const DRAGGING_CLASS = 'tooltip-dragging';
const PIN_HOST_CLASS = 'tooltip-pin-host';

const PIN_ICON_SVG = `<svg class="tooltip-pin-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M16 3a1 1 0 0 1 .8 1.6l-1.7 2.27 1.45 5.08a1 1 0 0 1-.3.98l-2.05 1.9V21a1 1 0 1 1-2 0v-6.17l-2.05-1.9a1 1 0 0 1-.3-.98l1.45-5.08L8.2 4.6A1 1 0 0 1 9 3h7z"/>
</svg>`;

/** @type {HTMLElement|null} */
let pinRoot = null;
let altHeld = false;
let listenersBound = false;
let nextHostId = 1;

/**
 * @typedef {{
 *   id: number,
 *   el: HTMLElement,
 *   kind: string,
 *   mode: 'alt' | 'pin',
 *   className: string,
 *   getHtml: (() => string|Promise<string>)|null,
 *   meta: Record<string, unknown>,
 * }} PinnedTooltipHost
 */

/** @type {Map<number, PinnedTooltipHost>} */
const hosts = new Map();

/**
 * @typedef {{
 *   portal: HTMLElement,
 *   kind: string,
 *   getHtml: (() => string|Promise<string>)|null,
 *   meta: Record<string, unknown>,
 *   onHideLive: (() => void)|null,
 * }} LiveTooltipBinding
 */

/** @type {WeakMap<HTMLElement, LiveTooltipBinding>} */
const liveBindings = new WeakMap();

/**
 * @typedef {{
 *   showSkill: (skillId: string, clientX: number, clientY: number, fromEl: HTMLElement) => void|Promise<void>,
 *   moveSkill?: (clientX: number, clientY: number) => void,
 *   hideSkill?: () => void,
 *   isShowing?: () => boolean,
 * }} NestedSkillHandlers
 */

/** @type {NestedSkillHandlers|null} */
let nestedSkillHandlers = null;

/** @type {HTMLElement|null} */
let nestedSkillTarget = null;

/** @type {{ hostId: number, startX: number, startY: number, origLeft: number, origTop: number }|null} */
let dragState = null;

/**
 * @returns {boolean}
 */
export function isTooltipAltHeld() {
  return altHeld;
}

/**
 * @returns {HTMLElement}
 */
export function ensureTooltipPinRoot() {
  if (pinRoot && pinRoot.isConnected) return pinRoot;
  let el = document.getElementById(TOOLTIP_PIN_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOOLTIP_PIN_ROOT_ID;
    el.className = 'tooltip-pin-root';
    document.body.appendChild(el);
  }
  pinRoot = el;
  return el;
}

/**
 * Bind document-level Alt / drag / nested-hover listeners (idempotent).
 */
export function initTooltipPinning() {
  ensureTooltipPinRoot();
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('mousemove', onDocumentMouseMove, true);
  document.addEventListener('mouseup', onDocumentMouseUp, true);
  document.addEventListener('click', onDocumentPinClick, true);
  document.addEventListener('mouseover', onNestedSkillOver, true);
  document.addEventListener('mousemove', onNestedSkillMove, true);
  document.addEventListener('mouseout', onNestedSkillOut, true);
}

/**
 * Tear down listeners and pinned hosts.
 */
export function destroyTooltipPinning() {
  releaseAltStuckHosts();
  for (const id of [...hosts.keys()]) {
    removePinnedHost(id);
  }
  if (!listenersBound) return;
  listenersBound = false;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('blur', onWindowBlur);
  document.removeEventListener('mousemove', onDocumentMouseMove, true);
  document.removeEventListener('mouseup', onDocumentMouseUp, true);
  document.removeEventListener('click', onDocumentPinClick, true);
  document.removeEventListener('mouseover', onNestedSkillOver, true);
  document.removeEventListener('mousemove', onNestedSkillMove, true);
  document.removeEventListener('mouseout', onNestedSkillOut, true);
  nestedSkillHandlers = null;
  nestedSkillTarget = null;
  dragState = null;
}

/**
 * @param {NestedSkillHandlers|null} handlers
 */
export function setNestedSkillTooltipHandlers(handlers) {
  nestedSkillHandlers = handlers;
}

/**
 * Register live portal metadata used when pinning / Alt-sticking.
 * @param {HTMLElement} portal
 * @param {{
 *   kind: string,
 *   getHtml?: (() => string|Promise<string>)|null,
 *   meta?: Record<string, unknown>,
 *   onHideLive?: (() => void)|null,
 * }} binding
 */
export function bindLiveTooltip(portal, binding) {
  if (!portal) return;
  liveBindings.set(portal, {
    portal,
    kind: String(binding.kind || 'tooltip'),
    getHtml: binding.getHtml || null,
    meta: binding.meta && typeof binding.meta === 'object' ? binding.meta : {},
    onHideLive: binding.onHideLive || null,
  });
  ensurePinButton(portal, { live: true });
}

/**
 * @param {HTMLElement|null|undefined} portal
 * @param {Partial<{ getHtml: (() => string|Promise<string>)|null, meta: Record<string, unknown> }>} patch
 */
export function updateLiveTooltipBinding(portal, patch = {}) {
  if (!portal) return;
  const prev = liveBindings.get(portal);
  if (!prev) return;
  if ('getHtml' in patch) prev.getHtml = patch.getHtml || null;
  if (patch.meta && typeof patch.meta === 'object') {
    prev.meta = { ...prev.meta, ...patch.meta };
  }
  ensurePinButton(portal, { live: true });
}

/**
 * Whether hide should be skipped for a live portal (Alt held, or pointer over pin UI).
 * @param {HTMLElement|null|undefined} portal
 * @returns {boolean}
 */
export function shouldSuppressLiveTooltipHide(portal) {
  if (altHeld) return true;
  if (!portal) return false;
  if (portal.classList.contains(STUCK_CLASS) || portal.classList.contains(PINNED_CLASS)) {
    return true;
  }
  return false;
}

/**
 * If Alt is held and the live tooltip is visible, promote it to an Alt-stuck host.
 * @param {HTMLElement|null|undefined} portal
 * @returns {boolean} true if promoted
 */
export function maybeAltStickLiveTooltip(portal) {
  if (!altHeld || !portal || portal.style.display === 'none') return false;
  if (!portal.innerHTML || !String(portal.innerHTML).trim()) return false;
  promoteLiveTooltip(portal, 'alt');
  return true;
}

/**
 * Promote the live portal contents into a floating host.
 * @param {HTMLElement} portal
 * @param {'alt'|'pin'} mode
 * @returns {PinnedTooltipHost|null}
 */
export function promoteLiveTooltip(portal, mode = 'pin') {
  if (!portal || portal.style.display === 'none') return null;
  const html = portal.innerHTML;
  if (!html || !String(html).trim()) return null;

  const rect = portal.getBoundingClientRect();
  const binding = liveBindings.get(portal);
  const className = portal.className
    .split(/\s+/)
    .filter((c) => c && c !== INTERACTIVE_CLASS && c !== STUCK_CLASS && c !== PINNED_CLASS && c !== DRAGGING_CLASS)
    .join(' ');

  const host = createPinnedHost({
    html,
    left: rect.left,
    top: rect.top,
    className,
    kind: binding?.kind || 'tooltip',
    mode,
    getHtml: binding?.getHtml || null,
    meta: binding?.meta ? { ...binding.meta } : {},
  });

  portal.style.display = 'none';
  portal.innerHTML = '';
  portal.classList.remove(INTERACTIVE_CLASS, STUCK_CLASS, PINNED_CLASS, DRAGGING_CLASS);
  binding?.onHideLive?.();
  return host;
}

/**
 * @param {{
 *   html: string,
 *   left: number,
 *   top: number,
 *   className: string,
 *   kind: string,
 *   mode: 'alt'|'pin',
 *   getHtml?: (() => string|Promise<string>)|null,
 *   meta?: Record<string, unknown>,
 * }} opts
 * @returns {PinnedTooltipHost}
 */
export function createPinnedHost(opts) {
  initTooltipPinning();
  const root = ensureTooltipPinRoot();
  const id = nextHostId++;
  const el = document.createElement('div');
  el.className = `${opts.className || 'skill-tooltip'} ${PIN_HOST_CLASS} ${INTERACTIVE_CLASS} ${
    opts.mode === 'pin' ? PINNED_CLASS : STUCK_CLASS
  }`.trim();
  el.dataset.tooltipPinId = String(id);
  el.dataset.tooltipPinMode = opts.mode;
  el.style.display = 'block';
  el.style.left = `${Math.max(0, opts.left)}px`;
  el.style.top = `${Math.max(0, opts.top)}px`;
  el.innerHTML = opts.html;
  el.setAttribute('aria-hidden', 'false');
  root.appendChild(el);

  /** @type {PinnedTooltipHost} */
  const host = {
    id,
    el,
    kind: String(opts.kind || 'tooltip'),
    mode: opts.mode,
    className: opts.className || 'skill-tooltip',
    getHtml: opts.getHtml || null,
    meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
  };
  hosts.set(id, host);
  ensurePinButton(el, { live: false, hostId: id, pinned: opts.mode === 'pin' });
  bindHostDrag(el, id);
  bumpHostZ(el);
  return host;
}

/**
 * @param {number} id
 */
export function removePinnedHost(id) {
  const host = hosts.get(id);
  if (!host) return;
  hosts.delete(id);
  host.el.remove();
}

/**
 * Remove all Alt-stuck hosts (permanent pins kept).
 */
export function releaseAltStuckHosts() {
  for (const [id, host] of [...hosts.entries()]) {
    if (host.mode === 'alt') removePinnedHost(id);
  }
}

/**
 * Upgrade an Alt-stuck host to a permanent pin.
 * @param {number} id
 */
export function convertHostToPinned(id) {
  const host = hosts.get(id);
  if (!host) return;
  host.mode = 'pin';
  host.el.dataset.tooltipPinMode = 'pin';
  host.el.classList.remove(STUCK_CLASS);
  host.el.classList.add(PINNED_CLASS);
  ensurePinButton(host.el, { live: false, hostId: id, pinned: true });
}

/**
 * Refresh all hosts (and optionally filter by kind / meta).
 * @param {(host: PinnedTooltipHost) => boolean} [predicate]
 * @returns {Promise<void>}
 */
export async function refreshPinnedHosts(predicate) {
  const list = [...hosts.values()].filter((h) => (predicate ? predicate(h) : true));
  await Promise.all(
    list.map(async (host) => {
      if (!host.getHtml) return;
      try {
        const html = await host.getHtml();
        if (!html) {
          removePinnedHost(host.id);
          return;
        }
        host.el.innerHTML = html;
        ensurePinButton(host.el, {
          live: false,
          hostId: host.id,
          pinned: host.mode === 'pin',
        });
        bindHostDrag(host.el, host.id);
      } catch (err) {
        console.warn('Pinned tooltip refresh failed:', err);
      }
    })
  );
}

/**
 * @returns {PinnedTooltipHost[]}
 */
export function listPinnedHosts() {
  return [...hosts.values()];
}

/**
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
function isAltKeyEvent(e) {
  return e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';
}

/**
 * Promote every visible live tooltip portal into an Alt-stuck host.
 */
function stickAllLiveTooltips() {
  document.querySelectorAll('.skill-tooltip:not(.tooltip-pin-host)').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!liveBindings.has(node)) return;
    maybeAltStickLiveTooltip(node);
  });
}

/**
 * Keep Alt state in sync from mouse/keyboard modifiers.
 * Mouse `altKey` heals cases where Alt keyup is swallowed (common on Windows).
 * @param {{ altKey?: boolean }|null|undefined} e
 */
function syncAltFromModifier(e) {
  if (!e || typeof e.altKey !== 'boolean') return;
  if (e.altKey === altHeld) return;
  altHeld = e.altKey;
  if (altHeld) stickAllLiveTooltips();
  else releaseAltStuckHosts();
}

/**
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
  if (!isAltKeyEvent(e) && !e.altKey) return;
  if (e.repeat) return;
  altHeld = true;
  stickAllLiveTooltips();
}

/**
 * @param {KeyboardEvent} e
 */
function onKeyUp(e) {
  if (isAltKeyEvent(e)) {
    altHeld = false;
    releaseAltStuckHosts();
    return;
  }
  // Heal stuck Alt state when modifiers report Alt is no longer down.
  if (altHeld && !e.altKey) {
    altHeld = false;
    releaseAltStuckHosts();
  }
}

function onWindowBlur() {
  if (!altHeld) return;
  altHeld = false;
  releaseAltStuckHosts();
}

/**
 * @param {HTMLElement} el
 * @param {{ live: boolean, hostId?: number, pinned?: boolean }} opts
 */
function ensurePinButton(el, opts) {
  if (!el) return;
  let btn = el.querySelector(`:scope > .${PIN_BTN_CLASS}`);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = PIN_BTN_CLASS;
    btn.innerHTML = PIN_ICON_SVG;
    el.appendChild(btn);
  }
  const pinned = Boolean(opts.pinned);
  const isLive = Boolean(opts.live);
  btn.classList.toggle('is-pinned', pinned);
  btn.dataset.tooltipPinLive = isLive ? '1' : '0';
  if (!isLive && opts.hostId != null) {
    btn.dataset.tooltipPinHostId = String(opts.hostId);
  } else {
    delete btn.dataset.tooltipPinHostId;
  }
  btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  btn.setAttribute('aria-label', pinned ? 'Unpin tooltip' : 'Pin tooltip');
  btn.title = pinned ? 'Unpin' : 'Pin';
  // Keep pin clickable even when the live portal has pointer-events: none.
  btn.style.pointerEvents = 'auto';
}

/**
 * @param {MouseEvent} e
 */
function onDocumentPinClick(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const btn = t.closest(`.${PIN_BTN_CLASS}`);
  if (!btn) return;
  const shell = btn.closest('.skill-tooltip, .tooltip-pin-host');
  if (!(shell instanceof HTMLElement)) return;
  e.preventDefault();
  e.stopPropagation();

  if (btn.dataset.tooltipPinLive === '1') {
    promoteLiveTooltip(shell, 'pin');
    return;
  }
  const hostId = Number(btn.dataset.tooltipPinHostId || shell.dataset.tooltipPinId);
  const host = hosts.get(hostId);
  if (!host) return;
  if (host.mode === 'pin') {
    removePinnedHost(hostId);
    return;
  }
  convertHostToPinned(hostId);
}

/**
 * @param {HTMLElement} el
 * @param {number} hostId
 */
function bindHostDrag(el, hostId) {
  el.onmousedown = (ev) => {
    if (!(ev instanceof MouseEvent)) return;
    if (ev.button !== 0) return;
    const t = ev.target;
    if (t instanceof Element) {
      if (t.closest(`.${PIN_BTN_CLASS}`)) return;
      if (t.closest('a, button, input, textarea, select, label')) return;
      if (t.closest(NESTED_SKILL_SELECTOR)) return;
    }
    const host = hosts.get(hostId);
    if (!host) return;
    ev.preventDefault();
    const rect = el.getBoundingClientRect();
    dragState = {
      hostId,
      startX: ev.clientX,
      startY: ev.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    el.classList.add(DRAGGING_CLASS);
    bumpHostZ(el);
  };
}

/**
 * @param {MouseEvent} e
 */
function onDocumentMouseMove(e) {
  syncAltFromModifier(e);
  if (!dragState) return;
  const host = hosts.get(dragState.hostId);
  if (!host) {
    dragState = null;
    return;
  }
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  host.el.style.left = `${Math.max(0, dragState.origLeft + dx)}px`;
  host.el.style.top = `${Math.max(0, dragState.origTop + dy)}px`;
}

function onDocumentMouseUp() {
  if (!dragState) return;
  const host = hosts.get(dragState.hostId);
  host?.el.classList.remove(DRAGGING_CLASS);
  dragState = null;
}

/**
 * @param {HTMLElement} el
 */
function bumpHostZ(el) {
  const base = 10050;
  let max = base;
  for (const host of hosts.values()) {
    const z = Number.parseInt(host.el.style.zIndex || '', 10);
    if (Number.isFinite(z) && z > max) max = z;
  }
  el.style.zIndex = String(max + 1);
}

/**
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function closestNestedSkill(target) {
  if (!(target instanceof Element)) {
    return target instanceof Node
      ? target.parentElement?.closest(NESTED_SKILL_SELECTOR) || null
      : null;
  }
  return target.closest(NESTED_SKILL_SELECTOR);
}

/**
 * Nested skill links only work from interactive (stuck/pinned) tooltips.
 * @param {HTMLElement} skillEl
 * @returns {boolean}
 */
function isNestedSkillFromInteractiveTooltip(skillEl) {
  const tip = skillEl.closest(`.${PIN_HOST_CLASS}, .${INTERACTIVE_CLASS}, .${STUCK_CLASS}, .${PINNED_CLASS}`);
  return Boolean(tip);
}

/**
 * Live follow portals (not pinned hosts).
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
function isLiveFollowTooltip(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.classList.contains(PIN_HOST_CLASS)) return false;
  return (
    el.id === 'skill-tooltip-portal' ||
    el.id === 'skills-page-skill-tooltip' ||
    el.id === 'patch-note-skill-tooltip-portal' ||
    el.id === 'item-tooltip-portal' ||
    el.id === 'skills-page-item-tooltip' ||
    liveBindings.has(el)
  );
}

/**
 * @param {MouseEvent} e
 */
function onNestedSkillOver(e) {
  const skillEl = closestNestedSkill(e.target);
  if (!skillEl || !isNestedSkillFromInteractiveTooltip(skillEl)) return;
  const skillId = skillEl.getAttribute(NESTED_SKILL_ATTR);
  if (!skillId || !nestedSkillHandlers?.showSkill) return;
  const sameTarget = nestedSkillTarget === skillEl;
  nestedSkillTarget = skillEl;
  // Same link: only skip rebuild when the live tooltip is still visible.
  if (sameTarget && nestedSkillHandlers.isShowing?.()) {
    nestedSkillHandlers.moveSkill?.(e.clientX, e.clientY);
    return;
  }
  void nestedSkillHandlers.showSkill(skillId, e.clientX, e.clientY, skillEl);
}

/**
 * @param {MouseEvent} e
 */
function onNestedSkillMove(e) {
  if (!nestedSkillTarget || !nestedSkillHandlers?.moveSkill) return;
  const skillEl = closestNestedSkill(e.target);
  if (skillEl !== nestedSkillTarget) return;
  nestedSkillHandlers.moveSkill(e.clientX, e.clientY);
}

/**
 * @param {MouseEvent} e
 */
function onNestedSkillOut(e) {
  if (!nestedSkillTarget) return;
  const leaving = closestNestedSkill(e.target);
  if (leaving !== nestedSkillTarget) return;
  const entering = closestNestedSkill(e.relatedTarget);
  if (entering === nestedSkillTarget) return;

  if (e.relatedTarget instanceof Element) {
    // Keep open when moving onto the live skill tooltip chrome (pin button).
    const liveTip = e.relatedTarget.closest('.skill-tooltip');
    if (liveTip && isLiveFollowTooltip(liveTip)) return;
    // Keep open when moving onto a different pinned/stuck tooltip (nested skill host),
    // but not when moving around inside the parent host that contains the skill link.
    const host = e.relatedTarget.closest(`.${PIN_HOST_CLASS}`);
    if (host && !host.contains(nestedSkillTarget)) return;
  }

  nestedSkillTarget = null;
  nestedSkillHandlers?.hideSkill?.();
}
