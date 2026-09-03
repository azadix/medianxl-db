/**
 * @file Smoke tests for unique-stats-db catalog conversion.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCatalogFromUniqueStats,
  parseItemStats,
  parseSetBonusStats,
  findBaseForType,
  entryToItemDef,
  resolveCatalogDefId,
} from '../../src/items/unique-stats-catalog.js';

const ROOT = resolve(import.meta.dirname, '../..');

describe('unique-stats-db catalog', () => {
  it('ships unique-stats-db for 2_14 and converts overlays', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    expect(existsSync(resolve(dir, 'unique-stats-db.json'))).toBe(true);
    expect(existsSync(resolve(dir, 'uniqueitems.json'))).toBe(false);
    expect(existsSync(resolve(dir, 'setitems.json'))).toBe(false);
    expect(existsSync(resolve(dir, 'sets.json'))).toBe(false);
    expect(existsSync(resolve(dir, 'runewords.json'))).toBe(false);

    const bases = [
      ...JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8')),
      ...JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8')),
    ];
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items, sets } = buildCatalogFromUniqueStats(db, bases);

    expect(items.length).toBeGreaterThan(500);
    expect(sets.length).toBeGreaterThan(20);

    const grimAll = items.filter((u) => u.name === 'Grim Fang');
    expect(grimAll.map((u) => u.tier).sort()).toEqual([1, 2, 3, 4]);
    const grim = grimAll.find((u) => u.tier === 4);
    expect(grim).toBeTruthy();
    expect(grim.id).toBe('u:grim-fang:tu:4');
    expect(grimAll.find((u) => u.tier === 1)?.id).toBe('u:grim-fang:tu:1');
    expect(grim.baseId).toBeTruthy();
    expect(grim.baseName).toMatch(/Short Sword/i);
    expect(grim.baseType).toBe('Short Sword (4)');
    expect(grim.rarity).toBe('unique');
    expect(grim.uniqueKind).toBe('tiered');
    expect(Array.isArray(grim.modifiers)).toBe(true);
    expect(grim.modifiers.length).toBeGreaterThan(0);

    const hangman = items.find((u) => u.name === 'Hangman');
    expect(hangman?.uniqueKind).toBe('tiered');
    expect(hangman?.tier).toBeUndefined();
    expect(hangman?.id).toBe('u:hangman:tu');

    const ach = items.find((s) => s.name === "Achilios' Eagle Eye");
    expect(ach).toBeTruthy();
    expect(ach.rarity).toBe('set');
    expect(ach.setName).toBe("Achilios' Wake");
    expect(ach.setId).toBe('set:achilios-wake');
    expect(ach.slot).toBe('head');

    const pantheon = sets.find((s) => s.id === 'set:pantheon');
    expect(pantheon?.bonuses?.length).toBeGreaterThan(0);

    const storm = items.find((s) => s.name === 'Elemental Storm');
    expect(storm?.reqDex).toBe(109);
    expect(storm?.modifiers).not.toContain('Required Dexterity:');
    expect(storm?.modifiers).not.toContain('109');

    const avenger = items.find((s) => s.name === "Hadriel's Avenger");
    expect(avenger?.reqStr).toBe(209);
    expect(avenger?.modifiers).not.toContain('Required Strength:');
    expect(avenger?.modifiers).not.toContain('209');

    const leakedReq = items.filter((item) =>
      (item.modifiers || []).some(
        (mod) =>
          /^Required (Level|Strength|Dexterity):?\s*$/i.test(mod) || /^-?\d+$/.test(mod)
      )
    );
    expect(leakedReq.map((item) => item.name)).toEqual([]);
  });

  it('other.json includes quiver bases', () => {
    const other = JSON.parse(
      readFileSync(resolve(ROOT, 'public/items/2_14/other.json'), 'utf8')
    );
    expect(other.some((o) => o.name === 'Arrow Quiver')).toBe(true);
    expect(other.some((o) => o.name === 'Bolt Quiver')).toBe(true);
  });

  it('parses item stats and set bonuses', () => {
    const parsed = parseItemStats(
      'Defense: \n(100 - 200) to (300 - 400)\nRequired Level: 90\nRequired Strength: 100\nItem Level: 1\n+(10 to 20)% Enhanced Defense\nSocketed (4)'
    );
    expect(parsed.reqLevel).toBe(90);
    expect(parsed.reqStr).toBe(100);
    expect(parsed.sockets).toBe(4);
    expect(parsed.defenseDisplay).toContain('100');
    expect(parsed.modifiers).toContain('+(10 to 20)% Enhanced Defense');

    const bonuses = parseSetBonusStats(
      'Set Bonus with 2 or more set items:\n+1 to All Skills\n\nSet Bonus with complete set:\nPhysical Resist 5%'
    );
    expect(bonuses).toEqual([
      { required: 2, modifiers: ['+1 to All Skills'] },
      { required: 'complete', modifiers: ['Physical Resist 5%'] },
    ]);
  });

  it('joins requirement values split onto the next line', () => {
    const storm = parseItemStats(
      'Two-Hand Damage: 59 to 62\n(Sorceress Only)\nRequired Level: 90\nRequired Dexterity: \n109\nItem Level: 1\n+(8 to 10) to All Skills'
    );
    expect(storm.reqDex).toBe(109);
    expect(storm.reqLevel).toBe(90);
    expect(storm.modifiers).toEqual(['+(8 to 10) to All Skills']);
    expect(storm.modifiers).not.toContain('Required Dexterity:');
    expect(storm.modifiers).not.toContain('109');

    const avenger = parseItemStats(
      'One-Hand Damage: 42 to 46\nRequired Level: 90\nRequired Strength: \n209\nItem Level: 1\n+(3 to 4) to Paladin Skill Levels'
    );
    expect(avenger.reqStr).toBe(209);
    expect(avenger.modifiers).toEqual(['+(3 to 4) to Paladin Skill Levels']);
    expect(avenger.modifiers).not.toContain('Required Strength:');
    expect(avenger.modifiers).not.toContain('209');
  });

  it('keeps shield Class % as a parsed block value', () => {
    const parsed = parseItemStats(
      'Defense: 10 to 20\nChance to Block:\nClass\n%\nRequired Level: 1'
    );
    expect(parsed.block).toBe('Class %');
    expect(parsed.modifiers).not.toContain('Class');
    expect(parsed.modifiers).not.toContain('%');
  });

  it('matches bases by type name', () => {
    const bases = [
      { id: 'a1', name: 'Short Sword (1)' },
      { id: 'a', name: 'Short Sword (4)' },
      { id: 'b', name: 'Helm (Sacred)' },
      { id: 'c', name: 'Ring' },
    ];
    expect(findBaseForType('Short Sword (4)', 'TU', bases)?.id).toBe('a');
    expect(findBaseForType('Short Sword (1)', 'TU', bases)?.id).toBe('a1');
    expect(findBaseForType('Helm', 'Sacred Set', bases)?.id).toBe('b');
    expect(findBaseForType('Ring', 'SU', bases)?.id).toBe('c');
  });

  it('suffixes TU overlay ids with the numeric tier', () => {
    const bases = [
      { id: 'a1', name: 'Short Sword (1)', type: 'swd', category: 'weapons', slot: 'arms' },
    ];
    const def = entryToItemDef(
      {
        name: 'Grim Fang',
        quality: 'TU',
        tier: 1,
        type: 'Short Sword (1)',
        stats: 'Required Level: 20\nSocketed (1)\n+10 to Strength',
      },
      bases
    );
    expect(def.id).toBe('u:grim-fang:tu:1');
    expect(def.tier).toBe(1);
    expect(def.baseName).toBe('Short Sword (1)');
  });

  it('resolves legacy u:name:tu ids to T4', () => {
    const byId = { 'u:grim-fang:tu:4': { id: 'u:grim-fang:tu:4' } };
    expect(resolveCatalogDefId('u:grim-fang:tu', byId)).toBe('u:grim-fang:tu:4');
    expect(resolveCatalogDefId('u:grim-fang:tu:4', byId)).toBe('u:grim-fang:tu:4');
    expect(resolveCatalogDefId('u:hangman:tu', { 'u:hangman:tu': { id: 'u:hangman:tu' } })).toBe(
      'u:hangman:tu'
    );
  });
});
