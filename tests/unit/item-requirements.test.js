/**
 * @file Tests for effective item requirements (Requirements -%).
 */
import { describe, expect, it } from 'vitest';
import {
  characterMeetsItemRequirements,
  extrasWithMysticOrbRequiredLevel,
  formatItemRequirementsLine,
  parseRequiredLevelBonus,
  parseRequirementsReductionPct,
  itemAllowsMysticOrbReqLevel,
  itemRequirementsExceedCharacterLevel,
  requiredLevelExceedsCharacter,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import { overlayAffixRollKey } from '@/items/item-overlays.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { loadCorruptionsCatalog } from '@/items/corruptions.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadMysticOrbsCatalog(
  JSON.parse(readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8'))
);
loadCorruptionsCatalog(
  JSON.parse(readFileSync(resolve('public/items/2_14/corruptions.json'), 'utf8'))
);

describe('parseRequirementsReductionPct', () => {
  it('parses flat Requirements -N%', () => {
    expect(parseRequirementsReductionPct('Requirements -20%')).toBe(20);
    expect(parseRequirementsReductionPct('Requirements -50%')).toBe(50);
  });

  it('treats Requirements +N% as a requirement increase', () => {
    expect(parseRequirementsReductionPct('Requirements +21%')).toBe(-21);
  });

  it('parses Requirements Reduced by N%', () => {
    expect(parseRequirementsReductionPct('Requirements Reduced by 15%')).toBe(15);
  });

  it('uses the midpoint of an unresolved range', () => {
    expect(parseRequirementsReductionPct('Requirements -(40 to 50)%')).toBe(45);
  });

  it('ignores unrelated reduced-by lines', () => {
    expect(parseRequirementsReductionPct('Physical Damage Taken Reduced by 20')).toBe(0);
    expect(parseRequirementsReductionPct('+20% Enhanced Defense')).toBe(0);
  });
});

describe('parseRequiredLevelBonus', () => {
  it('parses mystic-orb required level bonuses', () => {
    expect(parseRequiredLevelBonus('+40 Required Level')).toBe(40);
    expect(parseRequiredLevelBonus('40 Required Level')).toBe(40);
    expect(parseRequiredLevelBonus('-5 Required Level')).toBe(-5);
    expect(parseRequiredLevelBonus('+10 to Strength')).toBe(0);
  });
});

describe('resolveItemRequirements', () => {
  it('uses catalog reqs when there is no reduction', () => {
    expect(
      resolveItemRequirements({
        reqLevel: 90,
        reqStr: 460,
        reqDex: 0,
      })
    ).toEqual({ reqLevel: 90, reqStr: 460, reqDex: 0, reductionPct: 0 });
  });

  it('applies occult effigy required-level and Requirements +%', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 90, reqStr: 100, reqDex: 0 },
        { mysticOrbs: [[1, 'Sigil of Absolution']] }
      )
    ).toEqual({ reqLevel: 85, reqStr: 125, reqDex: 0, reductionPct: -25 });
  });

  it('blocks Sigil of Absolution when required level is below 5', () => {
    const def = { reqLevel: 4, reqStr: 10, reqDex: 0 };
    expect(itemAllowsMysticOrbReqLevel(def, { mysticOrbs: [] }, 'Sigil of Absolution', 1)).toBe(
      false
    );
    expect(
      itemAllowsMysticOrbReqLevel({ reqLevel: 5 }, { mysticOrbs: [] }, 'Sigil of Absolution', 1)
    ).toBe(true);
    expect(
      itemAllowsMysticOrbReqLevel({ reqLevel: 6 }, { mysticOrbs: [] }, 'Sigil of Absolution', 2)
    ).toBe(false);
  });

  it('reduces str and dex from Requirements -% on a unique', () => {
    expect(
      resolveItemRequirements({
        rarity: 'unique',
        baseId: 'base',
        reqLevel: 90,
        reqStr: 460,
        reqDex: 100,
        modifiers: ['Requirements -20%'],
      })
    ).toEqual({ reqLevel: 90, reqStr: 368, reqDex: 80, reductionPct: 20 });
  });

  it('applies a rolled Requirements range', () => {
    const def = {
      rarity: 'unique',
      baseId: 'base',
      reqStr: 100,
      reqDex: 80,
      reqLevel: 90,
      modifiers: ['Requirements -(40 to 50)%'],
    };
    const key = overlayAffixRollKey('base:m0', 0);
    expect(resolveItemRequirements(def, { rolls: { [key]: 40 } })).toEqual({
      reqLevel: 90,
      reqStr: 60,
      reqDex: 48,
      reductionPct: 40,
    });
  });

  it('raises level from socketables and stacks extra reduction', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 12, reqStr: 100, reqDex: 50 },
        {
          socketables: [
            { reqLevel: 25, modifiers: ['Requirements -10%'] },
            { reductionPct: 5 },
          ],
        }
      )
    ).toEqual({ reqLevel: 25, reqStr: 85, reqDex: 42, reductionPct: 15 });
  });

  it('adds +Required Level from modifiers and can raise Requirements +%', () => {
    expect(
      resolveItemRequirements({
        rarity: 'rare',
        customQuality: 'rare',
        baseId: 'rin',
        reqLevel: 0,
        reqStr: 100,
        modifiers: ['+40 Required Level', 'Requirements +20%'],
      })
    ).toEqual({ reqLevel: 40, reqStr: 120, reqDex: 0, reductionPct: -20 });
  });

  it('applies +Required Level and Requirements -% from instance extras', () => {
    expect(
      resolveItemRequirements(
        {
          rarity: 'unique',
          baseId: 'base',
          reqLevel: 100,
          reqStr: 770,
          reqDex: 0,
          modifiers: ['+(172 to 200)% Enhanced Defense'],
        },
        {
          extras: ['+35 Required Level', 'Requirements -5%'],
        }
      )
    ).toEqual({ reqLevel: 135, reqStr: 731, reqDex: 0, reductionPct: 5 });
  });

  it('applies +Required Level after socket-raised req', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 80, reqStr: 100 },
        {
          socketables: [{ reqLevel: 100, modifiers: ['+3% to Spell Damage'] }],
          extras: ['+20 Required Level'],
        }
      )
    ).toEqual({ reqLevel: 120, reqStr: 100, reqDex: 0, reductionPct: 0 });
  });

  it('adds mystic orb required level after sockets when extras omit the line', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 80 },
        {
          socketables: [{ reqLevel: 100 }],
          mysticOrbs: [
            [5, 'MO - Total Char Defense'],
            [1, 'Weight of Talent'],
          ],
        }
      ).reqLevel
    ).toBe(135);
  });

  it('does not double mystic orb required level when extras already list it', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 100 },
        {
          extras: ['+35 Required Level'],
          mysticOrbs: [
            [5, 'MO - Total Char Defense'],
            [1, 'Weight of Talent'],
          ],
        }
      ).reqLevel
    ).toBe(135);
  });

  it('adds required level from applied corruptions', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 90, reqStr: 100 },
        { corruptions: ['avoidDamage', 'nothing'] }
      ).reqLevel
    ).toBe(91);
  });

  it('keeps TSW final strength when reqStrFinal is set', () => {
    expect(
      resolveItemRequirements({
        rarity: 'crafted',
        customQuality: 'crafted',
        baseId: 'cap',
        reqLevel: 30,
        reqStr: 495,
        reqStrFinal: true,
        modifiers: ['Requirements -10%', '+20 Required Level'],
      })
    ).toEqual({ reqLevel: 50, reqStr: 495, reqDex: 0, reductionPct: 10 });
  });
});

describe('extrasWithMysticOrbRequiredLevel', () => {
  it('synthesizes a required-level line from mystic orbs', () => {
    expect(extrasWithMysticOrbRequiredLevel([], [[5, 'MO - Strength']])).toEqual([
      '+20 Required Level',
    ]);
    expect(extrasWithMysticOrbRequiredLevel([], [[1, 'Sigil of Absolution']])).toEqual([
      '-5 Required Level',
    ]);
  });
});

describe('requiredLevelExceedsCharacter', () => {
  it('is true only when req is above a known character level', () => {
    expect(requiredLevelExceedsCharacter(100, 90)).toBe(true);
    expect(requiredLevelExceedsCharacter(90, 90)).toBe(false);
    expect(requiredLevelExceedsCharacter(100, null)).toBe(false);
  });
});

describe('itemRequirementsExceedCharacterLevel', () => {
  it('counts mystic orb required-level stacks against character level', () => {
    const def = { name: 'Alnair', reqLevel: 100 };
    expect(
      itemRequirementsExceedCharacterLevel(def, { mysticOrbs: [[1, 'MO - Attack Speed']] }, 150)
    ).toBe(false);
    expect(
      itemRequirementsExceedCharacterLevel(
        def,
        {
          mysticOrbs: [
            [1, 'MO - Attack Speed'],
            [1, 'Ten Pin Striker'],
            [2, 'MO - IED'],
            [2, "Marksman's Eye"],
            [1, 'Apple of Discord 2'],
          ],
        },
        150
      )
    ).toBe(true);
  });
});

describe('formatItemRequirementsLine', () => {
  it('joins present reqs into one line', () => {
    expect(
      formatItemRequirementsLine({ reqLevel: 90, reqStr: 368, reqDex: 0, reductionPct: 20 })
    ).toBe('Requires: Level 90, 368 Strength');
    expect(
      formatItemRequirementsLine({ reqLevel: 0, reqStr: 0, reqDex: 60, reductionPct: 0 })
    ).toBe('Requires: 60 Dexterity');
    expect(formatItemRequirementsLine({ reqLevel: 0, reqStr: 0, reqDex: 0, reductionPct: 0 })).toBe(
      ''
    );
  });
});

describe('characterMeetsItemRequirements', () => {
  const reqs = { reqLevel: 30, reqStr: 100, reqDex: 50, reductionPct: 0 };

  it('passes when level str and dex are sufficient', () => {
    expect(
      characterMeetsItemRequirements(reqs, { level: 30, strength: 100, dexterity: 50 })
    ).toBe(true);
  });

  it('fails when any requirement is unmet or missing', () => {
    expect(
      characterMeetsItemRequirements(reqs, { level: 29, strength: 100, dexterity: 50 })
    ).toBe(false);
    expect(
      characterMeetsItemRequirements(reqs, { level: 30, strength: 99, dexterity: 50 })
    ).toBe(false);
    expect(
      characterMeetsItemRequirements(reqs, { level: 30, strength: 100, dexterity: 49 })
    ).toBe(false);
    expect(characterMeetsItemRequirements(reqs, { level: 99 })).toBe(false);
  });
});
