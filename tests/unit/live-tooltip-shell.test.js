/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TOOLTIP_OFFSET,
  TOOLTIP_VIEWPORT_MARGIN,
  applyTooltipPosition,
  createLiveTooltipShell,
  getItemTooltipScrollNode,
} from '@/shared/live-tooltip-shell.js';
import {
  destroyTooltipPinning,
  isTooltipLocked,
  listPinnedHosts,
} from '@/shared/tooltip-pinning.js';

describe('live tooltip shell', () => {
  /** @type {HTMLElement} */
  let portal;
  /** @type {ReturnType<typeof createLiveTooltipShell>} */
  let shell;

  beforeEach(() => {
    document.body.innerHTML = '';
    portal = document.createElement('div');
    portal.id = 'test-tooltip-portal';
    portal.className = 'skill-tooltip';
    portal.style.display = 'none';
    document.body.appendChild(portal);
    shell = createLiveTooltipShell({
      portalId: 'test-tooltip-portal',
      kind: 'skill',
      getHtml: () => '<div class="tooltip-content">fresh</div>',
    });
    shell.attach();
  });

  afterEach(() => {
    shell.setNestedHandlers(null);
    shell.detach();
    destroyTooltipPinning();
    document.body.innerHTML = '';
  });

  it('presents html, positions near cursor, and shows pin chrome', () => {
    const ok = shell.present('<div class="tooltip-content">Hello</div>', 40, 50);
    expect(ok).toBe(true);
    expect(shell.isShowing()).toBe(true);
    expect(portal.textContent).toContain('Hello');
    expect(portal.querySelector('.tooltip-pin-btn')).toBeTruthy();
    expect(portal.style.left).toBe(`${40 + TOOLTIP_OFFSET}px`);
    expect(portal.style.top).toBe(`${50 + TOOLTIP_OFFSET}px`);
  });

  it('Alt keydown locks a visible live tooltip; keyup does not unlock', () => {
    shell.present('<div class="tooltip-content">Sticky</div>', 30, 40);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
    expect(isTooltipLocked()).toBe(true);
    expect(shell.isShowing()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('alt');
    expect(listPinnedHosts()[0].el.textContent).toContain('Sticky');

    document.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
    expect(isTooltipLocked()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
  });

  it('deferred hide does not clear a re-presented tooltip', async () => {
    shell.present('<div class="tooltip-content">A</div>', 10, 10);
    shell.hide(false, { deferIfOverPortal: true });
    shell.present('<div class="tooltip-content">B</div>', 20, 20);
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    expect(shell.isShowing()).toBe(true);
    expect(portal.textContent).toContain('B');
  });

  it('places a wide tooltip to the left of the cursor when it would overflow', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    portal.style.width = '220px';
    portal.style.height = '80px';
    Object.defineProperty(portal, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 220,
        height: 80,
        top: 0,
        left: 0,
        right: 220,
        bottom: 80,
        x: 0,
        y: 0,
        toJSON() {},
      }),
    });
    applyTooltipPosition(portal, 360, 40, {
      offset: TOOLTIP_OFFSET,
      viewportMargin: TOOLTIP_VIEWPORT_MARGIN,
    });
    const left = Number.parseFloat(portal.style.left);
    expect(left).toBe(360 - TOOLTIP_OFFSET - 220);
    expect(left).toBeGreaterThanOrEqual(TOOLTIP_VIEWPORT_MARGIN);
  });

  it('does not hang the pin outside the tooltip when SOURCES sits beside it', () => {
    portal.innerHTML =
      '<div class="skill-tooltip-panels"><div class="tooltip-content">Skill</div><div class="skill-tooltip-sources">SOURCES</div></div>';
    applyTooltipPosition(portal, 40, 40);
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-left')).toBe('');
  });

  it('stacks skill+SOURCES panels when the row cannot fit the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    portal.innerHTML =
      '<div class="skill-tooltip-panels"><div class="tooltip-content">Skill</div><div class="skill-tooltip-sources">SOURCES</div></div>';
    const panels = portal.querySelector('.skill-tooltip-panels');
    Object.defineProperty(panels, 'scrollWidth', { configurable: true, value: 500 });
    applyTooltipPosition(portal, 40, 40);
    expect(panels.classList.contains('is-stacked')).toBe(true);
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-left')).toBe('');
  });

  it('force hide clears the live portal', () => {
    shell.present('<div class="tooltip-content">X</div>', 10, 10);
    shell.hide(true);
    expect(shell.isShowing()).toBe(false);
    expect(portal.innerHTML).toBe('');
  });

  it('caps overflowing item tooltips to the viewport and enables scrolling', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    portal.classList.add('item-tooltip');
    portal.innerHTML = '<div class="item-tooltip-card tooltip-content">tall</div>';
    const card = portal.querySelector('.item-tooltip-card');
    Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(portal, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 280,
        height: 176,
        top: 0,
        left: 0,
        right: 280,
        bottom: 176,
        x: 0,
        y: 0,
        toJSON() {},
      }),
    });
    applyTooltipPosition(portal, 40, 80, {
      offset: TOOLTIP_OFFSET,
      viewportMargin: TOOLTIP_VIEWPORT_MARGIN,
    });
    const maxH = 200 - TOOLTIP_VIEWPORT_MARGIN * 2;
    expect(portal.style.getPropertyValue('--tooltip-max-height')).toBe(`${maxH}px`);
    expect(portal.classList.contains('tooltip-overflow')).toBe(true);
    expect(Number.parseFloat(portal.style.top)).toBe(TOOLTIP_VIEWPORT_MARGIN);
    expect(getItemTooltipScrollNode(portal)).toBe(card);
  });

  it('scrolls the item card instead of the mystic orb layout', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    portal.classList.add('item-tooltip');
    portal.innerHTML =
      '<div class="item-tooltip-layout"><div class="item-tooltip-card tooltip-content">tall</div><aside class="item-tooltip-sidepanel">MO</aside></div>';
    const card = portal.querySelector('.item-tooltip-card');
    const layout = portal.querySelector('.item-tooltip-layout');
    Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(layout, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(portal, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 420,
        height: 176,
        top: 0,
        left: 0,
        right: 420,
        bottom: 176,
        x: 0,
        y: 0,
        toJSON() {},
      }),
    });
    applyTooltipPosition(portal, 40, 80, {
      offset: TOOLTIP_OFFSET,
      viewportMargin: TOOLTIP_VIEWPORT_MARGIN,
    });
    expect(getItemTooltipScrollNode(portal)).toBe(card);
    expect(getItemTooltipScrollNode(portal)).not.toBe(layout);
    expect(portal.classList.contains('tooltip-overflow')).toBe(true);
  });

  it('clamps position inside the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    portal.style.width = '180px';
    portal.style.height = '180px';
    // Force layout size for getBoundingClientRect in jsdom via explicit styles.
    applyTooltipPosition(portal, 190, 190, {
      offset: TOOLTIP_OFFSET,
      viewportMargin: TOOLTIP_VIEWPORT_MARGIN,
    });
    const left = Number.parseFloat(portal.style.left);
    const top = Number.parseFloat(portal.style.top);
    expect(left).toBeGreaterThanOrEqual(TOOLTIP_VIEWPORT_MARGIN);
    expect(top).toBeGreaterThanOrEqual(TOOLTIP_VIEWPORT_MARGIN);
    expect(left).toBeLessThanOrEqual(200 - TOOLTIP_VIEWPORT_MARGIN);
    expect(top).toBeLessThanOrEqual(200 - TOOLTIP_VIEWPORT_MARGIN);
  });

  it('sets and clears nested handlers', () => {
    /** @type {string[]} */
    const shown = [];
    shell.setNestedHandlers({
      showSkill: (id) => {
        shown.push(id);
      },
      isShowing: () => shell.isShowing(),
    });

    const host = document.createElement('div');
    host.className = 'skill-tooltip tooltip-pin-host tooltip-pinned';
    host.innerHTML =
      '<span class="js-nested-tooltip-skill" data-tooltip-skill-id="fireball">Fireball</span>';
    document.body.appendChild(host);
    const skillEl = host.querySelector('[data-tooltip-skill-id="fireball"]');
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 5 }));
    expect(shown).toEqual(['fireball']);

    shell.setNestedHandlers(null);
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 6, clientY: 6 }));
    expect(shown).toEqual(['fireball']);
  });

  it('updateContent refreshes html without clearing display', () => {
    shell.present('<div class="tooltip-content">v1</div>', 12, 12);
    expect(shell.updateContent('<div class="tooltip-content">v2</div>')).toBe(true);
    expect(shell.isShowing()).toBe(true);
    expect(portal.textContent).toContain('v2');
    expect(portal.querySelector('.tooltip-pin-btn')).toBeTruthy();
  });
});
