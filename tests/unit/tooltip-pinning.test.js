/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindLiveTooltip,
  createPinnedHost,
  destroyTooltipPinning,
  initTooltipPinning,
  isTooltipLocked,
  listPinnedHosts,
  maybeAltStickLiveTooltip,
  promoteLiveTooltip,
  refreshPinnedHosts,
  syncTooltipPinPlacement,
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

  it('places the pin on the item tooltip instead of hanging left', () => {
    portal.innerHTML = '<div class="item-tooltip-card tooltip-content">Item</div>';
    updateLiveTooltipBinding(portal, {});
    expect(portal.querySelector(':scope > .tooltip-pin-btn')).toBeTruthy();
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-left')).toBe('');
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-right')).toBe('6px');
  });

  it('offsets the pin onto the item card when a mystic orb panel is present', () => {
    portal.innerHTML =
      '<div class="item-tooltip-layout"><div class="item-tooltip-card tooltip-content">Item</div><aside class="item-tooltip-sidepanel">MO</aside></div>';
    const side = portal.querySelector('.item-tooltip-sidepanel');
    Object.defineProperty(side, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 120,
        height: 80,
        top: 0,
        left: 300,
        right: 420,
        bottom: 80,
        x: 300,
        y: 0,
        toJSON() {},
      }),
    });
    updateLiveTooltipBinding(portal, {});
    expect(portal.querySelectorAll('.tooltip-pin-btn')).toHaveLength(1);
    expect(portal.querySelector(':scope > .tooltip-pin-btn')).toBeTruthy();
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-right')).toBe('134px');
  });

  it('expands socket and mystic orb mods from the section header', () => {
    portal.innerHTML = `<div class="item-tooltip-layout">
      <div class="item-tooltip-card tooltip-content">Item</div>
      <aside class="item-tooltip-sidepanel">
        <div class="item-tooltip-sidepanel__block">
          <button type="button" class="item-tooltip-sidepanel__toggle" aria-expanded="false">Sockets</button>
          <div class="item-tooltip-sock__mods">+5% Cast Speed</div>
        </div>
      </aside>
    </div>`;
    const toggle = portal.querySelector('.item-tooltip-sidepanel__toggle');
    const block = portal.querySelector('.item-tooltip-sidepanel__block');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(block.classList.contains('is-expanded')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(block.classList.contains('is-expanded')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('mounts the skill pin on the main card when SOURCES sits beside it', () => {
    portal.className = 'skill-tooltip';
    portal.innerHTML =
      '<div class="skill-tooltip-panels"><div class="tooltip-content">Skill</div><div class="skill-tooltip-sources">SOURCES</div></div>';
    updateLiveTooltipBinding(portal, {});
    const main = portal.querySelector('.skill-tooltip-panels > .tooltip-content');
    expect(main?.querySelector(':scope > .tooltip-pin-btn')).toBeTruthy();
    expect(portal.querySelector(':scope > .tooltip-pin-btn')).toBeFalsy();
    syncTooltipPinPlacement(portal);
    expect(portal.style.getPropertyValue('--tooltip-pin-inset-left')).toBe('');
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

  it('Alt keydown locks the live tooltip; keyup does not unlock', () => {
    portal.innerHTML = '<div class="tooltip-content">Sticky</div>';
    portal.style.display = 'block';

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipLocked()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('alt');
    expect(listPinnedHosts()[0].el.querySelector('.tooltip-pin-btn.is-locked')).toBeTruthy();
    expect(listPinnedHosts()[0].el.querySelector('.tooltip-pin-btn.is-pinned')).toBeFalsy();
    expect(portal.style.display).toBe('none');

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipLocked()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
  });

  it('Alt locks a nested live tooltip without unlocking the parent', () => {
    portal.innerHTML = '<div class="tooltip-content">Parent</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].el.textContent).toContain('Parent');

    const nestedPortal = document.createElement('div');
    nestedPortal.id = 'skill-tooltip-portal';
    nestedPortal.className = 'skill-tooltip';
    nestedPortal.style.display = 'block';
    nestedPortal.innerHTML = '<div class="tooltip-content">Nested skill</div>';
    document.body.appendChild(nestedPortal);
    bindLiveTooltip(nestedPortal, {
      kind: 'skill',
      getHtml: () => '<div class="tooltip-content">Nested skill</div>',
      meta: { skillId: 'fireball', nested: true },
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(2);
    expect(listPinnedHosts().some((h) => h.el.textContent.includes('Parent'))).toBe(true);
    expect(listPinnedHosts().some((h) => h.el.textContent.includes('Nested skill'))).toBe(true);
    expect(listPinnedHosts().filter((h) => h.mode === 'alt')).toHaveLength(2);
    const nestedHost = listPinnedHosts().find((h) => h.el.textContent.includes('Nested skill'));
    expect(nestedHost?.el.querySelector('.tooltip-pin-btn.is-locked')).toBeTruthy();
  });

  it('Alt pins a nested live tooltip even when the pointer is over the parent host', () => {
    portal.innerHTML = '<div class="tooltip-content">Parent</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    const parent = listPinnedHosts()[0];
    parent.el.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      right: 110,
      bottom: 80,
      width: 100,
      height: 70,
      x: 10,
      y: 10,
      toJSON() {},
    });

    const nestedPortal = document.createElement('div');
    nestedPortal.id = 'skill-tooltip-portal';
    nestedPortal.className = 'skill-tooltip';
    nestedPortal.style.display = 'block';
    nestedPortal.innerHTML = '<div class="tooltip-content">Nested skill</div>';
    document.body.appendChild(nestedPortal);
    bindLiveTooltip(nestedPortal, {
      kind: 'skill',
      getHtml: () => '<div class="tooltip-content">Nested skill</div>',
      meta: { skillId: 'lemures', nested: true },
    });
    nestedPortal.getBoundingClientRect = () => ({
      left: 200,
      top: 40,
      right: 320,
      bottom: 120,
      width: 120,
      height: 80,
      x: 200,
      y: 40,
      toJSON() {},
    });

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 30, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(2);
    expect(listPinnedHosts().some((h) => h.el.textContent.includes('Parent'))).toBe(true);
    expect(listPinnedHosts().some((h) => h.el.textContent.includes('Nested skill'))).toBe(true);
  });

  it('Alt on a re-shown live tooltip unlocks the matching Alt-locked host', () => {
    portal.innerHTML = '<div class="tooltip-content">Sticky</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);

    portal.innerHTML = '<div class="tooltip-content">Sticky</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipLocked()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('second Alt with no live tooltip unlocks the nearest Alt-locked host', () => {
    portal.innerHTML = '<div class="tooltip-content">Sticky</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipLocked()).toBe(false);
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('Alt unlocks only the locked tooltip closest to the pointer', () => {
    const near = createPinnedHost({
      html: '<div class="tooltip-content">Near</div>',
      left: 10,
      top: 10,
      className: 'skill-tooltip',
      kind: 'skill',
      mode: 'alt',
      getHtml: null,
      meta: { skillId: 'near' },
    });
    const far = createPinnedHost({
      html: '<div class="tooltip-content">Far</div>',
      left: 400,
      top: 400,
      className: 'skill-tooltip',
      kind: 'skill',
      mode: 'alt',
      getHtml: null,
      meta: { skillId: 'far' },
    });
    near.el.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      right: 110,
      bottom: 60,
      width: 100,
      height: 50,
      x: 10,
      y: 10,
      toJSON() {},
    });
    far.el.getBoundingClientRect = () => ({
      left: 400,
      top: 400,
      right: 500,
      bottom: 450,
      width: 100,
      height: 50,
      x: 400,
      y: 400,
      toJSON() {},
    });

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].el.textContent).toContain('Far');
    expect(isTooltipLocked()).toBe(true);
  });

  it('Escape unlocks Alt-locked hosts and keeps permanent pins', () => {
    portal.innerHTML = '<div class="tooltip-content">Keep</div>';
    portal.style.display = 'block';
    promoteLiveTooltip(portal, 'pin');

    portal.innerHTML = '<div class="tooltip-content">Locked</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('pin');
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

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(0);
  });

  it('Alt lock works across multiple press cycles', () => {
    for (let i = 0; i < 3; i += 1) {
      portal.innerHTML = `<div class="tooltip-content">Cycle ${i}</div>`;
      portal.style.display = 'block';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
      expect(listPinnedHosts()).toHaveLength(1);
      expect(listPinnedHosts()[0].el.textContent).toContain(`Cycle ${i}`);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
      expect(isTooltipLocked()).toBe(false);
      expect(listPinnedHosts()).toHaveLength(0);
    }
  });

  it('mouse move without Alt does not unlock', () => {
    portal.innerHTML = '<div class="tooltip-content">Stay</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    expect(isTooltipLocked()).toBe(true);
    document.dispatchEvent(new MouseEvent('mousemove', { altKey: false, bubbles: true }));
    expect(isTooltipLocked()).toBe(true);
    expect(listPinnedHosts()).toHaveLength(1);
  });

  it('keeps permanent pins when Alt-locked hosts are released', () => {
    portal.innerHTML = '<div class="tooltip-content">Keep</div>';
    portal.style.display = 'block';
    promoteLiveTooltip(portal, 'pin');

    portal.innerHTML = '<div class="tooltip-content">Locked</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('pin');
  });

  it('maybeAltStickLiveTooltip locks a visible live tooltip', () => {
    portal.innerHTML = '<div class="tooltip-content">Later</div>';
    portal.style.display = 'block';
    expect(maybeAltStickLiveTooltip(portal)).toBe(true);
    expect(listPinnedHosts().some((h) => h.mode === 'alt')).toBe(true);
  });

  it('pin click on a locked host unpins it', () => {
    portal.innerHTML = '<div class="tooltip-content">Lock then unpin</div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    const host = listPinnedHosts()[0];
    expect(host.mode).toBe('alt');
    expect(host.el.querySelector('.tooltip-pin-btn.is-locked')).toBeTruthy();
    const btn = host.el.querySelector('.tooltip-pin-btn');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(listPinnedHosts()).toHaveLength(0);
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

  it('pin click on a live tooltip pins it in one step', () => {
    portal.innerHTML = '<div class="tooltip-content">Open pin</div>';
    portal.style.display = 'block';
    updateLiveTooltipBinding(portal, {});
    const btn = portal.querySelector('.tooltip-pin-btn');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].mode).toBe('pin');
    expect(portal.style.display).toBe('none');
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

  it('nested skill hover works in the item inspector panel', async () => {
    const { setNestedSkillTooltipHandlers } = await import('@/shared/tooltip-pinning.js');
    /** @type {string[]} */
    const shown = [];
    setNestedSkillTooltipHandlers({
      showSkill: (id) => {
        shown.push(id);
      },
    });
    const panel = document.createElement('div');
    panel.className = 'item-detail-panel';
    panel.innerHTML =
      '<span class="js-nested-tooltip-skill" data-tooltip-skill-id="searing_glow">Searing Glow</span>';
    document.body.appendChild(panel);
    const skillEl = panel.querySelector('[data-tooltip-skill-id="searing_glow"]');
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 8, clientY: 8 }));
    expect(shown).toEqual(['searing_glow']);
  });

  it('nested skill hover works on the skills page detail host', async () => {
    const { setNestedSkillTooltipHandlers } = await import('@/shared/tooltip-pinning.js');
    /** @type {string[]} */
    const shown = [];
    setNestedSkillTooltipHandlers({
      showSkill: (id) => {
        shown.push(id);
      },
    });
    const host = document.createElement('div');
    host.className = 'home-skill-detail-host';
    host.innerHTML =
      '<span class="js-nested-tooltip-skill" data-tooltip-skill-id="blood_thorns">Blood Thorns</span>';
    document.body.appendChild(host);
    const skillEl = host.querySelector('[data-tooltip-skill-id="blood_thorns"]');
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 8, clientY: 8 }));
    expect(shown).toEqual(['blood_thorns']);
  });

  it('nested skill hover on a live unlocked tooltip does not show', async () => {
    const { setNestedSkillTooltipHandlers } = await import('@/shared/tooltip-pinning.js');
    /** @type {string[]} */
    const shown = [];
    setNestedSkillTooltipHandlers({
      showSkill: (id) => {
        shown.push(id);
      },
    });
    portal.innerHTML =
      '<div class="tooltip-content"><span class="js-nested-tooltip-skill" data-tooltip-skill-id="fireball">Fireball</span></div>';
    portal.style.display = 'block';
    const skillEl = portal.querySelector('[data-tooltip-skill-id="fireball"]');
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 8, clientY: 8 }));
    expect(shown).toEqual([]);
  });

  it('nested skill hover works on an Alt-locked host', async () => {
    const { setNestedSkillTooltipHandlers } = await import('@/shared/tooltip-pinning.js');
    /** @type {string[]} */
    const shown = [];
    setNestedSkillTooltipHandlers({
      showSkill: (id) => {
        shown.push(id);
      },
    });
    portal.innerHTML =
      '<div class="tooltip-content"><span class="js-nested-tooltip-skill" data-tooltip-skill-id="fireball">Fireball</span></div>';
    portal.style.display = 'block';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    const host = listPinnedHosts()[0];
    const skillEl = host.el.querySelector('[data-tooltip-skill-id="fireball"]');
    skillEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 8, clientY: 8 }));
    expect(shown).toEqual(['fireball']);
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
