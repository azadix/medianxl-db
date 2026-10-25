import { describe, expect, it } from 'vitest';
import {
  parseSkillBonusFromModifierLine,
  skillBonusAmountForContext,
  sumSkillBonusFromModifierLines,
  sumBroadSkillBonusesFromModifierLines,
  sumRelicSkillBonusFromDefs,
  RELIC_ON_TREE_SKILL_BONUS,
} from '@/items/skill-bonus-from-modifiers.js';
import { relicAffixRollKey } from '@/items/relic-items.js';

describe('parseSkillBonusFromModifierLine', () => {
  it('parses all skills', () => {
    expect(parseSkillBonusFromModifierLine('+1 to All Skills')).toEqual({
      kind: 'all',
      amount: 1,
    });
  });

  it('rejects conditional all-skills lines', () => {
    expect(parseSkillBonusFromModifierLine('+1 to All Skills when using an Apple')).toBeNull();
    expect(parseSkillBonusFromModifierLine('{grey}+1 to All Skills')).toBeNull();
  });

  it('parses class skill levels', () => {
    expect(parseSkillBonusFromModifierLine('+1 to Necromancer Skill Levels')).toEqual({
      kind: 'class',
      amount: 1,
      className: 'Necromancer',
    });
  });

  it('parses class-only per-skill lines', () => {
    expect(parseSkillBonusFromModifierLine('+7 to Dream Eater (Necromancer Only)')).toEqual({
      kind: 'skill',
      amount: 7,
      skillName: 'Dream Eater',
      className: 'Necromancer',
    });
  });

  it('parses generic per-skill lines', () => {
    expect(parseSkillBonusFromModifierLine("+15 to Ancients' Hand")).toEqual({
      kind: 'skill',
      amount: 15,
      skillName: "Ancients' Hand",
    });
  });

  it('ignores percent attribute lines', () => {
    expect(parseSkillBonusFromModifierLine('+15% to Summoned Minion Resistances')).toBeNull();
  });

  it('ignores flat life/mana grants', () => {
    expect(parseSkillBonusFromModifierLine('+40 to Life and Mana')).toBeNull();
    expect(parseSkillBonusFromModifierLine('+40 to Life')).toBeNull();
  });
});

describe('skillBonusAmountForContext', () => {
  const dreamCtx = {
    displayName: 'Dream Eater',
    className: 'Necromancer',
    skillClass: 'Necromancer',
    isOSkill: false,
  };

  it('applies all-skills always', () => {
    expect(skillBonusAmountForContext({ kind: 'all', amount: 1 }, dreamCtx)).toBe(1);
  });

  it('applies class skills only when class matches and not oSkill', () => {
    const parsed = { kind: 'class', amount: 1, className: 'Necromancer' };
    expect(skillBonusAmountForContext(parsed, dreamCtx)).toBe(1);
    expect(skillBonusAmountForContext(parsed, { ...dreamCtx, isOSkill: true })).toBe(0);
    expect(skillBonusAmountForContext(parsed, { ...dreamCtx, className: 'Amazon' })).toBe(0);
  });

  it('applies class-only skill lines only when class and name match', () => {
    const parsed = {
      kind: 'skill',
      amount: 7,
      skillName: 'Dream Eater',
      className: 'Necromancer',
    };
    expect(skillBonusAmountForContext(parsed, dreamCtx)).toBe(7);
    expect(skillBonusAmountForContext(parsed, { ...dreamCtx, className: 'Amazon' })).toBe(0);
  });

  it('keeps Class Only amount above the relic on-tree +3 cap', () => {
    const parsed = {
      kind: 'skill',
      amount: 5,
      skillName: 'Noctule',
      className: 'Assassin',
    };
    expect(
      skillBonusAmountForContext(parsed, {
        displayName: 'Noctule',
        className: 'Assassin',
        skillClass: 'Assassin',
        isOSkill: false,
      })
    ).toBe(5);
  });

  it('uses flat +3 for generic skill lines when skill is on the character tree', () => {
    const parsed = { kind: 'skill', amount: 25, skillName: 'Ecstatic Frenzy' };
    expect(
      skillBonusAmountForContext(parsed, {
        displayName: 'Ecstatic Frenzy',
        className: 'Amazon',
        skillClass: 'Amazon',
        isOSkill: false,
      })
    ).toBe(RELIC_ON_TREE_SKILL_BONUS);
  });

  it('skips generic skill lines for oSkills (itemPoints handle the slvl grant)', () => {
    const parsed = { kind: 'skill', amount: 25, skillName: 'Ecstatic Frenzy' };
    expect(
      skillBonusAmountForContext(parsed, {
        displayName: 'Ecstatic Frenzy',
        className: 'Barbarian',
        skillClass: 'Amazon',
        isOSkill: true,
      })
    ).toBe(0);
  });
});

describe('sumSkillBonusFromModifierLines / sumRelicSkillBonusFromDefs', () => {
  const dreamEaterRelic = {
    id: 'relic:dream-eater',
    name: 'Relic (Dream Eater)',
    rarity: 'relic',
    keepInInventory: true,
    reqLevel: 75,
    modifiers: [
      '+1 to All Skills',
      '+(5 to 9) to Dream Eater (Necromancer Only)',
      '+(11 to 25) to Dream Eater',
    ],
  };

  const ecstaticFrenzyRelic = {
    id: 'relic:ecstatic-frenzy',
    name: 'Relic (Ecstatic Frenzy)',
    rarity: 'relic',
    keepInInventory: true,
    reqLevel: 75,
    modifiers: [
      '4% Movement Speed',
      '+(21 to 28) to Ecstatic Frenzy',
      '+(10 to 15) Maximum Stamina',
    ],
  };

  const appleRelic = {
    id: 'relic:fake-apple',
    name: 'Relic (Apple)',
    rarity: 'relic',
    keepInInventory: true,
    reqLevel: 1,
    modifiers: ['+1 to All Skills when using an Apple', '+1 to Druid Skill Levels'],
  };

  it('Dream Eater on Necromancer uses Class Only only (no +3 from generic)', () => {
    const classOnlyKey = relicAffixRollKey('base:m1', 0);
    const genericKey = relicAffixRollKey('base:m2', 0);
    const total = sumRelicSkillBonusFromDefs(
      [
        {
          def: dreamEaterRelic,
          rolls: { [classOnlyKey]: 7, [genericKey]: 18 },
        },
      ],
      {
        displayName: 'Dream Eater',
        className: 'Necromancer',
        skillClass: 'Necromancer',
        isOSkill: false,
        characterLevel: 99,
      }
    );
    // Class Only only; +1 all-skills is Overview (not per-skill relic soft)
    expect(total).toBe(7);
  });

  it('Dream Eater as oSkill soft is 0 (all-skills is Overview; generic is itemPoints)', () => {
    const classOnlyKey = relicAffixRollKey('base:m1', 0);
    const genericKey = relicAffixRollKey('base:m2', 0);
    const total = sumRelicSkillBonusFromDefs(
      [
        {
          def: dreamEaterRelic,
          rolls: { [classOnlyKey]: 7, [genericKey]: 18 },
        },
      ],
      {
        displayName: 'Dream Eater',
        className: 'Amazon',
        skillClass: 'Necromancer',
        isOSkill: true,
        characterLevel: 99,
      }
    );
    expect(total).toBe(0);
  });

  it('Ecstatic Frenzy relic as oSkill soft is 0 (grant is itemPoints slvl)', () => {
    const skillKey = relicAffixRollKey('base:m1', 0);
    const total = sumRelicSkillBonusFromDefs(
      [{ def: ecstaticFrenzyRelic, rolls: { [skillKey]: 25 } }],
      {
        displayName: 'Ecstatic Frenzy',
        className: 'Barbarian',
        skillClass: 'Amazon',
        isOSkill: true,
        characterLevel: 99,
      }
    );
    expect(total).toBe(0);
  });

  it('Ecstatic Frenzy relic on Amazon tree uses flat +3', () => {
    const skillKey = relicAffixRollKey('base:m1', 0);
    const total = sumRelicSkillBonusFromDefs(
      [{ def: ecstaticFrenzyRelic, rolls: { [skillKey]: 25 } }],
      {
        displayName: 'Ecstatic Frenzy',
        className: 'Amazon',
        skillClass: 'Amazon',
        isOSkill: false,
        characterLevel: 99,
      }
    );
    expect(total).toBe(RELIC_ON_TREE_SKILL_BONUS);
  });

  it('oSkill soft skips all/class and generic per-skill', () => {
    const lines = ['+1 to All Skills', '+1 to Necromancer Skill Levels', '+5 to Dream Eater'];
    expect(
      sumSkillBonusFromModifierLines(lines, {
        displayName: 'Dream Eater',
        className: 'Necromancer',
        skillClass: 'Necromancer',
        isOSkill: true,
      })
    ).toBe(0);
  });

  it('skips conditional Apple all-skills; class skills are Overview not soft', () => {
    const total = sumRelicSkillBonusFromDefs([{ def: appleRelic, rolls: null }], {
      displayName: 'Fury',
      className: 'Druid',
      skillClass: 'Druid',
      isOSkill: false,
      characterLevel: 99,
    });
    expect(total).toBe(0);
    expect(
      sumBroadSkillBonusesFromModifierLines(appleRelic.modifiers, 'Druid')
    ).toEqual({ all: 0, class: 1 });
  });

  it('returns 0 when relic level req is not met', () => {
    const total = sumRelicSkillBonusFromDefs([{ def: dreamEaterRelic, rolls: null }], {
      displayName: 'Dream Eater',
      className: 'Necromancer',
      skillClass: 'Necromancer',
      isOSkill: false,
      characterLevel: 50,
    });
    expect(total).toBe(0);
  });

  it('Wychwind +1 Assassin Skill Levels is broad/Overview, not per-skill relic soft', () => {
    const wychwindRelic = {
      id: 'relic:wychwind',
      name: 'Relic (Wychwind)',
      rarity: 'relic',
      keepInInventory: true,
      reqLevel: 75,
      modifiers: [
        '{orange}+5% physical resistance during wychwind vulnerability',
        '+1 to Assassin Skill Levels',
        '+(9 to 17) to Wychwind',
      ],
    };
    expect(
      sumBroadSkillBonusesFromModifierLines(wychwindRelic.modifiers, 'Assassin')
    ).toEqual({ all: 0, class: 1 });
    expect(
      sumRelicSkillBonusFromDefs([{ def: wychwindRelic, rolls: null }], {
        displayName: 'Noctule',
        className: 'Assassin',
        skillClass: 'Assassin',
        isOSkill: false,
        characterLevel: 99,
      })
    ).toBe(0);
  });
});
