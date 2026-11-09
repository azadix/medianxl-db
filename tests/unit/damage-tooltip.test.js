/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DAMAGE_TOOLTIP_PORTAL_ID,
  destroyDamageTooltip,
  hideDamageTooltip,
  initDamageTooltip,
  setDamageTooltipProvider,
  showDamageTooltip,
} from '@/planner/damage-tooltip.js';

describe('damage tooltip', () => {
  afterEach(() => {
    destroyDamageTooltip();
    document.body.innerHTML = '';
  });

  it('shows the provider HTML and pins through the shared pin button', () => {
    initDamageTooltip();
    setDamageTooltipProvider((id) =>
      id === 'attack' ? '<div class="damage-tooltip-body">Attack hit</div>' : ''
    );

    showDamageTooltip('attack', 10, 10);

    const portal = document.getElementById(DAMAGE_TOOLTIP_PORTAL_ID);
    expect(portal).toBeTruthy();
    expect(portal.style.display).toBe('block');
    expect(portal.innerHTML).toContain('Attack hit');
    // bindLiveTooltip adds the standard pin control.
    expect(portal.querySelector('.tooltip-pin-btn')).toBeTruthy();
  });

  it('ignores unknown ids and hides on request', async () => {
    initDamageTooltip();
    setDamageTooltipProvider(() => '');

    showDamageTooltip('missing', 10, 10);
    const portal = document.getElementById(DAMAGE_TOOLTIP_PORTAL_ID);
    expect(portal.style.display).toBe('none');

    setDamageTooltipProvider(() => '<div>Hit</div>');
    showDamageTooltip('attack', 10, 10);
    hideDamageTooltip();
    // Hide is deferred a frame so the pointer can reach the pin button.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(portal.style.display).toBe('none');
  });
});
