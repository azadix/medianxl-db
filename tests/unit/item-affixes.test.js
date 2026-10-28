import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  affixSlotCaps,
  affixWikiTypeMatches,
  calcCraftedAffixLevel,
  calcRareAffixLevel,
  canPickItemAffix,
  JEWEL_AFFIX_BASE,
  craftedAffixCountRange,
  listAffixesForItem,
  loadItemAffixes,
} from '@/items/item-affixes.js';
import { applyCustomOverlayToDef } from '@/items/custom-items.js';
import { parseAffixesWiki } from '../../tools/item_generation/parse-affixes-wiki.mjs';

const SAMPLE = `
| Type | Properties | Min alvl | Max alvl | Req lvl | Group | Found on | Except on | Oskill | Proc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Prefix | +(40 to 50)% Enhanced Defense | 3 | 47 | 3 | 101 | Armors | | | |
| Prefix | +(150 to 160)% Enhanced Defense | 60 | 99 | 56 | 101 | Armors | Any Angelic Armor | | |
| Prefix | +4 to All Skills | 90 | 99 | 66 | 102 | Angelic Helms | | | |
| Prefix | +1 to All Skills | 6 | 68 | 8 | 102 | Amulets, Circlets, Body Armors | Sorceress Body Armors, Any Angelic Armor | | |
| Suffix | +10 to Strength | 1 | 99 | 1 | 201 | Rings | | | |
`;

const helm = {
  id: 'hlm',
  name: 'Full Helm (Sacred)',
  group: 'Helms',
  category: 'armor',
  slot: 'head',
  rarity: 'normal',
  qlvl: 90,
  reqLevel: 30,
};
const angelicHelm = applyCustomOverlayToDef(helm, {
  quality: 'rare',
  angelic: true,
  name: 'Rare Full Helm (Angelic)',
  modifiers: [],
});
const sacredHelm = { ...helm };

describe('parseAffixesWiki', () => {
  it('parses markdown affix rows', () => {
    const rows = parseAffixesWiki(SAMPLE);
    expect(rows.length).toBe(5);
    expect(rows.filter((r) => r.kind === 'prefix').length).toBe(4);
    expect(rows[0].properties).toContain('Enhanced Defense');
    expect(rows[0].foundOn).toEqual(['Armors']);
    expect(rows[1].exceptOn).toEqual(['Any Angelic Armor']);
  });
});

describe('affix level', () => {
  it('matches the wiki quick-reference cells', () => {
    expect(calcRareAffixLevel(85, 80)).toBe(71);
    expect(calcRareAffixLevel(99, 90)).toBe(99);
    expect(calcRareAffixLevel(1, 1)).toBe(1);
    expect(calcRareAffixLevel(70, 60)).toBe(41);
  });

  it('clamps crafted quality level between 71 and 90', () => {
    expect(calcCraftedAffixLevel(99, 10)).toBe(99);
    expect(calcCraftedAffixLevel(85, 80)).toBe(71);
  });

  it('uses rare affix level for crafted jewels without reducing ilvl', () => {
    expect(calcCraftedAffixLevel(99, 1, { jewel: true })).toBe(calcRareAffixLevel(99, 1));
    expect(calcCraftedAffixLevel(120, 1, { jewel: true })).toBe(99);
  });
});

describe('angelic include/exclude', () => {
  it('lets Angelic helms take Angelic Helms prefixes', () => {
    expect(affixWikiTypeMatches('Angelic Helms', angelicHelm)).toBe(true);
    expect(affixWikiTypeMatches('Angelic Scepters', angelicHelm)).toBe(false);
    expect(affixWikiTypeMatches('Angelic Helms', sacredHelm)).toBe(false);
    expect(affixWikiTypeMatches('Any Angelic Armor', angelicHelm)).toBe(true);
    expect(affixWikiTypeMatches('Any Angelic Armor', sacredHelm)).toBe(false);
    expect(affixWikiTypeMatches('Armors', angelicHelm)).toBe(true);
  });
});

describe('slot and group caps', () => {
  it('caps magic at one prefix and one suffix', () => {
    expect(affixSlotCaps('magic', sacredHelm)).toEqual({
      maxPrefix: 1,
      maxSuffix: 1,
      maxTotal: 2,
    });
  });

  it('caps crafted random rare affixes at 1-4 by item level', () => {
    expect(craftedAffixCountRange(20)).toEqual({ minTotal: 1, maxTotal: 4 });
    expect(craftedAffixCountRange(40)).toEqual({ minTotal: 2, maxTotal: 4 });
    expect(craftedAffixCountRange(60)).toEqual({ minTotal: 3, maxTotal: 4 });
    expect(craftedAffixCountRange(80)).toEqual({ minTotal: 4, maxTotal: 4 });
    expect(affixSlotCaps('crafted', sacredHelm, 20)).toEqual({
      maxPrefix: 3,
      maxSuffix: 3,
      maxTotal: 4,
    });
    expect(affixSlotCaps('crafted', JEWEL_AFFIX_BASE, 99)).toEqual({
      maxPrefix: 3,
      maxSuffix: 3,
      maxTotal: 4,
    });
  });

  it('caps rare jewels at four affixes and rares at six', () => {
    expect(affixSlotCaps('rare', JEWEL_AFFIX_BASE, 20)).toEqual({
      maxPrefix: 3,
      maxSuffix: 3,
      maxTotal: 4,
    });
    expect(affixSlotCaps('rare', sacredHelm, 99)).toEqual({
      maxPrefix: 3,
      maxSuffix: 3,
      maxTotal: 6,
    });
  });

  it('rejects a second prefix of the same group on magic items', () => {
    loadItemAffixes(parseAffixesWiki(SAMPLE));
    const skills = listAffixesForItem(angelicHelm, {
      quality: 'magic',
      ilvl: 99,
      kind: 'prefix',
    }).find((row) => row.properties === '+4 to All Skills');
    expect(skills).toBeTruthy();
    const allowed = canPickItemAffix(
      skills,
      angelicHelm,
      99,
      { prefixes: [{ id: skills.id }], suffixes: [] },
      'magic'
    );
    expect(allowed).toBe(false);
  });

  it('rejects two affixes from the same group', () => {
    loadItemAffixes(parseAffixesWiki(SAMPLE));
    const first = listAffixesForItem(sacredHelm, { quality: 'rare', ilvl: 99, kind: 'prefix' }).find(
      (row) => row.group === 101
    );
    expect(first).toBeTruthy();
    expect(
      canPickItemAffix(first, sacredHelm, 99, { prefixes: [{ id: first.id }], suffixes: [] }, 'rare')
    ).toBe(false);
  });
});

describe('catalog smoke', () => {
  it('loads generated item-affixes.json in wiki ballpark counts', () => {
    const data = JSON.parse(
      readFileSync(resolve('public/items/2_14/item-affixes.json'), 'utf8')
    );
    loadItemAffixes(data);
    const prefixes = data.entries.filter((row) => row.kind === 'prefix');
    const suffixes = data.entries.filter((row) => row.kind === 'suffix');
    expect(prefixes.length).toBeGreaterThan(500);
    expect(suffixes.length).toBeGreaterThan(300);
    expect(data.entries.length).toBeGreaterThan(900);

    const plusFour = prefixes.find(
      (row) => row.properties === '+4 to All Skills' && row.foundOn.includes('Angelic Helms')
    );
    expect(plusFour).toBeTruthy();
    expect(
      canPickItemAffix(plusFour, angelicHelm, 99, { prefixes: [], suffixes: [] }, 'rare')
    ).toBe(true);
    expect(
      canPickItemAffix(plusFour, sacredHelm, 99, { prefixes: [], suffixes: [] }, 'rare')
    ).toBe(false);

    const ed = prefixes.find(
      (row) =>
        row.properties.includes('+(150 to 160)% Enhanced Defense') &&
        row.exceptOn.includes('Any Angelic Armor')
    );
    expect(ed).toBeTruthy();
    expect(canPickItemAffix(ed, angelicHelm, 99, { prefixes: [], suffixes: [] }, 'rare')).toBe(
      false
    );
    expect(canPickItemAffix(ed, sacredHelm, 99, { prefixes: [], suffixes: [] }, 'rare')).toBe(true);
  });
});
