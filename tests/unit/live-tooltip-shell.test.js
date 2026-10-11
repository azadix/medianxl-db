/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TOOLTIP_OFFSET,
  TOOLTIP_VIEWPORT_MARGIN,
  applyTooltipPosition,
  createLiveTooltipShell,
} from '@/shared/live-tooltip-shell.js';
import {
  destroyTooltipPinning,
  isTooltipAltHeld,
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

  it('Alt-sticks on present while Alt is held and clears the live portal', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
    expect(isTooltipAltHeld()).toBe(true);

    shell.present('<div class="tooltip-content">Sticky</div>', 30, 40);
    expect(shell.isShowing()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('alt');
    expect(listPinnedHosts()[0].el.textContent).toContain('Sticky');

    document.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('suppresses hide while Alt is held', () => {
    shell.present('<div class="tooltip-content">Keep</div>', 20, 20);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
    // Present while Alt held promotes; show again then try hide.
    portal.innerHTML = '<div class="tooltip-content">Live</div>';
    portal.style.display = 'block';
    shell.hide(false);
    // After Alt stick from keydown, live may already be promoted; force path still works.
    shell.present('<div class="tooltip-content">Again</div>', 25, 25);
    expect(isTooltipAltHeld()).toBe(true);
    // Live was promoted; hide(false) on empty portal is a no-op.
    shell.hide(false);
    expect(listPinnedHosts().some((h) => h.mode === 'alt')).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true })
    );
  });

  it('force hide clears the live portal', () => {
    shell.present('<div class="tooltip-content">X</div>', 10, 10);
    shell.hide(true);
    expect(shell.isShowing()).toBe(false);
    expect(portal.innerHTML).toBe('');
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
