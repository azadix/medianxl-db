// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import SkillCard from '@/components/skills/SkillCard.vue';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';

describe('SkillCard plus guard', () => {
  afterEach(() => {
    setCharacterInstance(null);
    document.body.innerHTML = '';
  });

  it('keeps the plus button enabled when no skill points remain', async () => {
    const character = createCharacterInstance('Amazon', 1);
    setCharacterInstance(character);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(SkillCard, {
      cardData: {
        skillId: 'critical_strike',
        canAllocate: true,
        currentPoints: 0,
        maxPoints: 20,
      },
      plannerRevision: 0,
    });
    app.mount(host);
    await nextTick();
    const button = host.querySelector('.skill-plus-btn');
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
    app.unmount();
  });
});
