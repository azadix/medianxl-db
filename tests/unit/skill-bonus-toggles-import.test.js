import { afterEach, describe, expect, it } from 'vitest';
import Character from '@/character/Character.js';
import { applyLoadedSkillBonusToggles } from '@/character/planner-core.js';
import { setCharacterInstance } from '@/character/planner-instance.js';

afterEach(() => {
  setCharacterInstance(null);
});

describe('applyLoadedSkillBonusToggles', () => {
  it('leaves bonus-toggle skills off when the import has no enable lists', () => {
    const ch = new Character('Amazon', 99);
    ch.skillPoints = { inner_sight: 20 };
    ch.skillUsesPlannerBonusToggle = () => true;
    setCharacterInstance(ch);

    applyLoadedSkillBonusToggles({});

    expect(ch.getEnabledSkillIds()).toEqual([]);
    expect(ch.isSkillDisabled('inner_sight')).toBe(true);
  });

  it('still maps old disabledSkills saves onto enabled ids', () => {
    const ch = new Character('Amazon', 99);
    ch.skillPoints = { inner_sight: 20, dodge: 10 };
    ch.skillUsesPlannerBonusToggle = () => true;
    setCharacterInstance(ch);

    applyLoadedSkillBonusToggles({ disabledSkills: ['dodge'] });

    expect(ch.getEnabledSkillIds()).toEqual(['inner_sight']);
    expect(ch.isSkillDisabled('dodge')).toBe(true);
  });
});
