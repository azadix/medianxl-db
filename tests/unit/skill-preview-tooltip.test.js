/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSkillPreviewPlayButtonHtml } from '@/shared/tooltip-html.js';
import { destroyTooltipPinning, listPinnedHosts } from '@/shared/tooltip-pinning.js';
import {
  resetSkillPreviewCatalogForTests,
  setSkillPreviewIdsForTests,
} from '@/skills/skill-preview-catalog.js';
import {
  SKILL_PREVIEW_TOOLTIP_ID,
  destroySkillPreviewTooltip,
  initSkillPreviewTooltip,
  isSkillPreviewUiTarget,
} from '@/skills/skill-preview-tooltip.js';

describe('skill preview tooltip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setSkillPreviewIdsForTests(['frozen_crown']);
    const portal = document.createElement('div');
    portal.id = SKILL_PREVIEW_TOOLTIP_ID;
    portal.className = 'skill-tooltip skill-preview-tooltip';
    portal.style.display = 'none';
    document.body.appendChild(portal);
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSkillPreviewPlayButtonHtml('frozen_crown');
    document.body.appendChild(wrap);
    initSkillPreviewTooltip();
  });

  afterEach(() => {
    destroySkillPreviewTooltip();
    destroyTooltipPinning();
    resetSkillPreviewCatalogForTests();
    document.body.innerHTML = '';
  });

  it('shows a scaled gif on play hover and hides when leaving both', () => {
    const play = document.querySelector('.js-skill-preview-play');
    play.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 20, clientY: 20 }));
    const portal = document.getElementById(SKILL_PREVIEW_TOOLTIP_ID);
    expect(portal.style.display).toBe('block');
    const img = portal.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('skill-previews/frozen_crown.webp');
    expect(isSkillPreviewUiTarget(play)).toBe(true);
    expect(isSkillPreviewUiTarget(img)).toBe(true);

    play.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
    );
    expect(portal.style.display).toBe('none');
    expect(portal.querySelector('img')).toBeNull();
  });

  it('keeps the gif open when moving from play onto the preview', () => {
    const play = document.querySelector('.js-skill-preview-play');
    play.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 20, clientY: 20 }));
    const portal = document.getElementById(SKILL_PREVIEW_TOOLTIP_ID);
    const img = portal.querySelector('img');
    play.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: img }));
    expect(portal.style.display).toBe('block');
  });

  it('pins the gif so it keeps playing after hover ends', () => {
    const play = document.querySelector('.js-skill-preview-play');
    play.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 20, clientY: 20 }));
    const portal = document.getElementById(SKILL_PREVIEW_TOOLTIP_ID);
    const pin = portal.querySelector('.tooltip-pin-btn');
    expect(pin).toBeTruthy();
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const hosts = listPinnedHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].mode).toBe('pin');
    expect(hosts[0].el.querySelector('img')?.getAttribute('src')).toContain(
      'skill-previews/frozen_crown.webp'
    );

    play.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
    );
    expect(portal.style.display).toBe('none');
    expect(listPinnedHosts()).toHaveLength(1);
    expect(listPinnedHosts()[0].el.querySelector('img')).toBeTruthy();
  });
});
