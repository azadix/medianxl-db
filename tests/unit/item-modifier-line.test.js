/**
 * @file Orange unique text and grey effect-line parsing.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeModifierLine,
  encodeModifierLine,
  isConditionalModifierLine,
} from '../../src/items/item-modifier-line.js';
import { parseItemStats } from '../../src/items/unique-stats-catalog.js';
import { parseSkillBonusFromModifierLine } from '../../src/items/skill-bonus-from-modifiers.js';
import { parseProcFromModifierLine } from '../../src/items/item-procs.js';
import { parseRequirementsReductionPct } from '../../src/items/item-requirements.js';
import { buildItemTooltipHtml } from '../../src/items/item-tooltip.js';
import { parseSacredUniquesWiki } from '../../tools/item_generation/parse-sacred-uniques-wiki.mjs';
import { htmlToColoredLines } from '../../tools/item_generation/parse-tiered-uniques-wiki.mjs';

describe('item modifier color encoding', () => {
  it('encodes orange and grey prefixes', () => {
    expect(encodeModifierLine('While Using Windform:', 'orange')).toBe(
      '{orange}While Using Windform:'
    );
    expect(encodeModifierLine('+200% to Fire Spell Damage', 'grey')).toBe(
      '{grey}+200% to Fire Spell Damage'
    );
    expect(encodeModifierLine('+1 to All Skills', 'magic')).toBe('+1 to All Skills');
  });

  it('treats grey lines as conditional effects', () => {
    expect(isConditionalModifierLine('{grey}+200% to Fire Spell Damage')).toBe(true);
    expect(isConditionalModifierLine('{orange}+200% Enhanced Weapon Damage')).toBe(false);
    expect(decodeModifierLine('{orange}+200% Enhanced Weapon Damage')).toEqual({
      text: '+200% Enhanced Weapon Damage',
      color: 'orange',
    });
  });
});

describe('wiki orange and grey lines', () => {
  it('keeps orange text, grey effects, and dotted-orange titles', () => {
    const lines = htmlToColoredLines(`
      <span class="item-orange">While Using Windform:<br></span>
      <span class="item-runeword">
        Adds 3 - 5 Fire Damage per 20 Attributes<br>
        +200% to Fire and Lightning Spell Damage<br>
      </span>
      <span class="item-orange">
        <span class="underdotted item-orange" title="5% Chance to Cast on Attack:&#13;Grants 60% damage avoidance for 1.6 seconds.">
          Amazing Grace
        </span><br>
      </span>
      <span class="item-magic">+1 to All Skills<br></span>
    `);
    expect(lines).toEqual([
      { text: 'While Using Windform:', color: 'orange' },
      { text: 'Adds 3 - 5 Fire Damage per 20 Attributes', color: 'grey' },
      { text: '+200% to Fire and Lightning Spell Damage', color: 'grey' },
      { text: 'Amazing Grace', color: 'orange' },
      {
        text: '5% Chance to Cast on Attack: Grants 60% damage avoidance for 1.6 seconds.',
        color: 'grey',
      },
      { text: '+1 to All Skills', color: 'magic' },
    ]);
  });

  it('stores colored unique stats from wiki HTML', () => {
    const html = `
      <p class="genbig"><b>Bows</b></p>
      <table class="uniques">
        <tr><th colspan="4">Long War Bow</th></tr>
        <tr>
          <td><img src="invswb.jpg"></td>
          <td>
            <span class="item-unique margin_bottom"><b>Windforce</b></span><br>
            <span class="item-basic">Required Level: 100<br></span>
            <span class="item-orange">Steady tailwinds follow wherever you go<br></span>
            <span class="item-runeword">(this scales with stamina spent)<br></span>
            <span class="item-magic">30% Movement Speed<br></span>
          </td>
        </tr>
      </table>
    `;
    const [entry] = parseSacredUniquesWiki(html);
    expect(entry.name).toBe('Windforce');
    expect(entry.stats).toContain('{orange}Steady tailwinds follow wherever you go');
    expect(entry.stats).toContain('{grey}(this scales with stamina spent)');
    expect(entry.stats).toContain('30% Movement Speed');
    expect(parseItemStats(entry.stats).modifiers).toEqual([
      '{orange}Steady tailwinds follow wherever you go',
      '{grey}(this scales with stamina spent)',
      '30% Movement Speed',
    ]);
  });
});

describe('always-on parsers skip grey effect lines', () => {
  it('still reads orange skill bonuses and skips grey ones', () => {
    expect(parseSkillBonusFromModifierLine('{orange}+1 to All Skills')).toEqual({
      kind: 'all',
      amount: 1,
    });
    expect(parseSkillBonusFromModifierLine('{grey}+1 to All Skills')).toBeNull();
  });

  it('skips grey procs and requirement cuts', () => {
    expect(
      parseProcFromModifierLine('{grey}5% Chance to cast level 9 Bloodlust on Kill')
    ).toBeNull();
    expect(parseRequirementsReductionPct('{grey}Requirements -20%')).toBe(0);
    expect(parseRequirementsReductionPct('{orange}Requirements -20%')).toBe(20);
  });
});

describe('item tooltip orange and grey mods', () => {
  it('colors orange unique text and grey effect lines', () => {
    const html = buildItemTooltipHtml({
      name: 'Windforce',
      rarity: 'unique',
      category: 'weapons',
      modifiers: [
        '{orange}Steady tailwinds follow wherever you go',
        '{grey}(this scales with stamina spent)',
        '30% Movement Speed',
      ],
    });
    expect(html).toContain('item-mod--orange');
    expect(html).toContain('item-mod--grey');
    expect(html).toContain('Steady tailwinds follow wherever you go');
    expect(html).toContain('(this scales with stamina spent)');
    expect(html).not.toContain('{orange}');
    expect(html).not.toContain('{grey}');
  });

  it('colors orange and grey relic modifiers', () => {
    const html = buildItemTooltipHtml({
      name: 'Relic (Abyss Knight)',
      rarity: 'relic',
      category: 'relics',
      modifiers: [
        '{orange}+1 Extra Abyss Knight',
        '{grey}Spirit Walk Heals an Additional 5% Maximum Life while Carrying All Shaman Relics',
        '+(9 to 19) to Abyss Knight',
      ],
    });
    expect(html).toContain('item-mod--orange');
    expect(html).toContain('item-mod--grey');
    expect(html).toContain('+1 Extra Abyss Knight');
    expect(html).not.toContain('{orange}');
    expect(html).not.toContain('{grey}');
  });
});
