// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import SkillCard from '@/components/skills/SkillCard.vue';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';

/**
 * @param {object} cardData
 * @returns {Promise<{ app: import('vue').App, host: HTMLDivElement }>}
 */
async function mountCard(cardData) {
  setCharacterInstance(createCharacterInstance('Amazon', 1));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(SkillCard, { cardData, plannerRevision: 0 });
  app.mount(host);
  await nextTick();
  return { app, host };
}

describe('SkillCard plus guard', () => {
  afterEach(() => {
    setCharacterInstance(null);
    document.body.innerHTML = '';
  });

  it('keeps the plus button enabled when no skill points remain', async () => {
    const { app, host } = await mountCard({
      skillId: 'critical_strike',
      canAllocate: true,
      currentPoints: 0,
      maxPoints: 20,
    });
    const button = host.querySelector('.skill-plus-btn');
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
    app.unmount();
  });

  it('does not render the MAX_SAFE_INTEGER sentinel as an oSkill cap', async () => {
    const { app, host } = await mountCard({
      skillId: 'lightning_shield',
      canAllocate: true,
      currentPoints: 0,
      maxPoints: Number.MAX_SAFE_INTEGER,
      unboundedPoints: true,
      tabName: 'oSkill',
    });
    expect(host.textContent).not.toContain('9007199254740991');
    expect(host.textContent).toContain('0');
    app.unmount();
  });

  it('still shows the cap for regular skills', async () => {
    const { app, host } = await mountCard({
      skillId: 'critical_strike',
      canAllocate: true,
      currentPoints: 5,
      maxPoints: 20,
    });
    expect(host.textContent).toContain('5 / 20');
    app.unmount();
  });
});
