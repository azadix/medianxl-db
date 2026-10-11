/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindLiveTooltip,
  createPinnedHost,
  destroyTooltipPinning,
  initTooltipPinning,
  isTooltipAltHeld,
  listPinnedHosts,
  maybeAltStickLiveTooltip,
  promoteLiveTooltip,
  refreshPinnedHosts,
  releaseAltStuckHosts,
  shouldSuppressLiveTooltipHide,
  updateLiveTooltipBinding,
} from '@/shared/tooltip-pinning.js';
import { wrapNestedSkillTooltipHtml } from '@/shared/tooltip-html.js';

describe('tooltip pinning', () => {
  /** @type {HTMLElement} */
  let portal;

  beforeEach(() => {
    document.body.innerHTML = '';
    portal = document.createElement('div');
    portal.id = 'item-tooltip-portal';
    portal.className = 'skill-tooltip item-tooltip';
    portal.style.display = 'none';
    document.body.appendChild(portal);
    initTooltipPinning();
    bindLiveTooltip(portal, {
      kind: 'item',
      getHtml: () => '<div class="tooltip-content">Item A</div>',
      meta: { instanceId: 7 },
    });
  });

  afterEach(() => {
    destroyTooltipPinning();
    document.body.innerHTML = '';
  });

  it('wraps nested skill ids for hover targets', () => {
    const html = wrapNestedSkillTooltipHtml('fire_splash', 'Fire Splash', 'has-text-success');
    expect(html).toContain('data-tooltip-skill-id="fire_splash"');
    expect(html).toContain('js-nested-tooltip-skill');
    expect(html).toContain('Fire Splash');
  });

  it('promotes a live tooltip into a permanent pin host', () => {
    portal.innerHTML = '<div class="tooltip-content">Pinned item</div>';
    portal.style.display = 'block';
    portal.style.left = '40px';
    portal.style.top = '60px';

    const host = promoteLiveTooltip(portal, 'pin');
    expect(host).toBeTruthy();
    expect(portal.style.display).toBe('none');
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('pin');
    expect(listPinnedHosts()[0].el.textContent).toContain('Pinned item');
    expect(listPinnedHosts()[0].el.querySelector('.tooltip-pin-btn.is-pinned')).toBeTruthy();
  });

  it('Alt-sticks the live tooltip and releases it when Alt is lifted', () => {
    portal.innerHTML = '<div class="tooltip-content">Sticky</div>';
    portal.style.display = 'block';

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipAltHeld()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('alt');
    expect(shouldSuppressLiveTooltipHide(portal)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipAltHeld()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('dedupes Alt-stuck hosts for the same skill id', () => {
    portal.innerHTML = '<div class="tooltip-content">Fireball</div>';
    portal.style.display = 'block';
    portal.style.left = '10px';
    portal.style.top = '10px';
    updateLiveTooltipBinding(portal, {
      getHtml: () => '<div class="tooltip-content">Fireball</div>',
      meta: { skillId: 'fireball' },
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);

    // Second live present while Alt held should update the same host, not stack.
    portal.innerHTML = '<div class="tooltip-content">Fireball v2</div>';
    portal.style.display = 'block';
    portal.style.left = '40px';
    portal.style.top = '50px';
    updateLiveTooltipBinding(portal, {
      getHtml: () => '<div class="tooltip-content">Fireball v2</div>',
      meta: { skillId: 'fireball' },
    });
    maybeAltStickLiveTooltip(portal);

    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].el.textContent).toContain('Fireball v2');
    expect(listPinnedHosts()[0].meta.skillId).toBe('fireball');

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
  });

  it('Alt-stick works across multiple press cycles', () => {
    for (let i = 0; i < 3; i += 1) {
      portal.innerHTML = `<div class="tooltip-content">Cycle ${i}</div>`;
      portal.style.display = 'block';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
      expect(listPinnedHosts()).toHaveLength(1);
      expect(listPinnedHosts()[0].el.textContent).toContain(`Cycle ${i}`);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
      expect(isTooltipAltHeld()).toBe(false);
      expect(listPinnedHosts()).toHaveLength(0);
    }
  });

  it('heals stuck Alt state from mouse altKey', () => {
    portal.innerHTML = '<div class="tooltip-content">Heal</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipAltHeld()).toBe(true);
    // Simulate swallowed Alt keyup, then a mouse move without Alt.
    document.dispatchEvent(new MouseEvent('mousemove', { altKey: false, bubbles: true }));
    expect(isTooltipAltHeld()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(0);

    portal.innerHTML = '<div class="tooltip-content">Again</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new MouseEvent('mousemove', { altKey: true, bubbles: true }));
    expect(isTooltipAltHeld()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
  });

  it('keeps permanent pins when Alt is released', () => {
    portal.innerHTML = '<div class="tooltip-content">Keep</div>';
    portal.style.display = 'block';
    promoteLiveTooltip(portal, 'pin');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('pin');
  });

  it('maybeAltStickLiveTooltip only sticks while Alt is held', () => {
    portal.innerHTML = '<div class="tooltip-content">Later</div>';
    portal.style.display = 'block';
    expect(maybeAltStickLiveTooltip(portal)).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    // Already stuck by keydown handler; create a fresh live tooltip.
    releaseAltStuckHosts();
    portal.innerHTML = '<div class="tooltip-content">Later</div>';
    portal.style.display = 'block';
    expect(maybeAltStickLiveTooltip(portal)).toBe(true);
    expect(listPinnedHosts().some((h) => h.mode === 'alt')).toBe(true);
  });

  it('refreshes pinned host html from getHtml', async () => {
    let n = 1;
    createPinnedHost({
      html: '<div class="tooltip-content">v1</div>',
      left: 10,
      top: 10,
      className: 'skill-tooltip item-tooltip',
      kind: 'item',
      mode: 'pin',
      getHtml: () => {
        n += 1;
        return `<div class="tooltip-content">v${n}</div>`;
      },
      meta: { instanceId: 1 },
    });
    await refreshPinnedHosts((h) => h.kind === 'item');
    expect(listPinnedHosts()[0].el.textContent).toContain('v2');
  });

  it('unpins when the pin button is clicked', () => {
    portal.innerHTML = '<div class="tooltip-content">X</div>';
    portal.style.display = 'block';
    const host = promoteLiveTooltip(portal, 'pin');
    const btn = host?.el.querySelector('.tooltip-pin-btn');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('allows unlimited nested pin hosts', () => {
    for (let i = 0; i < 5; i += 1) {
      createPinnedHost({
        html: `<div class="tooltip-content">n${i}</div>`,
        left: i * 10,
        top: i * 10,
        className: 'skill-tooltip',
        kind: i % 2 === 0 ? 'item' : 'skill',
        mode: 'pin',
        getHtml: null,
        meta: {},
      });
    }
    expect(listPinnedHosts()).toHaveLength(5);
  });

  it('nested skill leave inside parent pin host clears hover target', async () => {
    const { setNestedSkillTooltipHandlers } = await import('@/shared/tooltip-pinning.js');
    /** @type {string[]} */
    const shown = [];
    let showing = false;
    setNestedSkillTooltipHandlers({
      showSkill: (id) => {
        shown.push(id);
        showing = true;
      },
      hideSkill: () => {
        showing = false;
      },
      isShowing: () => showing,
    });

    const host = createPinnedHost({
      html: `<div class="tooltip-content"><span class="js-nested-tooltip-skill" data-tooltip-skill-id="fireball">Fireball</span></div>`,
      left: 20,
      top: 20,
      className: 'skill-tooltip item-tooltip',
      kind: 'item',
      mode: 'pin',
      getHtml: null,
      meta: {},
    });
    const skillEl = host.el.querySelector('[data-tooltip-skill-id="fireball"]');
    expect(skillEl).toBeTruthy();

    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 40, clientY: 40 }));
    expect(shown).toEqual(['fireball']);

    // Leaving the skill name into the parent pinned tooltip must hide (not stick forever).
    skillEl.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        clientX: 40,
        clientY: 40,
        relatedTarget: host.el,
      })
    );
    expect(showing).toBe(false);

    // Second hover must show again.
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 42, clientY: 42 }));
    expect(shown).toEqual(['fireball', 'fireball']);
  });
});
