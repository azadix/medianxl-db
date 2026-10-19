import { describe, expect, it } from 'vitest';
import {
  buildSetDumpSkipContext,
  extrasFromTswItem,
  matchAffixTemplate,
  parseTswMysticOrbs,
  rollsFromTswItem,
  tswInstanceExtras,
} from '@/planner/tsw-item-rolls.js';
import { overlayAffixRollKey } from '@/items/item-overlays.js';

describe('tsw item extras', () => {
  const silksDef = {
    id: 'u:silks-of-the-victor:su',
    name: 'Silks of the Victor',
    uniqueKind: 'su',
    rarity: 'unique',
    modifiers: [
      '{orange}Level 10 Nephalem Weapons',
      '{grey}5% Innate Elemental Damage',
      '{grey}Adds Fire and Lightning Damage:',
      '{grey}20-30% of base Strength and Dexterity',
      '{grey}10-15% of base Vitality',
      '+1 to All Skills',
      '+(172 to 200)% Enhanced Defense',
      '+1.125% Enhanced Defense (Based on Character Level)',
      '+(500 to 1000) to Life',
      '-20% Mana Cost of Skills',
    ],
  };

  const silksRow = {
    item: 'Silks of the Victor',
    display_name: 'Silks of the Victor',
    type: 'Ancient Armor (SU) [eth]',
    eth: true,
    mystic_orbs: [
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ],
    description_lines: [
      [['Silks of the Victor', 4]],
      [['Ancient Armor (Sacred)', 4]],
      [['Defense: ', -1], ['22917', 3], [' (4897)', -1]],
      [['Required Level: 135', -1]],
      [['Required Strength: 722', 1]],
      [['Ethereal', 5]],
      [['Corrupted', 1]],
      [['Already Upgraded', 2]],
      [['Level 10 Nephalem Weapons', 8]],
      [['5% Innate Elemental Damage', 5]],
      [['Adds Fire and Lightning Damage:', 5]],
      [['20-30% of base Strength and Dexterity', 5]],
      [['10-15% of base Vitality', 5]],
      [['+2 to All Skills', 3]],
      [['+200% Enhanced Defense', 3]],
      [['+168% Enhanced Defense (Based on Character Level)', 3]],
      [['+1003 to Life', 3]],
      [['-20% Mana Cost of Skills', 3]],
      [['+25% Bonus to Defense', 3]],
      [['Requirements -5%', 3]],
      [['+35 Required Level', 3]],
      [['Socketed (6/6)', 3]],
    ],
  };

  it('parses mystic_orbs tuples', () => {
    expect(parseTswMysticOrbs(silksRow.mystic_orbs)).toEqual([
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ]);
    expect(parseTswMysticOrbs([])).toEqual([]);
    expect(parseTswMysticOrbs(null)).toEqual([]);
  });

  it('keeps socket-boosted life above the catalog roll max', () => {
    expect(matchAffixTemplate('+(500 to 1000) to Life', '+1003 to Life')).toEqual([1003]);
    const rolls = rollsFromTswItem(silksRow, silksDef);
    const lifeKey = overlayAffixRollKey('base:m8', 0);
    expect(rolls[lifeKey]).toBe(1003);
  });

  it('keeps MO / jewel leftovers and skips catalog + boilerplate lines', () => {
    const extras = extrasFromTswItem(silksRow, silksDef);
    expect(extras).toEqual(
      expect.arrayContaining([
        '+25% Bonus to Defense',
        'Requirements -5%',
        '+35 Required Level',
      ])
    );
    expect(extras).not.toEqual(expect.arrayContaining(['+200% Enhanced Defense']));
    expect(extras).not.toEqual(expect.arrayContaining(['Level 10 Nephalem Weapons']));
    expect(extras).not.toEqual(expect.arrayContaining(['Ethereal']));
    expect(extras).not.toEqual(expect.arrayContaining(['Corrupted']));
    expect(extras).not.toEqual(expect.arrayContaining(['Ancient Armor (Sacred)']));
    // Signature-claimed so catalog +1 is not doubled as a full +2 extra line.
    expect(extras).not.toEqual(expect.arrayContaining(['+2 to All Skills']));
  });

  it('does not extra Tyrael flavor or Ethereal when they are catalog lines', () => {
    const def = {
      id: 'u:tyraels-might:su',
      name: "Tyrael's Might",
      uniqueKind: 'su',
      rarity: 'unique',
      ethereal: true,
      modifiers: [
        '50% Movement Speed',
        '+100% Damage to Demons',
        '{orange}Celeri Caelesti Iustitia',
      ],
    };
    const extras = extrasFromTswItem(
      {
        display_name: "Tyrael's Might",
        type: 'Ancient Armor (SSSU) [eth]',
        eth: true,
        description_lines: [
          [["Tyrael's Might", 4]],
          [['Ancient Armor (Sacred)', 4]],
          [['Ethereal', 5]],
          [['+50% Movement Speed', 3]],
          [['Celeri Caelesti Iustitia', 7]],
          [['+20 Required Level', 3]],
        ],
      },
      def
    );
    expect(extras).toEqual(['+20 Required Level']);
  });

  it('skips sacred base label and calculated innate lines for uniques', () => {
    const mekanismDef = {
      id: 'u:mekanism:su',
      name: 'Mekanism',
      baseName: 'Wrist Blade (Sacred)',
      uniqueKind: 'su',
      rarity: 'unique',
      innate: 'Innate Lightning Damage: (62.0% of Dexterity)',
      modifiers: [
        '{orange}Shuriken Flurry: Shurikens deal 150% Weapon Damage',
        '+(4 to 5) to Assassin Skill Levels',
        '15% Chance to cast level 30 Shuriken Flurry on Melee Attack',
        'Adds 160-250 Lightning Damage',
        '-(20 to 30)% to Enemy Elemental Resistances',
        '30% to Dexterity',
        '+400 to Life',
        'Maximum Elemental Resists +1%',
        '+2 Life on Striking',
      ],
    };
    const mekanismRow = {
      item: 'Mekanism',
      display_name: 'Mekanism',
      type: 'Wrist Blade (SSU)',
      description_lines: [
        [['Mekanism', 4]],
        [['Wrist Blade (Sacred)', 4]],
        [['Innate Lightning Damage: ', 0], ['719 ', 9], ['(62.0% of Dexterity)', 0]],
        [['Shuriken Flurry: Shurikens deal 150% Weapon Damage', 8]],
        [['+5 to Assassin Skill Levels', 3]],
        [['15% Chance to cast level 30 Shuriken Flurry on Melee Attack', 3]],
        [['6% Chance to cast level 5 Arrow on Striking', 3]],
        [['+20% Attack Speed', 3]],
        [['Adds 6-8 Damage', 3]],
        [['+250% Bonus to Attack Rating', 3]],
        [['Adds 160-250 Lightning Damage', 3]],
        [['-22% to Enemy Elemental Resistances', 3]],
        [['+30% to Dexterity', 3]],
        [['+400 to Life', 3]],
        [['Maximum Elemental Resists +1%', 3]],
        [['+2 Life on Striking', 3]],
        [['+125 Life on Melee Attack', 3]],
        [['+40 Required Level', 3]],
        [['Socketed (3/3)', 3]],
      ],
    };

    const extras = extrasFromTswItem(mekanismRow, mekanismDef);
    expect(extras).toEqual([
      '6% Chance to cast level 5 Arrow on Striking',
      '+20% Attack Speed',
      'Adds 6-8 Damage',
      '+250% Bonus to Attack Rating',
      '+125 Life on Melee Attack',
      '+40 Required Level',
    ]);
    expect(extras).not.toContain('Wrist Blade (Sacred)');
    expect(extras.some((line) => /Innate Lightning Damage/i.test(line))).toBe(false);
  });

  it('skips socketed rune name dumps like FelFelFelFalFal', () => {
    const def = {
      id: 'u:zayls-temptation:su',
      name: "Zayl's Temptation",
      baseName: 'Bladed Shield (Sacred)',
      uniqueKind: 'su',
      rarity: 'unique',
      modifiers: [
        '{orange}Regens 15% Life Over 5 Seconds Upon Taking Weapon Damage',
        '+(4 to 6) to Assassin Skill Levels',
        '1% Base Block Chance',
        '-(11 to 15)% to Enemy Elemental Resistances',
        'Slow Target (15 to 25)%',
        '+(180 to 200)% Enhanced Defense',
        'Maximum Elemental Resists +1%',
        'Maximum Block Chance +10%',
        'Requirements +100%',
      ],
    };
    const row = {
      item: "Zayl's Temptation",
      display_name: "Zayl's Temptation",
      type: 'Bladed Shield (SSU)',
      socketables: [
        { name: 'Fel Rune (19)' },
        { name: 'Fel Rune (19)' },
        { name: 'Fel Rune (19)' },
        { name: 'Fal Rune (19)' },
        { name: 'Fal Rune (19)' },
        { name: 'Jewel' },
      ],
      description_lines: [
        [["Zayl's Temptation", 4]],
        [['Bladed Shield (Sacred)', 4]],
        [['FelFelFelFalFal', 4]],
        [['Regens 15% Life Over 5 Seconds Upon Taking Weapon Damage', 8]],
        [['+5 to Assassin Skill Levels', 3]],
        [['+1% Base Block Chance', 3]],
        [['+15% Hit Recovery', 3]],
        [['-13% to Enemy Elemental Resistances', 3]],
        [['Slow Target +23%', 3]],
        [['+10% to Summon Attack Rating', 3]],
        [['+190% Enhanced Defense', 3]],
        [['+1% to Strength', 3]],
        [['+5 to all Attributes', 3]],
        [['Maximum Elemental Resists +1%', 3]],
        [['Maximum Block Chance +10%', 3]],
        [['Requirements +100%', 3]],
        [['Socketed (6/6)', 3]],
      ],
    };

    const extras = extrasFromTswItem(row, def);
    expect(extras).not.toContain('FelFelFelFalFal');
    expect(extras).toEqual(
      expect.arrayContaining([
        '+15% Hit Recovery',
        '+10% to Summon Attack Rating',
        '+1% to Strength',
        '+5 to all Attributes',
      ])
    );
  });

  it('bundles extras, mystic orbs, and ethereal for snapshots', () => {
    expect(tswInstanceExtras(silksRow, silksDef)).toMatchObject({
      ethereal: true,
      mysticOrbs: [
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ],
      extras: expect.arrayContaining(['+35 Required Level']),
    });
  });

  it('strips Trophy Hunter set dump from Conqueror extras but keeps MO leftovers', () => {
    const conquerorDef = {
      id: 's:the-conqueror:sacred-set',
      name: 'The Conqueror',
      rarity: 'set',
      setId: 'set:trophy-hunter',
      setName: 'Trophy Hunter',
      baseName: 'Crown (Sacred)',
      modifiers: [
        '+1 to All Skills',
        'Adds 35-40 Damage',
        '-(11 to 15)% to Enemy Elemental Resistances',
        '+(171 to 200)% Enhanced Defense',
        '+3333 Defense',
        'Magic Resist +(2 to 5)%',
        '(21 to 25)% Gold Find',
      ],
    };
    const setDumpCtx = buildSetDumpSkipContext(conquerorDef, {
      siblingNames: ['The Conqueror', 'Idol of Fortune'],
      setDef: {
        id: 'set:trophy-hunter',
        name: 'Trophy Hunter',
        bonuses: [
          {
            required: 'complete',
            modifiers: [
              '{orange}Medals of Honor',
              '(Based on Trophies)',
              '{grey}+10 Life after each Kill',
              '{grey}+1% Physical Resist',
              '{grey}+5% Magic Find',
              '{grey}+25 to Mana',
              '{grey}+50 to Life',
            ],
          },
        ],
      },
    });
    const row = {
      item: 'The Conqueror',
      display_name: 'The Conqueror',
      type: 'Crown (Sacred)',
      display_quality: 'Set',
      description_lines: [
        [['The Conqueror', 2]],
        [['Crown (Sacred)', 2]],
        [['Defense: ', -1], ['7800', 3]],
        [['Required Level: 150', -1]],
        [['Required Strength: 1012', 1]],
        [['+1 to All Skills', 3]],
        [['Adds 35-40 Damage', 3]],
        [['-15% to Enemy Elemental Resistances', 3]],
        [['+193% Enhanced Defense', 3]],
        [['+3333 Defense', 3]],
        [['Magic Resist +5%', 3]],
        [['23% Gold Find', 3]],
        [['-25% Attack Speed', 3]],
        [['Slow Target +5%', 3]],
        [['+28% to Strength', 3]],
        [['+26% to Strength', 3]],
        [['+26% to Dexterity', 3]],
        [['+20% to Energy', 3]],
        [['Physical Resist +1%', 3]],
        [['Requirements +50%', 3]],
        [['+30 Required Level', 3]],
        [['Socketed (4)', 3]],
        [['Medals of Honor', 0]],
        [['+10 Life after each Kill', 0]],
        [['+1% Physical Resist', 0]],
        [['+5% Magic Find', 0]],
        [['+25 to Mana', 0]],
        [['+50 to Life', 0]],
        [['Trophy Hunter', 8]],
        [['Idol of Fortune', 0]],
      ],
    };

    const extras = extrasFromTswItem(row, conquerorDef, setDumpCtx);
    expect(extras).toEqual(
      expect.arrayContaining([
        '-25% Attack Speed',
        'Slow Target +5%',
        '+28% to Strength',
        '+26% to Strength',
        '+26% to Dexterity',
        '+20% to Energy',
        'Physical Resist +1%',
        'Requirements +50%',
        '+30 Required Level',
      ])
    );
    expect(extras).not.toContain('Medals of Honor');
    expect(extras).not.toContain('+10 Life after each Kill');
    expect(extras).not.toContain('+1% Physical Resist');
    expect(extras).not.toContain('+5% Magic Find');
    expect(extras).not.toContain('+25 to Mana');
    expect(extras).not.toContain('+50 to Life');
    expect(extras).not.toContain('Trophy Hunter');
    expect(extras).not.toContain('Idol of Fortune');
  });

  it('keeps a lone set-bonus-looking jewel extra when no structural dump marker is present', () => {
    const def = {
      id: 's:emerald-earth:sacred-set',
      name: 'Emerald Earth',
      rarity: 'set',
      setId: 'set:rainbow-warrior',
      setName: 'Rainbow Warrior',
      modifiers: ['+125% Enhanced Defense'],
    };
    const setDumpCtx = buildSetDumpSkipContext(def, {
      siblingNames: ['Emerald Earth'],
      setDef: {
        bonuses: [{ required: 'complete', modifiers: ['+50 to Life'] }],
      },
    });
    const extras = extrasFromTswItem(
      {
        display_name: 'Emerald Earth',
        type: 'Bone Helm (Sacred)',
        description_lines: [
          [['Emerald Earth', 2]],
          [['+125% Enhanced Defense', 3]],
          [['+50 to Life', 3]],
        ],
      },
      def,
      setDumpCtx
    );
    expect(extras).toEqual(['+50 to Life']);
  });
});
