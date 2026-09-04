/**
 * @file Parse raw wiki HTML for sacred uniques and sets.
 */
import { describe, expect, it } from 'vitest';
import { parseItemStats } from '../../src/items/unique-stats-catalog.js';
import { parseSacredUniquesWiki } from '../../tools/parse-sacred-uniques-wiki.mjs';
import { parseSetsWiki } from '../../tools/parse-sets-wiki.mjs';

describe('sacred unique wiki parser', () => {
  it('parses base items and section-based jewelry types', () => {
    const html = `
      <p class="genbig"><b>One-Handed Swords</b></p>
      <table class="uniques">
        <tr><th colspan="4">Short Sword</th></tr>
        <tr>
          <td><img src="invssd.jpg"></td>
          <td>
            <span class="item-unique margin_bottom"><b>The Xiphos</b></span><br>
            <span class="item-basic">Required Level: 60<br></span>
            <span class="item-basic">Innate Lightning Damage:</span>
            <span class="item-magic">(62.0% of Dexterity)<br></span>
            <span class="item-magic">Socketed (3)<br></span>
          </td>
        </tr>
      </table>
      <p class="genbig"><b>Amulets</b></p>
      <table class="uniques">
        <tr>
          <td><img src="invamu1.jpg"></td>
          <td>
            <span class="item-unique margin_bottom"><b>Black Dwarf</b></span><br>
            <span class="item-basic">Required Level: 110<br></span>
          </td>
        </tr>
      </table>
    `;

    expect(parseSacredUniquesWiki(html)).toEqual([
      {
        name: 'The Xiphos',
        quality: 'SU',
        stats:
          'Required Level: 60\nInnate Lightning Damage: (62.0% of Dexterity)\nSocketed (3)',
        type: 'Short Sword (Sacred)',
      },
      {
        name: 'Black Dwarf',
        quality: 'SU',
        stats: 'Required Level: 110',
        type: 'Amulet',
      },
    ]);
  });
});

describe('set wiki parser', () => {
  it('parses bonuses and disambiguates shared class item names', () => {
    const setTable = (setName, className) => `
      <table class="sets">
        <tr>
          <td>
            <span class="item-unique">${setName}<br>(${className} Set)<br></span>
            <span class="item-set">Eye of Wisdom<br></span>
            <span class="item-unique">Set Bonus with complete set:</span><br>
            <span class="item-set">+2 to All Skills<br></span>
          </td>
          <td>
            <img class="frame" src="invamu1.jpg"><br>
            <span class="item-basic">
              <span class="item-set">Eye of Wisdom<br>Amulet<br></span>
              <span class="item-basic">Chance to Block:</span>
              <span class="item-magic">5%<br></span>
              <span class="item-basic">Required Level: 80<br></span>
            </span>
          </td>
        </tr>
      </table>
    `;
    const entries = parseSetsWiki(
      `${setTable('Thunderstorm', 'Amazon Bow')}${setTable('Battle Devices', 'Assassin')}`
    );

    expect(entries.filter((entry) => entry.quality === 'Set')).toEqual([
      {
        name: 'Thunderstorm',
        quality: 'Set',
        stats: 'Set Bonus with complete set:\n+2 to All Skills',
      },
      {
        name: 'Battle Devices',
        quality: 'Set',
        stats: 'Set Bonus with complete set:\n+2 to All Skills',
      },
    ]);
    expect(entries.filter((entry) => entry.quality === 'Sacred Set')).toEqual([
      {
        name: 'Eye of Wisdom (Amazon)',
        quality: 'Sacred Set',
        stats: 'Chance to Block: 5%\nRequired Level: 80',
        setName: 'Thunderstorm',
        type: 'Amulet',
      },
      {
        name: 'Eye of Wisdom (Assassin)',
        quality: 'Sacred Set',
        stats: 'Chance to Block: 5%\nRequired Level: 80',
        setName: 'Battle Devices',
        type: 'Amulet',
      },
    ]);

    const parsed = parseItemStats('Chance to Block:\n5%\n1% Base Block Chance');
    expect(parsed.block).toBe('5%');
    expect(parsed.modifiers).toEqual(['1% Base Block Chance']);
  });
});
